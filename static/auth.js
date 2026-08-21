/* auth.js */

// ── CSRF: añade la cabecera X-CSRF-Token a las peticiones que modifican
//    datos (POST/PUT/PATCH/DELETE) del mismo origen, leyendo la cookie
//    csrf_token que fija el servidor. ─────────────────────────────────
(function () {
  const _fetch = window.fetch.bind(window);
  const leerCookie = n => document.cookie.split('; ').find(c => c.startsWith(n + '='))?.split('=')[1];

  const conToken = opts => {
    const token = leerCookie('csrf_token');
    if (!token) return opts;
    const h = new Headers(opts.headers || {});
    h.set('X-CSRF-Token', token);
    return { ...opts, headers: h };
  };

  // El cuerpo sólo se puede reenviar si es reutilizable. Un ReadableStream
  // ya consumido no lo es, así que en ese caso no se reintenta.
  const reenviable = b => b == null || typeof b === 'string' ||
    b instanceof FormData || b instanceof URLSearchParams || b instanceof Blob;

  window.fetch = async function (url, opts = {}) {
    const metodo = (opts.method || 'GET').toUpperCase();
    const modifica = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo);
    const mismoOrigen = typeof url === 'string' && (url.startsWith('/') || url.startsWith(location.origin));
    if (!modifica || !mismoOrigen) return _fetch(url, opts);

    let resp = await _fetch(url, conToken(opts));
    if (resp.status !== 403 || !reenviable(opts.body)) return resp;

    // Si la sesión se perdió, el servidor acuña un token nuevo y rechaza
    // esta misma petición contra él. Se refresca la cookie y se reintenta
    // una vez, para que el usuario no vea un error que se arregla solo.
    let esCsrf = false;
    try { esCsrf = !!(await resp.clone().json()).csrf; } catch {}
    if (!esCsrf) return resp;

    // El token del reintento se toma del CUERPO de /api/csrf, no de la
    // cookie: en localhost las cookies se comparten entre puertos, así que
    // otra instancia de la app corriendo en otro puerto puede pisar la
    // cookie en cualquier momento. El cuerpo es siempre el de ESTE servidor.
    let nuevo = '';
    try {
      const r2 = await _fetch('/api/csrf', { credentials: 'same-origin' });
      nuevo = (await r2.json()).csrf_token || '';
    } catch { return resp; }
    if (!nuevo) return resp;
    const h2 = new Headers(opts.headers || {});
    h2.set('X-CSRF-Token', nuevo);
    return _fetch(url, { ...opts, headers: h2 });
  };
})();

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Confirmación propia (reemplaza el confirm() nativo, que el navegador
//    puede bloquear en silencio y hacer que "no pase nada") ──────────
function confirmar(mensaje, textoOk = 'Confirmar', peligro = false) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'dlg-overlay';
    ov.innerHTML = `
      <div class="dlg-box">
        <p style="font-size:14px;color:var(--text);line-height:1.5;margin-bottom:20px">${mensaje}</p>
        <div class="dlg-actions">
          <button class="dlg-btn dlg-primary" data-ok
                  style="${peligro ? 'background:var(--red-2);color:#fff' : ''}">${textoOk}</button>
          <button class="dlg-btn dlg-secondary" data-cancel>Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const done = v => { ov.remove(); resolve(v); };
    ov.querySelector('[data-ok]').onclick = () => done(true);
    ov.querySelector('[data-cancel]').onclick = () => done(false);
    ov.addEventListener('click', e => { if (e.target === ov) done(false); });
  });
}

// ── Loading ───────────────────────────────────────────────
function showLoading() {
  const el = document.createElement('div');
  el.className = 'loading-overlay'; el.id = 'loading-overlay';
  el.innerHTML = '<div class="loading-spinner"></div>';
  document.body.appendChild(el);
}
function hideLoading() {
  document.getElementById('loading-overlay')?.remove();
}

async function getMe() {
  const res = await fetch('/api/auth/me');
  return res.json();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

function irHome()     { window.location.href = '/'; }               // feed (nuevo inicio)
function irCarpetas() { window.location.href = '/dashboard.html'; } // carpetas / categorías (logo)
function irAtras()    { history.back(); }

async function renderSessionBar() {
  const bar = document.getElementById('session-bar');
  if (!bar) return {};
  const me = await getMe();

  const navEl = document.getElementById('navbar-nav');
  if (navEl) {
    navEl.innerHTML = `
      <button class="nav-btn nav-btn-back" onclick="irAtras()" title="Volver" aria-label="Volver">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        <span>Volver</span>
      </button>
      <button class="nav-btn nav-btn-home" onclick="irHome()" title="Inicio" aria-label="Inicio">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>Inicio</span>
      </button>
    `;
  }

  if (me.autenticado) {
    bar.innerHTML = `
      <div class="session-primary">
      <span class="session-nombre">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
        <span>${me.nombre}</span>
        <span class="session-badge">${['Super Admin','Admin','Estándar','Restringido'][me.perfil]}</span>
      </span>
      <button class="btn-top btn-logout" onclick="window.location.href='/perfil.html'" title="Mi perfil" aria-label="Mi perfil" style="border-color:var(--border);color:var(--text-2)">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        <span>Mi perfil</span>
      </button>
      ${(me.perfil === 0 || me.perfil === 1) ? `
        <button class="btn-top btn-admin" onclick="window.location.href='/admin.html'" title="Administración" aria-label="Administración">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>Administración</span>
        </button>` : ''}
      <button class="btn-top btn-logout" onclick="window.location.href='/soporte.html'" title="Soporte">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
        <span>Soporte</span>
      </button>
      </div>
    `;
  } else {
    bar.innerHTML = `
      <div class="session-primary">
      <button class="btn-top btn-login" onclick="window.location.href='/index.html'" title="Iniciar sesión" aria-label="Iniciar sesión">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>
        <span>Iniciar sesión</span>
      </button>
      <button class="btn-top btn-register" onclick="window.location.href='/register.html'" title="Registrarse" aria-label="Registrarse">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
        <span>Registrarse</span>
      </button>
      <button class="btn-top btn-logout" onclick="window.location.href='/soporte.html'" title="Soporte">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
        <span>Soporte</span>
      </button>
      </div>
    `;
  }
  // Botón de donaciones: sólo aparece si el admin configuró un enlace de
  // PayPal válido y lo dejó activo. Abre en pestaña nueva; la app no
  // interviene en el pago.
  montarBotonDonar();

  // Agregar toggle de modo claro/oscuro y selector de tema
  const sessionBar = document.getElementById('session-bar');
  if (sessionBar && typeof crearToggleModo === 'function') {
    sessionBar.appendChild(crearToggleModo());
  }
  if (sessionBar && typeof crearSelectorTema === 'function') {
    sessionBar.appendChild(crearSelectorTema());
  }

  // Icono de cerrar sesión en la barra superior (queda visible siempre,
  // incluso en móvil donde los demás botones se mueven al menú inferior).
  if (sessionBar && me.autenticado) {
    const btnSalir = document.createElement('button');
    btnSalir.className = 'btn-top btn-logout logout-top';
    btnSalir.title = 'Cerrar sesión';
    btnSalir.setAttribute('aria-label', 'Cerrar sesión');
    btnSalir.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>';
    btnSalir.addEventListener('click', logout);
    sessionBar.appendChild(btnSalir);
  }

  if (sessionBar && me.autenticado) initNotificaciones(sessionBar);

  renderBottomNav(me);
  return me;
}

/* ── Notificaciones ─────────────────────────────────────── */
function initNotificaciones(sessionBar) {
  // Campana siempre visible (también en móvil), antes del botón de salir.
  const btn = document.createElement('button');
  btn.className = 'btn-top btn-logout btn-notif logout-top';
  btn.id = 'btn-notif';
  btn.title = 'Notificaciones'; btn.setAttribute('aria-label', 'Notificaciones');
  btn.style.position = 'relative';
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
    <span class="notif-badge hidden" id="notif-badge">0</span>`;
  // Insertar antes del botón de cerrar sesión si ya existe; si no, al final.
  const salir = sessionBar.querySelector('.logout-top:not(.btn-notif)');
  sessionBar.insertBefore(btn, salir || null);
  actualizarBadgeNotif();
  btn.addEventListener('click', e => { e.stopPropagation(); togglePanelNotif(); });
}

async function actualizarBadgeNotif() {
  try {
    const d = await fetch('/api/notificaciones/count').then(r => r.json());
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (d.no_leidas > 0) { badge.textContent = d.no_leidas > 99 ? '99+' : d.no_leidas; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  } catch {}
}

async function togglePanelNotif() {
  let panel = document.getElementById('notif-panel');
  if (panel) { panel.remove(); return; }
  panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.className = 'notif-panel';
  panel.innerHTML = '<div class="notif-head">Notificaciones</div><div class="notif-lista"><p class="notif-cargando">Cargando...</p></div>';
  document.body.appendChild(panel);
  // Posicionar bajo la campana
  const btn = document.getElementById('btn-notif');
  const r = btn.getBoundingClientRect();
  panel.style.top = (r.bottom + 8) + 'px';
  panel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  // Cerrar al hacer clic fuera
  setTimeout(() => document.addEventListener('click', cerrarPanelNotifFuera), 0);

  let data;
  try { data = await fetch('/api/notificaciones').then(r => r.json()); } catch { data = { items: [] }; }
  const lista = panel.querySelector('.notif-lista');
  if (!data.items.length) {
    lista.innerHTML = '<p class="notif-vacio">No tienes notificaciones.</p>';
  } else {
    lista.innerHTML = data.items.map(n => `
      <a class="notif-item ${n.leida ? '' : 'no-leida'}" href="${n.enlace || '#'}">
        <span class="notif-ico">${n.tipo === 'seguir' ? '👤' : n.tipo === 'like' ? '❤️' : n.tipo === 'repost' ? '🔁' : '💬'}</span>
        <span class="notif-txt">${n.texto}<span class="notif-fecha">${n.fecha}</span></span>
      </a>`).join('');
  }
  // Marcar como leídas
  try { await fetch('/api/notificaciones/leer', { method: 'POST' }); actualizarBadgeNotif(); } catch {}
}

function cerrarPanelNotifFuera(e) {
  const panel = document.getElementById('notif-panel');
  if (panel && !panel.contains(e.target) && e.target.id !== 'btn-notif') {
    panel.remove();
    document.removeEventListener('click', cerrarPanelNotifFuera);
  }
}

/* ── Menú inferior flotante (móvil / tablet) ──────────────
   Solo iconos. El + central es para subir. Se muestra vía CSS
   únicamente en pantallas pequeñas; en escritorio queda oculto. */
const ICONS = {
  home:    '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  guardados:'<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  soporte: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  perfil:  '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/>',
  login:   '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
  registrar:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  admin:   '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  plus:    '<path d="M12 5v14"/><path d="M5 12h14"/>',
};

function svgIcon(paths, size = 22) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function renderBottomNav(me) {
  document.getElementById('mobile-nav')?.remove();
  const path = window.location.pathname;
  const esInicio = path === '/' || path.endsWith('/feed.html');

  // Acción del botón + (subir). Se maneja por click (abre el modal en el lugar).
  const puedeSubir = me.autenticado && (me.perfil === 0 || me.perfil === 1 || me.puede_subir);

  const items = [];
  items.push({ href: '/', icon: 'home', label: 'Inicio', activo: esInicio });

  if (me.autenticado) {
    if (me.perfil === 0 || me.perfil === 1) {
      items.push({ href: '/admin.html', icon: 'admin', label: 'Administración', activo: path.endsWith('/admin.html') });
    } else {
      items.push({ href: '/perfil.html', icon: 'guardados', label: 'Guardados', activo: false });
    }
  } else {
    items.push({ href: '/soporte.html', icon: 'soporte', label: 'Soporte', activo: path.endsWith('/soporte.html') });
  }

  items.push({ href: '#', icon: 'plus', label: 'Subir', center: true });

  if (me.autenticado) {
    items.push({ href: '/soporte.html', icon: 'soporte', label: 'Soporte', activo: path.endsWith('/soporte.html') });
    items.push({ href: '/perfil.html', icon: 'perfil', label: 'Mi perfil', activo: path.endsWith('/perfil.html') });
  } else {
    items.push({ href: '/index.html', icon: 'login', label: 'Ingresar', activo: path.endsWith('/index.html') });
    items.push({ href: '/register.html', icon: 'registrar', label: 'Registrarse', activo: path.endsWith('/register.html') });
  }

  const nav = document.createElement('nav');
  nav.className = 'mobile-nav';
  nav.id = 'mobile-nav';
  nav.innerHTML = items.map(it =>
    `<a href="${it.href}" class="${it.center ? 'center' : ''} ${it.activo ? 'activo' : ''}" aria-label="${it.label}" title="${it.label}">${svgIcon(ICONS[it.icon], it.center ? 26 : 22)}</a>`
  ).join('');
  document.body.appendChild(nav);

  // El + abre el modal de subida EN EL LUGAR (no navega). Según sesión/permiso:
  const centro = nav.querySelector('a.center');
  if (centro) {
    centro.addEventListener('click', e => {
      e.preventDefault();
      if (!me.autenticado) mostrarDialogoSubir();
      else if (puedeSubir) abrirModalSubida();
      else showToast('No tienes permiso para subir archivos.', 'error');
    });
  }
}

/* Diálogo: se requiere cuenta para subir archivos. */
function mostrarDialogoSubir() {
  if (document.getElementById('dlg-subir')) return;
  const ov = document.createElement('div');
  ov.className = 'dlg-overlay';
  ov.id = 'dlg-subir';
  ov.innerHTML = `
    <div class="dlg-box">
      <div class="dlg-icon">${svgIcon(ICONS.plus, 26)}</div>
      <p class="dlg-title">Inicia sesión para subir</p>
      <p class="dlg-text">Necesitas una cuenta para subir archivos al archivo. Inicia sesión o regístrate — es gratis.</p>
      <div class="dlg-actions">
        <a class="dlg-btn dlg-primary" href="/index.html">Iniciar sesión</a>
        <a class="dlg-btn dlg-secondary" href="/register.html">Registrarse</a>
      </div>
      <button class="dlg-close" type="button">Cancelar</button>
    </div>`;
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
  ov.querySelector('.dlg-close').addEventListener('click', cerrar);
}

/* ── Modal de subida (disponible en toda la app, se abre en el lugar) ── */
const EXTENSIONES = {
  imagen: ['jpg','jpeg','png','gif','webp','bmp','svg'],
  video:  ['mp4','mov','avi','mkv','webm','wmv'],
  audio:  ['mp3','wav','ogg','flac','m4a','aac']
};
const TODAS_EXT = [...EXTENSIONES.imagen, ...EXTENSIONES.video, ...EXTENSIONES.audio];
function getExt(nombre) { return nombre.split('.').pop().toLowerCase(); }
function detectarTipo(ext) {
  if (EXTENSIONES.imagen.includes(ext)) return 'imagen';
  if (EXTENSIONES.video.includes(ext))  return 'video';
  if (EXTENSIONES.audio.includes(ext))  return 'audio';
  return null;
}

// Lee el tamaño real de la foto elegida y avisa de cómo quedará el post.
function medirYAvisar(file, el) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const { width: w, height: h } = img;
    URL.revokeObjectURL(url);
    const alto = Math.min(810, Math.round(540 * h / w));
    const partes = [`Imagen ${w} × ${h}`, `se verá a 540 × ${alto} px`];
    if (w > 2048 || h > 3072) partes.push('se reducirá a 2048 × 3072 máx.');
    if (h / w > 1.5) partes.push('más alta que 2:3: se ajustará al tope');
    el.textContent = partes.join(' · ');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

const IC_CORAZON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>';

async function montarBotonDonar() {
  const bar = document.getElementById('session-bar');
  if (!bar || document.getElementById('btn-donar')) return;
  let d;
  try { d = await fetch('/api/donaciones').then(r => r.json()); }
  catch { return; }
  if (!d.activo || !d.url) return;

  const a = document.createElement('a');
  a.id = 'btn-donar';
  a.className = 'btn-top btn-donar';
  a.href = d.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';   // el destino no puede tocar esta pestaña
  a.title = d.texto || 'Donar';
  a.setAttribute('aria-label', a.title);
  a.innerHTML = IC_CORAZON + `<span>${(d.texto || 'Donar').replace(/[<>&"]/g, '')}</span>`;

  // Antes del grupo de modo/tema, para que quede junto a las acciones.
  const primero = bar.querySelector('.modo-btn, .tema-btn, .btn-notif, .logout-top');
  bar.insertBefore(a, primero || null);
}

/* Las categorías cambian muy de vez en cuando, pero cada apertura de un
   modal las pedía por red: el diálogo tardaba ~1 s en aparecer. Se piden
   una vez, se guardan en memoria y se refrescan en segundo plano, así el
   modal abre al instante y aun así los datos se mantienen al día. */
let _catsCache = null;
let _catsPeticion = null;

function categoriasCacheadas() {
  return _catsCache;
}

function pedirCategorias({ forzar = false } = {}) {
  if (_catsCache && !forzar) {
    // Refresco silencioso para la próxima apertura.
    if (!_catsPeticion) {
      _catsPeticion = fetch('/api/categorias').then(r => r.json())
        .then(d => { _catsCache = d; return d; })
        .catch(() => _catsCache)
        .finally(() => { _catsPeticion = null; });
    }
    return Promise.resolve(_catsCache);
  }
  if (!_catsPeticion) {
    _catsPeticion = fetch('/api/categorias').then(r => r.json())
      .then(d => { _catsCache = d; return d; })
      .finally(() => { _catsPeticion = null; });
  }
  return _catsPeticion;
}

// Se precalienta en cuanto la página está lista: cuando el usuario pulse
// "+", la lista ya estará en memoria.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => pedirCategorias().catch(() => {}));
} else {
  pedirCategorias().catch(() => {});
}

async function abrirModalSubida(catDefault) {
  const existente = document.getElementById('modal-subida');
  if (existente) { existente.classList.remove('hidden'); return; }

  // Si ya están en memoria el modal se pinta sin esperar a la red.
  let cats = categoriasCacheadas();
  if (!cats) {
    try { cats = await pedirCategorias(); }
    catch { cats = ['Fantasmas','Duendes','Exorcismo','Poltergeist','Psicofonias','Ouija','Animales','Brujeria','Modo Incognito']; }
  } else {
    pedirCategorias();          // refresca de fondo, sin bloquear
  }


/* ══ ENCUADRE DE LA SUBIDA ══
   El formato del marco viene predefinido: quien sube sólo decide QUÉ parte
   del medio queda dentro, arrastrando. No se recorta el fichero —para vídeo
   haría falta recodificar, y eso degradaría la calidad— sino que se guarda
   la proporción y la posición, y se aplican al mostrarlo. */
const ENC = {
  activo: false,      // hay bloque de encuadre en pantalla
  aspecto: null,      // "4:5", "16:9"…
  posiciones: [],     // "50% 40%" por fichero, en el orden de envío
  urls: [],           // object URLs a revocar al cerrar
};

function limpiarEncuadre() {
  // Parar antes de soltar la URL: si no, el vídeo sigue sonando/decodificando
  // sobre una fuente que acaba de dejar de existir.
  document.querySelectorAll('.enc-marco video').forEach(v => { try { v.pause(); } catch {} });
  ENC.urls.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
  ENC.activo = false; ENC.aspecto = null; ENC.posiciones = []; ENC.urls = [];
  document.getElementById('bloque-encuadre')?.replaceChildren();
}

// Topes de subida vigentes. Se piden al servidor en vez de repetirlos
// aquí: al cambiarlos en Administración, el panel seguía rechazando con
// los valores viejos escritos a mano.
const LIMITES_POR_DEFECTO = { imagen: 20, galeria: 10, video: 50, audio: 10,
                              max_fotos: 10, max_pistas: 20 };
let LIMITES = { ...LIMITES_POR_DEFECTO };

async function cargarLimites() {
  try {
    const d = await fetch('/api/limites').then(r => r.json());
    if (d && typeof d.imagen === 'number') LIMITES = { ...LIMITES_POR_DEFECTO, ...d };
  } catch { /* si falla, quedan los de reserva */ }
  return LIMITES;
}

async function aspectosDisponibles() {
  if (aspectosDisponibles._c) return aspectosDisponibles._c;
  try { aspectosDisponibles._c = await fetch('/api/aspectos').then(r => r.json()); }
  catch { aspectosDisponibles._c = { imagen: ['16:9','5:4','1:1','4:5'],
                                     video: ['16:9','5:4','7:5','4:3','5:3','3:2'],
                                     recomendado: { imagen: '1:1', video: '16:9' } }; }
  return aspectosDisponibles._c;
}

async function montarEncuadre(files, tipo) {
  const cont = document.getElementById('bloque-encuadre');
  if (!cont) return;
  limpiarEncuadre();
  // Sólo lo que se ve tiene encuadre: audio y texto no.
  if (!files.length || (tipo !== 'imagen' && tipo !== 'video')) return;

  const datos = await aspectosDisponibles();
  const lista = datos[tipo] || [];
  if (!lista.length) return;
  // Se parte del recomendado; si no llegara, del primero de la lista.
  const recomendado = (datos.recomendado || {})[tipo] || lista[0];

  ENC.activo = true;
  ENC.aspecto = lista.includes(recomendado) ? recomendado : lista[0];
  ENC.posiciones = files.map(() => '50% 50%');

  const esVideo = tipo === 'video';
  cont.innerHTML = `
    <label>Encuadre <span class="opcional">(arrastra sobre cada archivo para elegir qué se ve)</span></label>
    <div class="enc-chips" role="group" aria-label="Proporción">
      ${lista.map(a => `<button type="button" class="enc-chip${a === ENC.aspecto ? ' activo' : ''}${a === recomendado ? ' recomendado' : ''}"
              data-ar="${a}"${a === recomendado ? ' title="Recomendado"' : ''}>${a}${a === recomendado ? '<span class="enc-rec">recomendado</span>' : ''}</button>`).join('')}
    </div>
    <div class="enc-lista">
      ${files.map((f, i) => {
        const url = URL.createObjectURL(f); ENC.urls.push(url);
        const medio = esVideo
          ? `<video src="${url}" muted loop playsinline preload="metadata"></video>
             <div class="enc-ctrl">
               <button type="button" class="enc-play" aria-label="Reproducir">${PICON.play}</button>
               <input type="range" class="enc-seek" min="0" max="1000" value="0"
                      aria-label="Posición del vídeo">
             </div>`
          : `<img src="${url}" alt="">`;
        return `<figure class="enc-item">
                  <div class="enc-marco" data-i="${i}" style="aspect-ratio:${ENC.aspecto.replace(':','/')}">
                    ${medio}<span class="enc-guias" aria-hidden="true"></span>
                  </div>
                  <figcaption class="enc-nombre" title="${(f.name||'').replace(/"/g,'&quot;')}">${f.name || ''}</figcaption>
                </figure>`;
      }).join('')}
    </div>
    <p class="enc-nota">Se guarda la proporción y el encuadre; el archivo original no se recorta ni se recomprime.</p>`;

  // Cambiar de proporción reencuadra todos los marcos a la vez.
  cont.querySelectorAll('.enc-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      cont.querySelectorAll('.enc-chip').forEach(c => c.classList.remove('activo'));
      chip.classList.add('activo');
      ENC.aspecto = chip.dataset.ar;
      cont.querySelectorAll('.enc-marco').forEach(m => {
        m.style.aspectRatio = ENC.aspecto.replace(':', '/');
      });
    });
  });

  // Arrastre: mueve la posición del medio dentro del marco. Con
  // `object-fit: cover` sólo se desplaza el eje que sobra, que es
  // justamente el que se puede encuadrar.
  cont.querySelectorAll('.enc-marco').forEach(marco => {
    const medio = marco.querySelector('img, video');
    const i = +marco.dataset.i;
    let x = 50, y = 50, sx = 0, sy = 0, arrastrando = false;
    const pintar = () => {
      medio.style.objectPosition = `${x}% ${y}%`;
      ENC.posiciones[i] = `${x.toFixed(1)}% ${y.toFixed(1)}%`;
    };
    const tope = v => Math.min(100, Math.max(0, v));
    marco.addEventListener('pointerdown', e => {
      arrastrando = true; sx = e.clientX; sy = e.clientY;
      marco.setPointerCapture(e.pointerId); marco.classList.add('arrastrando');
      e.preventDefault();
    });
    marco.addEventListener('pointermove', e => {
      if (!arrastrando) return;
      const r = marco.getBoundingClientRect();
      x = tope(x - ((e.clientX - sx) / r.width) * 100);
      y = tope(y - ((e.clientY - sy) / r.height) * 100);
      sx = e.clientX; sy = e.clientY;
      pintar();
    });
    const soltar = e => {
      arrastrando = false; marco.classList.remove('arrastrando');
      try { marco.releasePointerCapture(e.pointerId); } catch {}
    };
    marco.addEventListener('pointerup', soltar);
    marco.addEventListener('pointercancel', soltar);
    pintar();

    // Vídeo: se puede reproducir mientras se ajusta el encuadre, para
    // elegir el recorte viendo el movimiento y no un fotograma suelto.
    const play = marco.querySelector('.enc-play');
    const seek = marco.querySelector('.enc-seek');
    if (!play) return;

    // Los controles viven dentro del marco, que es quien escucha el
    // arrastre: sin esto, tocar el botón empezaría a mover el encuadre.
    [play, seek].forEach(el => {
      el.addEventListener('pointerdown', e => e.stopPropagation());
      el.addEventListener('click', e => e.stopPropagation());
    });

    const pintarBoton = () => {
      play.innerHTML = medio.paused ? PICON.play : PICON.pause;
      play.setAttribute('aria-label', medio.paused ? 'Reproducir' : 'Pausar');
      marco.classList.toggle('reproduciendo', !medio.paused);
    };
    play.addEventListener('click', () => {
      if (medio.paused) medio.play().catch(() => {}); else medio.pause();
      pintarBoton();
    });
    medio.addEventListener('play',  pintarBoton);
    medio.addEventListener('pause', pintarBoton);
    medio.addEventListener('timeupdate', () => {
      if (seek.dataset.arrastrando || !medio.duration) return;
      seek.value = Math.round((medio.currentTime / medio.duration) * 1000);
    });
    seek.addEventListener('input', () => {
      if (medio.duration) medio.currentTime = (seek.value / 1000) * medio.duration;
    });
    seek.addEventListener('pointerdown', () => { seek.dataset.arrastrando = '1'; });
    const finSeek = () => { delete seek.dataset.arrastrando; };
    seek.addEventListener('pointerup', finSeek);
    seek.addEventListener('pointercancel', finSeek);
  });
}

  await cargarLimites();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.id = 'modal-subida';
  overlay.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="modal-close-btn">✕</button>
      <p class="modal-title">Nueva publicación</p>
      <p class="modal-subtitle">Formatos: JPG, PNG, GIF, WEBP, MP4, MOV, AVI, MKV, MP3, WAV, OGG, FLAC, M4A</p>
      <form id="upload-form">
        <label>Archivo <span class="opcional">(opcional — déjalo vacío para publicar solo texto)</span></label>
        <input type="file" id="archivo-input" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.mp4,.mov,.avi,.mkv,.webm,.wmv,.mp3,.wav,.ogg,.flac,.m4a,.aac">
        <p class="hint-galeria">
          <strong>Fotos:</strong> ${LIMITES.imagen} MB máx. El tope es 2048 × 3072 px
          y las mayores se reducen solas.<br>
          <strong>Vídeo:</strong> ${LIMITES.video} MB máx.<br>
          <strong>Varias a la vez:</strong> fotos → galería (${LIMITES.max_fotos} máx.,
          ${LIMITES.galeria} MB cada una); audios → lista (${LIMITES.audio} MB por pista,
          ${LIMITES.max_pistas} máx., una publicación de audio al día).
        </p>
        <p class="tipo-detectado" id="tipo-detectado"></p>
        <p class="error-msg hidden" id="ext-error">Extensión no permitida. Solo imágenes, videos y audios.</p>

        <div id="bloque-encuadre" class="bloque-encuadre"></div>

        <label>Categoría <span style="color:var(--red)">*</span></label>
        <select id="categoria-input" required>
          <option value="">— Selecciona una categoría —</option>
          ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <div class="aviso-incognito hidden" id="aviso-incognito">
          <strong>Modo Incógnito:</strong> Tu nombre de usuario no será visible en esta publicación.
        </div>

        <label>Asunto <span style="color:var(--red)">*</span></label>
        <input type="text" id="asunto-input" maxlength="200" placeholder="Título o asunto del archivo" required>

        <div id="campo-artista" class="hidden">
          <label>Artista</label>
          <input type="text" id="artista-input" maxlength="120" placeholder="Intérprete o fuente del audio">
        </div>

        <label>Descripción / texto</label>
        <textarea id="desc-input" rows="3" maxlength="20000" placeholder="Descripción, o el cuerpo de la publicación si no adjuntas archivo..."></textarea>
        <p class="word-count" id="word-count">0 / 200 palabras</p>

        <p class="error-msg hidden" id="form-error"></p>
        <button type="submit" class="btn-confirmar">Publicar</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);

  const cerrar = () => { limpiarEncuadre(); overlay.remove(); };
  document.getElementById('modal-close-btn').addEventListener('click', cerrar);
  overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
  if (catDefault) document.getElementById('categoria-input').value = catDefault;

  document.getElementById('archivo-input').addEventListener('change', e => {
    const files = [...e.target.files];
    const extEl = document.getElementById('ext-error');
    const tipoEl = document.getElementById('tipo-detectado');
    if (!files.length) return;

    const mala = files.find(f => !TODAS_EXT.includes(getExt(f.name)));
    if (mala) { extEl.classList.remove('hidden'); tipoEl.textContent = ''; e.target.value = ''; limpiarEncuadre(); return; }
    extEl.classList.add('hidden');

    const tipos = new Set(files.map(f => detectarTipo(getExt(f.name))));
    const soloAudio = tipos.size === 1 && tipos.has('audio');
    // El campo Artista sólo tiene sentido en publicaciones de audio.
    document.getElementById('campo-artista').classList.toggle('hidden', !soloAudio);

    montarEncuadre(files, tipos.size === 1 ? [...tipos][0] : null);

    if (files.length === 1) {
      const tipo = [...tipos][0];
      tipoEl.textContent = tipo ? 'Tipo detectado: ' + tipo : '';
      tipoEl.style.color = '';
      // Con una foto suelta se avisa de la proporción, que decide el alto
      // del post (1:1 → 540, 2:3 → 810, 16:9 → 304 px).
      if (tipo === 'imagen') medirYAvisar(files[0], tipoEl);
      return;
    }
    // Varios archivos: o todas fotos (galería) o todas pistas (lista).
    if (tipos.size > 1) {
      tipoEl.textContent = 'Al elegir varios archivos, todos deben ser del mismo tipo: fotos para una galería, o audios para una lista.';
      tipoEl.style.color = 'var(--red)';
      e.target.value = '';
      document.getElementById('campo-artista').classList.add('hidden');
      limpiarEncuadre();
      return;
    }
    if (!soloAudio && !tipos.has('imagen')) {
      tipoEl.textContent = 'Sólo se pueden agrupar imágenes o audios.';
      tipoEl.style.color = 'var(--red)';
      e.target.value = '';
      return;
    }
    tipoEl.style.color = '';
    tipoEl.textContent = soloAudio
      ? 'Lista de ' + files.length + ' pistas'
      : 'Galería de ' + files.length + ' fotos';
  });

  document.getElementById('categoria-input').addEventListener('change', e => {
    const av = document.getElementById('aviso-incognito');
    e.target.value === 'Modo Incognito' ? av.classList.remove('hidden') : av.classList.add('hidden');
  });

  document.getElementById('desc-input').addEventListener('input', e => {
    const words = e.target.value.trim().split(/\s+/).filter(Boolean).length;
    const wc = document.getElementById('word-count');
    wc.textContent = words + ' / 200 palabras';
    wc.style.color = words > 200 ? 'var(--red)' : 'var(--text-3)';
  });

  document.getElementById('upload-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.classList.add('hidden');
    const archivos = [...document.getElementById('archivo-input').files];
    const archivo = archivos[0];
    const esGaleria = archivos.length > 1;
    const categoria = document.getElementById('categoria-input').value;
    const asunto = document.getElementById('asunto-input').value.trim();
    const desc = document.getElementById('desc-input').value.trim();

    const esTexto = archivos.length === 0;
    if (!categoria) { errEl.textContent = 'Debes seleccionar una categoría.'; errEl.classList.remove('hidden'); return; }
    if (!asunto) { errEl.textContent = 'El asunto es obligatorio.'; errEl.classList.remove('hidden'); return; }
    if (esTexto && !asunto && !desc) {
      errEl.textContent = 'Escribe un texto o adjunta un archivo.'; errEl.classList.remove('hidden'); return;
    }
    const malaExt = archivos.find(f => !TODAS_EXT.includes(getExt(f.name)));
    if (malaExt) { errEl.textContent = 'Extensión de archivo no permitida.'; errEl.classList.remove('hidden'); return; }
    // El límite de 200 palabras aplica a la descripción que acompaña a un
    // archivo; en una publicación de texto el cuerpo es el contenido.
    const words = desc.split(/\s+/).filter(Boolean).length;
    if (!esTexto && words > 200) { errEl.textContent = 'La descripción supera las 200 palabras.'; errEl.classList.remove('hidden'); return; }

    const tiposSel = new Set(archivos.map(f => detectarTipo(getExt(f.name))));
    const hayAudio = tiposSel.has('audio');

    if (esGaleria && tiposSel.size > 1) {
      errEl.textContent = 'Al subir varios, todos deben ser del mismo tipo.'; errEl.classList.remove('hidden'); return;
    }
    // Los topes salen de la configuración del sitio, no de números fijos.
    const MB = n => n * 1024 * 1024;
    if (hayAudio) {
      // El límite de una publicación de audio al día lo valida el
      // servidor, que es quien conoce el historial.
      const pesada = archivos.find(f => f.size > MB(LIMITES.audio));
      if (pesada) { errEl.textContent = `Cada pista de audio puede pesar como máximo ${LIMITES.audio} MB (${pesada.name}).`; errEl.classList.remove('hidden'); return; }
      if (archivos.length > LIMITES.max_pistas) { errEl.textContent = `Máximo ${LIMITES.max_pistas} pistas por lista.`; errEl.classList.remove('hidden'); return; }
    } else if (esGaleria) {
      if (archivos.length > LIMITES.max_fotos) { errEl.textContent = `Máximo ${LIMITES.max_fotos} fotos por publicación.`; errEl.classList.remove('hidden'); return; }
      const pesada = archivos.find(f => f.size > MB(LIMITES.galeria));
      if (pesada) { errEl.textContent = `Cada foto puede pesar como máximo ${LIMITES.galeria} MB (${pesada.name}).`; errEl.classList.remove('hidden'); return; }
    } else if (!esTexto && tiposSel.has('imagen') && archivo.size > MB(LIMITES.imagen)) {
      errEl.textContent = `Una foto puede pesar como máximo ${LIMITES.imagen} MB.`; errEl.classList.remove('hidden'); return;
    } else if (!esTexto && tiposSel.has('video') && archivo.size > MB(LIMITES.video)) {
      errEl.textContent = `Un vídeo puede pesar como máximo ${LIMITES.video} MB.`; errEl.classList.remove('hidden'); return;
    }

    const fd = new FormData();
    archivos.forEach(f => fd.append('file', f));
    fd.append('categoria', categoria);
    fd.append('asunto', asunto); fd.append('descripcion', desc);
    fd.append('artista', (document.getElementById('artista-input')?.value || '').trim());
    // Encuadre: una proporción para la publicación y una posición por
    // fichero, en el mismo orden en que se adjuntaron.
    if (ENC.activo && ENC.aspecto) {
      fd.append('aspecto', ENC.aspecto);
      archivos.forEach((_, i) => fd.append('encuadre', ENC.posiciones[i] || '50% 50%'));
    }

    const btn = e.target.querySelector('.btn-confirmar');
    btn.disabled = true;
    btn.textContent = esGaleria
      ? `Subiendo ${archivos.length} ${hayAudio ? 'pistas' : 'fotos'}...`
      : (esTexto ? 'Publicando...' : 'Subiendo...');
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) { cerrar(); showToast(data.mensaje || 'Archivo enviado a revisión. El admin lo aprobará pronto.'); }
      else { errEl.textContent = data.error || 'Error al subir archivo.'; errEl.classList.remove('hidden'); }
    } catch {
      errEl.textContent = 'No se pudo conectar con el servidor. Inténtalo de nuevo.'; errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Publicar';
    }
  });
}

/* ══ Media compartida (reproductor liquid glass + avatar) ══
   Usado por la vista de carpeta y por el feed (home). */
const PICON = {
  vol:   '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
  mute:  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>',
  back:  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>',
  fwd:   '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>',
  play:  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
  pause: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4.2" height="16" rx="1.2"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.2"/></svg>',
  gear:  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  fs:    '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  music: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
};

function avatarChip(a) {
  if (a.avatar) return `<img class="autor-avatar" src="${a.avatar}" alt="" loading="lazy">`;
  return `<span class="autor-avatar autor-avatar-ph"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg></span>`;
}

/* ── Publicación de audio ──
   La especificación fija 540 × 169 px (3,2:1) para el bloque de audio, con
   una carátula cuadrada de 169 × 169 px a la izquierda. Como la app no
   guarda carátulas, la casilla muestra un marcador del color del tema.
   Si la publicación trae varias pistas se añade la lista debajo. */
function audioPostHtml(a) {
  const pistas = a.pistas || [];
  const titulo = escapeAttr(a.asunto || a.nombre || 'Sin título');
  const artista = escapeAttr(a.artista || (a.subido_por ? '@' + a.subido_por : ''));
  const lista = pistas.length > 1 ? `
    <ol class="ap-lista">
      ${pistas.map((t, i) => `
        <li class="ap-pista" data-url="${t.url}" data-i="${i}">
          <span class="ap-num">${i + 1}</span>
          <span class="ap-pista-info">
            <span class="ap-pista-titulo">${escapeAttr(t.titulo)}</span>
            <span class="ap-pista-artista">${escapeAttr(t.artista || artista)}</span>
          </span>
          <span class="ap-pista-dur">--:--</span>
        </li>`).join('')}
    </ol>` : '';

  return `
    <div class="audio-post${pistas.length > 1 ? ' es-lista' : ''}">
      <div class="ap-cabecera">
        <div class="ap-caratula">${PICON.music}</div>
        <div class="ap-cuerpo">
          <p class="ap-titulo">${titulo}</p>
          <p class="ap-artista">${artista}</p>
          ${reproductorHtml('audio', pistas.length ? pistas[0].url : a.url)}
        </div>
      </div>
      ${lista}
    </div>`;
}

function escapeAttr(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Lista de reproducción: al pulsar una pista se carga en el reproductor de
// la cabecera. Las duraciones se leen de los metadatos de cada archivo, que
// es la única fuente disponible (el backend no las guarda).
function activarLista(card) {
  const lista = card.querySelector('.ap-lista');
  if (!lista) return;
  const audio = card.querySelector('.audio-post audio.gp-media');
  const items = [...lista.querySelectorAll('.ap-pista')];
  if (!audio || !items.length) return;

  items[0].classList.add('sonando');

  // Duración de cada pista, leyendo sólo sus metadatos.
  items.forEach(li => {
    const sonda = new Audio();
    sonda.preload = 'metadata';
    sonda.addEventListener('loadedmetadata', () => {
      const d = sonda.duration;
      if (!isFinite(d)) return;
      const m = Math.floor(d / 60), sg = Math.floor(d % 60);
      li.querySelector('.ap-pista-dur').textContent = m + ':' + String(sg).padStart(2, '0');
    });
    sonda.addEventListener('error', () => {
      li.querySelector('.ap-pista-dur').textContent = '--:--';
    });
    sonda.src = li.dataset.url;
  });

  const poner = (li, reproducir) => {
    items.forEach(x => x.classList.remove('sonando'));
    li.classList.add('sonando');
    const t = card.querySelector('.ap-titulo'), ar = card.querySelector('.ap-artista');
    if (t)  t.textContent  = li.querySelector('.ap-pista-titulo').textContent;
    if (ar) ar.textContent = li.querySelector('.ap-pista-artista').textContent;
    audio.src = li.dataset.url;
    if (reproducir) audio.play().catch(() => {});
  };

  items.forEach(li => li.addEventListener('click', () => poner(li, true)));

  // Al terminar una pista pasa a la siguiente.
  audio.addEventListener('ended', () => {
    const i = items.findIndex(x => x.classList.contains('sonando'));
    if (i >= 0 && i + 1 < items.length) poner(items[i + 1], true);
  });
}

function reproductorHtml(tipo, url) {
  const media = tipo === 'video'
    ? `<video class="gp-blur" src="${url}" muted playsinline preload="metadata" tabindex="-1"></video><video class="gp-media" src="${url}" playsinline preload="metadata"></video>`
    : `<div class="gp-audio-art">${PICON.music}</div><audio class="gp-media" src="${url}" preload="metadata"></audio>`;
  return `
    <div class="glass-player ${tipo === 'audio' ? 'gp-is-audio' : ''}">
      ${media}
      <div class="gp-bar">
        <div class="gp-controls">
          <div class="gp-vol-wrap">
            <button class="gp-btn gp-mute" title="Silenciar">${PICON.vol}</button>
            <input type="range" class="gp-range gp-vol" min="0" max="1" step="0.02" value="1" aria-label="Volumen">
          </div>
          <div class="gp-transport">
            <button class="gp-btn gp-back" title="Retroceder 10s">${PICON.back}</button>
            <button class="gp-btn gp-play gp-play-main" title="Reproducir">${PICON.play}</button>
            <button class="gp-btn gp-fwd" title="Adelantar 10s">${PICON.fwd}</button>
          </div>
          <div class="gp-extra">
            <button class="gp-btn gp-speed" title="Velocidad">${PICON.gear}<span class="gp-speed-lbl">1×</span></button>
            ${tipo === 'video' ? `<button class="gp-btn gp-fs" title="Pantalla completa">${PICON.fs}</button>` : ''}
          </div>
        </div>
        <div class="gp-timeline">
          <span class="gp-tiempo">
            <span class="gp-time gp-cur">0:00</span>
            <span class="gp-sep" aria-hidden="true">/</span>
            <span class="gp-time gp-dur">0:00</span>
          </span>
          <input type="range" class="gp-range gp-seek" min="0" max="1000" value="0" aria-label="Progreso">
        </div>
      </div>
    </div>`;
}

function activarReproductor(root) {
  const p = root.querySelector('.glass-player');
  if (!p) return;
  const q = s => p.querySelector(s);
  const media = q('.gp-media');
  const btnPlay = q('.gp-play'), btnBack = q('.gp-back'), btnFwd = q('.gp-fwd');
  const btnMute = q('.gp-mute'), vol = q('.gp-vol');
  const seek = q('.gp-seek'), cur = q('.gp-cur'), dur = q('.gp-dur');
  const btnSpeed = q('.gp-speed'), speedLbl = q('.gp-speed-lbl'), btnFs = q('.gp-fs');
  const blur = q('.gp-blur');

  /* ── Vista previa: el fotograma del segundo 4 ──
     El primero suele ser negro —fundidos de entrada— y no dice nada del
     contenido. Se salta al segundo 4, se copia ese fotograma a una imagen
     que se superpone, y el vídeo VUELVE al principio: así la línea de
     tiempo arranca en 0 y al pulsar reproducir empieza desde el inicio.
     La imagen desaparece al reproducir o al saltar. */
  if (media.tagName === 'VIDEO') {
    let hecho = false;
    const capturarMitad = () => {
      if (hecho || !isFinite(media.duration) || !media.duration) return;
      hecho = true;
      const enLaMitad = () => {
        media.removeEventListener('seeked', enLaMitad);
        let img = null;
        try {
          const c = document.createElement('canvas');
          c.width  = media.videoWidth  || 640;
          c.height = media.videoHeight || 360;
          c.getContext('2d').drawImage(media, 0, 0, c.width, c.height);
          img = document.createElement('img');
          img.className = 'gp-previa';
          img.alt = '';
          img.src = c.toDataURL('image/jpeg', 0.82);
          media.insertAdjacentElement('afterend', img);
        } catch { /* si el lienzo falla, simplemente no hay vista previa */ }

        // Al volver a 0 se arman los disparadores que la retiran. Antes no:
        // el propio salto de vuelta la habría quitado al instante.
        const alVolver = () => {
          media.removeEventListener('seeked', alVolver);
          if (!img) return;
          const quitar = () => img.remove();
          media.addEventListener('play',   quitar, { once: true });
          media.addEventListener('seeked', quitar, { once: true });
        };
        media.addEventListener('seeked', alVolver);
        try { media.currentTime = 0; } catch {}
      };
      media.addEventListener('seeked', enLaMitad);
      // En vídeos de menos de 8 s el segundo 4 caería pasada la mitad, ya
      // cerca del final; ahí se usa la mitad, que sigue siendo represen-
      // tativa. Para todo lo demás son los 4 s pedidos.
      try { media.currentTime = Math.min(4, media.duration / 2); } catch {}
    };
    if (media.readyState >= 1) capturarMitad();
    else media.addEventListener('loadedmetadata', capturarMitad, { once: true });
  }

  if (blur) {
    media.addEventListener('play',   () => { blur.play().catch(() => {}); });
    media.addEventListener('pause',  () => blur.pause());
    media.addEventListener('seeking',() => { try { blur.currentTime = media.currentTime; } catch {} });
    media.addEventListener('ratechange', () => { blur.playbackRate = media.playbackRate; });
  }

  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const pinta = (el, pct) => el.style.setProperty('--pct', pct + '%');

  const pintarPlay = () => { btnPlay.innerHTML = media.paused ? PICON.play : PICON.pause; };
  btnPlay.addEventListener('click', () => media.paused ? media.play() : media.pause());
  media.addEventListener('play', pintarPlay);
  media.addEventListener('pause', pintarPlay);
  media.addEventListener('ended', pintarPlay);
  btnBack.addEventListener('click', () => media.currentTime = Math.max(0, media.currentTime - 10));
  btnFwd.addEventListener('click', () => media.currentTime = Math.min(media.duration || Infinity, media.currentTime + 10));

  media.addEventListener('loadedmetadata', () => { dur.textContent = fmt(media.duration); });
  media.addEventListener('timeupdate', () => {
    cur.textContent = fmt(media.currentTime);
    const pct = media.duration ? (media.currentTime / media.duration) * 100 : 0;
    seek.value = pct * 10; pinta(seek, pct);
  });
  seek.addEventListener('input', () => { if (media.duration) { media.currentTime = (seek.value / 1000) * media.duration; pinta(seek, seek.value / 10); } });

  const pintarVol = () => {
    const v = media.muted ? 0 : media.volume;
    btnMute.innerHTML = v === 0 ? PICON.mute : PICON.vol;
    pinta(vol, v * 100);
  };
  vol.addEventListener('input', () => { media.volume = +vol.value; media.muted = +vol.value === 0; pintarVol(); });
  btnMute.addEventListener('click', () => {
    media.muted = !media.muted;
    if (!media.muted && media.volume === 0) media.volume = 1;
    vol.value = media.muted ? 0 : media.volume;
    pintarVol();
  });

  const vel = [1, 1.25, 1.5, 2, 0.5]; let vi = 0;
  btnSpeed.addEventListener('click', () => { vi = (vi + 1) % vel.length; media.playbackRate = vel[vi]; speedLbl.textContent = vel[vi] + '×'; });

  btnFs?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else (media.requestFullscreen || media.webkitEnterFullscreen || media.webkitRequestFullscreen)?.call(media);
  });
  // ── Auto-ocultado de la barra (sólo vídeo) ──
  // Tras 3 s sin actividad la barra se desvanece. Vuelve con el cursor
  // sobre el vídeo, al tocarlo, al usar el teclado o al pausar. En audio
  // no se oculta nunca: ahí la barra ES la interfaz de la publicación.
  const esVideo = media.tagName === 'VIDEO';
  let tempOcultar = null;
  let arrastrando = false;

  const mostrarBarra = () => {
    p.classList.remove('gp-oculto');
    clearTimeout(tempOcultar);
    // Mientras esté pausado o el usuario arrastre un control, no se oculta.
    if (!esVideo || media.paused || arrastrando) return;
    tempOcultar = setTimeout(() => p.classList.add('gp-oculto'), 3000);
  };

  if (esVideo) {
    p.addEventListener('mouseenter', mostrarBarra);
    p.addEventListener('mousemove',  mostrarBarra);
    p.addEventListener('focusin',    mostrarBarra);
    // Al sacar el cursor se acorta la espera, pero sin cortar de golpe.
    p.addEventListener('mouseleave', () => {
      clearTimeout(tempOcultar);
      if (!media.paused && !arrastrando) tempOcultar = setTimeout(() => p.classList.add('gp-oculto'), 900);
    });

    // Arrastrar el progreso o el volumen mantiene la barra a la vista.
    [seek, vol].forEach(r => {
      r.addEventListener('pointerdown', () => { arrastrando = true; mostrarBarra(); });
      r.addEventListener('input', mostrarBarra);
    });
    document.addEventListener('pointerup', () => {
      if (!arrastrando) return;
      arrastrando = false; mostrarBarra();
    });

    media.addEventListener('play',  mostrarBarra);
    media.addEventListener('pause', mostrarBarra);

    // Tocar/pulsar el vídeo: si la barra está oculta la revela; si ya se ve,
    // alterna la reproducción. Así en móvil un toque no pausa sin querer.
    media.addEventListener('click', () => {
      if (p.classList.contains('gp-oculto')) { mostrarBarra(); return; }
      media.paused ? media.play() : media.pause();
      mostrarBarra();
    });
  }

  pintarPlay(); pintarVol(); pinta(seek, 0);
  if (esVideo) mostrarBarra();
}

/* HTML de la media de una publicación (imagen con relleno / video / audio) */
const IC_EXPANDIR = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 10 20 4M20 4h-5M20 4v5"/><path d="M10 14 4 20M4 20h5M4 20v-5"/></svg>';

/* ── Photoset: varias fotos en una publicación ──
   La especificación del panel fija el ancho de columna: 540 px a una
   columna, 268 px a dos y 177 px a tres, con 4 px de canal. En vez de
   fijar píxeles (que romperían en móvil) se reparte el ancho con flex,
   que da exactamente esas medidas a 540 px de contenedor.

   El reparto en filas sigue los ejemplos del esquema: una foto grande
   arriba y el resto en filas de hasta tres. */
function filasPhotoset(n) {
  switch (n) {
    case 1: return [1];
    case 2: return [2];
    case 3: return [1, 2];       // esquema: 540 + dos de 268
    case 4: return [1, 3];       // esquema: 540 + tres de 177
    case 5: return [2, 3];
    case 6: return [3, 3];
    case 7: return [1, 3, 3];
    case 8: return [2, 3, 3];
    default: {                    // 9 o más: filas de tres
      const filas = [];
      let resto = n;
      if (resto % 3 === 1) { filas.push(1); resto -= 1; }
      else if (resto % 3 === 2) { filas.push(2); resto -= 2; }
      while (resto > 0) { filas.push(3); resto -= 3; }
      return filas;
    }
  }
}

function photosetHtml(a) {
  const fotos = a.imagenes || [];
  const alt = (a.asunto || '').replace(/"/g, '&quot;');
  let i = 0;
  const filas = filasPhotoset(fotos.length).map(cols => {
    const celdas = fotos.slice(i, i + cols); i += cols;
    if (!celdas.length) return '';
    // Sólo las celdas de 2 y 3 columnas se cargan en diferido: son cuadradas
    // por CSS, así que reservan su hueco. La foto a ancho completo saca su
    // altura de la propia imagen, y con `lazy` se quedaría en un bucle
    // (altura 0 → nunca entra en pantalla → nunca carga → altura 0).
    const lazy = celdas.length > 1 ? ' loading="lazy"' : '';
    // La celda enlaza a su categoría, pero no todas las respuestas de la API
    // traen ese campo: la de dentro de una categoría no lo incluye (ya
    // estás en ella). Sin comprobarlo salía `cat=undefined` y tocar la foto
    // llevaba a una categoría inexistente. Sin destino, no es un enlace.
    const destino = a.categoria
      ? `/carpeta.html?cat=${encodeURIComponent(a.categoria)}&archivo=`
      : null;
    // El relleno desenfocado y el botón de expandir van ocultos por defecto:
    // sólo la vista de categoría en móvil los muestra. Así el feed del inicio
    // queda exactamente igual que antes.
    return `<div class="ps-fila" data-cols="${celdas.length}">` + celdas.map(f => {
      const dentro =
        `<span class="ps-blur" style="background-image:url('${(f.url || '').replace(/'/g, "%27")}')"></span>
         <img src="${f.url}"${lazy} onerror="mediaRota(this)" alt="${alt}">
         <button class="ps-expandir" type="button" title="Ampliar" aria-label="Ampliar">${IC_EXPANDIR}</button>`;
      // El encuadre elegido al subir viaja como variables CSS, no como
      // `aspect-ratio` en línea: un estilo en línea ganaría siempre y la
      // vista de categoría no podría imponer su marco 16:9.
      const enc = f.aspecto
        ? ` data-ar="${f.aspecto}" style="--ar:${f.aspecto.replace(':', '/')};--encuadre:${f.encuadre || '50% 50%'}"`
        : '';
      return destino
        ? `<a class="ps-celda"${enc} href="${destino}${f.id}">${dentro}</a>`
        : `<div class="ps-celda"${enc}>${dentro}</div>`;
    }).join('') + `</div>`;
  }).join('');
  return `<div class="feed-photoset" data-fotos="${fotos.length}">${filas}</div>`;
}

// Marcador para cuando el archivo ya no está en el almacenamiento
// (fila en la base sin fichero). Sin esto la imagen rota colapsa a unos
// pocos píxeles y la publicación queda deformada.
const IC_MEDIA_ROTA = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-4.5-4.5L9 18"/><path d="m3 3 18 18"/></svg>';

function mediaRota(img) {
  const cont = img.closest('.feed-media, .detalle-media');
  img.remove();
  if (!cont || cont.querySelector('.media-nodisp')) return;
  cont.querySelector('.media-blur')?.remove();
  cont.insertAdjacentHTML('beforeend',
    `<div class="media-nodisp">${IC_MEDIA_ROTA}<span>Archivo no disponible</span></div>`);
}

function mediaHtmlPost(a) {
  // Las publicaciones de texto no tienen archivo: sin esto caerían en el
  // caso por defecto y pintarían un "Descargar" con href vacío.
  if (a.tipo === 'texto' || !a.url) return '';
  if (a.tipo === 'imagen')
    return `<div class="media-blur" style="background-image:url('${(a.url || '').replace(/'/g, "%27")}')"></div><img class="media-main" src="${a.url}" onerror="mediaRota(this)" alt="${(a.asunto || '').replace(/"/g, '&quot;')}">`;
  if (a.tipo === 'video' || a.tipo === 'audio') return reproductorHtml(a.tipo, a.url);
  return `<div class="audio-bg"><a href="${a.url}" target="_blank" style="color:var(--red)">Descargar ↗</a></div>`;
}
