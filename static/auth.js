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

function irHome()  { window.location.href = '/dashboard.html'; }
function irAtras() { history.back(); }

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

  renderBottomNav(me);
  return me;
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
  const esInicio = path === '/' || path.endsWith('/dashboard.html');

  // Acción del botón + (subir). Se maneja por click (abre el modal en el lugar).
  const puedeSubir = me.autenticado && (me.perfil === 0 || me.perfil === 1 || me.puede_subir);

  const items = [];
  items.push({ href: '/dashboard.html', icon: 'home', label: 'Inicio', activo: esInicio });

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
