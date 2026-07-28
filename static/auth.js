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
      <button class="btn-top btn-logout" onclick="logout()">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
        <span>Cerrar sesión</span>
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

  // Acción del botón + (subir)
  const puedeSubir = me.autenticado && (me.perfil === 0 || me.perfil === 1 || me.puede_subir);
  const hrefSubir = me.autenticado ? '/dashboard.html?subir=1' : '/index.html';

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

  items.push({ href: hrefSubir, icon: 'plus', label: 'Subir', center: true });

  if (me.autenticado) {
    items.push({ href: '/soporte.html', icon: 'soporte', label: 'Soporte', activo: path.endsWith('/soporte.html') });
    items.push({ href: '/perfil.html', icon: 'perfil', label: 'Mi perfil', activo: path.endsWith('/perfil.html') });
  } else {
    items.push({ href: '/index.html', icon: 'login', label: 'Ingresar', activo: path.endsWith('/index.html') });
  }

  const nav = document.createElement('nav');
  nav.className = 'mobile-nav';
  nav.id = 'mobile-nav';
  nav.innerHTML = items.map(it =>
    `<a href="${it.href}" class="${it.center ? 'center' : ''} ${it.activo ? 'activo' : ''}" aria-label="${it.label}" title="${it.label}">${svgIcon(ICONS[it.icon], it.center ? 26 : 22)}</a>`
  ).join('');
  document.body.appendChild(nav);
}
