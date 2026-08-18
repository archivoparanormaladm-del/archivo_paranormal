/* auth.js */

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
      <button class="nav-btn nav-btn-back" onclick="irAtras()">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        <span>Volver</span>
      </button>
      <button class="nav-btn nav-btn-home" onclick="irHome()">
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
      <button class="btn-top btn-logout" onclick="window.location.href='/perfil.html'" style="border-color:var(--border);color:var(--text-2)">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        <span>Mi perfil</span>
      </button>
      ${(me.perfil === 0 || me.perfil === 1) ? `
        <button class="btn-top btn-admin" onclick="window.location.href='/admin.html'">
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
      <button class="btn-top btn-login" onclick="window.location.href='/index.html'">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>
        <span>Iniciar sesión</span>
      </button>
      <button class="btn-top btn-register" onclick="window.location.href='/register.html'">
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
        <span class="notif-ico">${n.tipo === 'seguir' ? '👤' : n.tipo === 'like' ? '❤️' : '💬'}</span>
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

async function abrirModalSubida(catDefault) {
  const existente = document.getElementById('modal-subida');
  if (existente) { existente.classList.remove('hidden'); return; }

  let cats = [];
  try { cats = await fetch('/api/categorias').then(r => r.json()); }
  catch { cats = ['Fantasmas','Duendes','Exorcismo','Poltergeist','Psicofonias','Ouija','Animales','Brujeria','Modo Incognito']; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.id = 'modal-subida';
  overlay.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="modal-close-btn">✕</button>
      <p class="modal-title">Subir archivo</p>
      <p class="modal-subtitle">Formatos: JPG, PNG, GIF, WEBP, MP4, MOV, AVI, MKV, MP3, WAV, OGG, FLAC, M4A</p>
      <form id="upload-form">
        <label>Archivo <span style="color:var(--red)">*</span></label>
        <input type="file" id="archivo-input" accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.mp4,.mov,.avi,.mkv,.webm,.wmv,.mp3,.wav,.ogg,.flac,.m4a,.aac" required>
        <p class="tipo-detectado" id="tipo-detectado"></p>
        <p class="error-msg hidden" id="ext-error">Extensión no permitida. Solo imágenes, videos y audios.</p>

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

        <label>Descripción</label>
        <textarea id="desc-input" rows="3" maxlength="2000" placeholder="Descripción opcional..."></textarea>
        <p class="word-count" id="word-count">0 / 200 palabras</p>

        <p class="error-msg hidden" id="form-error"></p>
        <button type="submit" class="btn-confirmar">Subir archivo</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);

  const cerrar = () => overlay.remove();
  document.getElementById('modal-close-btn').addEventListener('click', cerrar);
  overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
  if (catDefault) document.getElementById('categoria-input').value = catDefault;

  document.getElementById('archivo-input').addEventListener('change', e => {
    const file = e.target.files[0];
    const extEl = document.getElementById('ext-error');
    const tipoEl = document.getElementById('tipo-detectado');
    if (!file) return;
    const ext = getExt(file.name);
    if (!TODAS_EXT.includes(ext)) { extEl.classList.remove('hidden'); tipoEl.textContent = ''; e.target.value = ''; return; }
    extEl.classList.add('hidden');
    const tipo = detectarTipo(ext);
    tipoEl.textContent = tipo ? 'Tipo detectado: ' + tipo : '';
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
    const archivo = document.getElementById('archivo-input').files[0];
    const categoria = document.getElementById('categoria-input').value;
    const asunto = document.getElementById('asunto-input').value.trim();
    const desc = document.getElementById('desc-input').value.trim();

    if (!archivo) { errEl.textContent = 'Debes seleccionar un archivo.'; errEl.classList.remove('hidden'); return; }
    if (!categoria) { errEl.textContent = 'Debes seleccionar una categoría.'; errEl.classList.remove('hidden'); return; }
    if (!asunto) { errEl.textContent = 'El asunto es obligatorio.'; errEl.classList.remove('hidden'); return; }
    const ext = getExt(archivo.name);
    if (!TODAS_EXT.includes(ext)) { errEl.textContent = 'Extensión de archivo no permitida.'; errEl.classList.remove('hidden'); return; }
    const words = desc.split(/\s+/).filter(Boolean).length;
    if (words > 200) { errEl.textContent = 'La descripción supera las 200 palabras.'; errEl.classList.remove('hidden'); return; }
    if (archivo.size > 50 * 1024 * 1024) { errEl.textContent = 'El archivo supera los 50MB.'; errEl.classList.remove('hidden'); return; }

    const fd = new FormData();
    fd.append('file', archivo); fd.append('categoria', categoria);
    fd.append('asunto', asunto); fd.append('descripcion', desc);

    const btn = e.target.querySelector('.btn-confirmar');
    btn.disabled = true; btn.textContent = 'Subiendo...';
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) { cerrar(); showToast('Archivo enviado a revisión. El admin lo aprobará pronto.'); }
      else { errEl.textContent = data.error || 'Error al subir archivo.'; errEl.classList.remove('hidden'); }
    } catch {
      errEl.textContent = 'No se pudo conectar con el servidor. Inténtalo de nuevo.'; errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Subir archivo';
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
          <span class="gp-time gp-cur">0:00</span>
          <input type="range" class="gp-range gp-seek" min="0" max="1000" value="0" aria-label="Progreso">
          <span class="gp-time gp-dur">0:00</span>
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
  if (media.tagName === 'VIDEO') media.addEventListener('click', () => media.paused ? media.play() : media.pause());

  pintarPlay(); pintarVol(); pinta(seek, 0);
}

/* HTML de la media de una publicación (imagen con relleno / video / audio) */
function mediaHtmlPost(a) {
  if (a.tipo === 'imagen')
    return `<div class="media-blur" style="background-image:url('${(a.url || '').replace(/'/g, "%27")}')"></div><img class="media-main" src="${a.url}" alt="${(a.asunto || '').replace(/"/g, '&quot;')}">`;
  if (a.tipo === 'video' || a.tipo === 'audio') return reproductorHtml(a.tipo, a.url);
  return `<div class="audio-bg"><a href="${a.url}" target="_blank" style="color:var(--red)">Descargar ↗</a></div>`;
}
