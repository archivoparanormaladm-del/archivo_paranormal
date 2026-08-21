const TEMAS = {
  rojo: {
    nombre: 'Rojo Neón',
    icono: '🔴',
    vars: {
      '--red':      '#e63535',
      '--red-2':    '#c02020',
      '--red-dark': '#8a0f0f',
      '--red-bg':   '#1c0808',
      '--red-glow': 'rgba(230,53,53,.35)',
    }
  },
  verde: {
    nombre: 'Verde Fantasma',
    icono: '🟢',
    vars: {
      '--red':      '#2ee66e',
      '--red-2':    '#1fbe57',
      '--red-dark': '#0f5c2c',
      '--red-bg':   '#04220f',
      '--red-glow': 'rgba(46,230,110,.38)',
    }
  },
  azul: {
    nombre: 'Azul Espectral',
    icono: '🔵',
    vars: {
      '--red':      '#3b82f6',
      '--red-2':    '#2563eb',
      '--red-dark': '#1e3a8a',
      '--red-bg':   '#0d1f4a',
      '--red-glow': 'rgba(59,130,246,.35)',
    }
  },
  morado: {
    nombre: 'Morado Oscuro',
    icono: '🟣',
    vars: {
      '--red':      '#a855f7',
      '--red-2':    '#9333ea',
      '--red-dark': '#581c87',
      '--red-bg':   '#2e0f4a',
      '--red-glow': 'rgba(168,85,247,.35)',
    }
  },
  naranja: {
    nombre: 'Naranja Fuego',
    icono: '🟠',
    vars: {
      '--red':      '#f97316',
      '--red-2':    '#ea580c',
      '--red-dark': '#7c2d12',
      '--red-bg':   '#3d1505',
      '--red-glow': 'rgba(249,115,22,.35)',
    }
  },
  cyan: {
    nombre: 'Cyan Paranormal',
    icono: '🩵',
    vars: {
      '--red':      '#06b6d4',
      '--red-2':    '#0891b2',
      '--red-dark': '#164e63',
      '--red-bg':   '#042f3e',
      '--red-glow': 'rgba(6,182,212,.35)',
    }
  },
  rosa: {
    nombre: 'Rosa Sangre',
    icono: '🩷',
    vars: {
      '--red':      '#ec4899',
      '--red-2':    '#db2777',
      '--red-dark': '#831843',
      '--red-bg':   '#3d0a24',
      '--red-glow': 'rgba(236,72,153,.35)',
    }
  },
  amarillo: {
    nombre: 'Amarillo Maldito',
    icono: '🟡',
    vars: {
      '--red':      '#eab308',
      '--red-2':    '#ca8a04',
      '--red-dark': '#713f12',
      '--red-bg':   '#2d1a03',
      '--red-glow': 'rgba(234,179,8,.35)',
    }
  },
};

function aplicarTema(nombre) {
  const tema = TEMAS[nombre];
  if (!tema) return;
  const root = document.documentElement;
  Object.entries(tema.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  localStorage.setItem('tema', nombre);
}

function cargarTema() {
  const guardado = localStorage.getItem('tema') || 'rojo';
  aplicarTema(guardado);
  return guardado;
}

function crearSelectorTema() {
  const actual = cargarTema();

  const btn = document.createElement('button');
  btn.className = 'btn-top btn-logout tema-btn';
  btn.title = 'Cambiar tema';
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a7 7 0 1 0 10 10"/><path d="M12 8v4l2 2"/></svg>
    Tema
  `;

  const dropdown = document.createElement('div');
  dropdown.className = 'tema-dropdown hidden';
  dropdown.innerHTML = Object.entries(TEMAS).map(([key, t]) => `
    <div class="tema-opcion ${key === actual ? 'activo' : ''}" data-tema="${key}">
      <span class="tema-dot" style="background:${t.vars['--red']}"></span>
      ${t.nombre}
    </div>
  `).join('');

  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  wrap.appendChild(btn);
  wrap.appendChild(dropdown);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  dropdown.querySelectorAll('.tema-opcion').forEach(op => {
    op.addEventListener('click', () => {
      aplicarTema(op.dataset.tema);
      dropdown.querySelectorAll('.tema-opcion').forEach(o => o.classList.remove('activo'));
      op.classList.add('activo');
      dropdown.classList.add('hidden');
    });
  });

  document.addEventListener('click', () => dropdown.classList.add('hidden'));

  return wrap;
}

/* ── Modo claro / oscuro ──────────────────────────────── */
// En modo claro el logo original (blanco) se pierde sobre el fondo claro,
// así que se cambia a la versión negra.
function actualizarLogo() {
  const modo = document.documentElement.getAttribute('data-modo') || 'oscuro';
  // Versión a la medida de la barra (168x138 = 3x del tamaño mostrado).
  // Los originales de 1760x1444 siguen en su sitio por si hacen falta.
  const src  = modo === 'claro' ? '/logoblack-nav.png' : '/logo-nav.png';
  document.querySelectorAll('img[alt="Archivo Paranormal"]').forEach(img => {
    img.setAttribute('src', src);
  });
}

function aplicarModo(modo) {
  document.documentElement.setAttribute('data-modo', modo);
  localStorage.setItem('modo', modo);
  actualizarLogo();
}

function cargarModo() {
  // Claro es el modo por defecto; el usuario puede cambiar a oscuro y se recuerda.
  const modo = localStorage.getItem('modo') || 'claro';
  document.documentElement.setAttribute('data-modo', modo);
  // El logo se ajusta cuando el DOM esté listo (por si el script corre antes).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', actualizarLogo);
  } else {
    actualizarLogo();
  }
  return modo;
}

const ICONO_LUNA = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const ICONO_SOL  = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>';

function crearToggleModo() {
  const btn = document.createElement('button');
  btn.className = 'btn-top btn-logout modo-btn';
  const pintar = () => {
    const modo = document.documentElement.getAttribute('data-modo') || 'oscuro';
    btn.innerHTML = (modo === 'claro' ? ICONO_LUNA : ICONO_SOL) +
                    `<span>${modo === 'claro' ? 'Oscuro' : 'Claro'}</span>`;
    btn.title = modo === 'claro' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  };
  pintar();
  btn.addEventListener('click', () => {
    const actual = document.documentElement.getAttribute('data-modo') || 'oscuro';
    aplicarModo(actual === 'claro' ? 'oscuro' : 'claro');
    pintar();
  });
  return btn;
}

/* ── Botón "ojo" para mostrar/ocultar contraseñas ──────── */
const OJO_ABIERTO = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const OJO_CERRADO = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';

function ojoPassword(input) {
  if (!input || input.dataset.ojo) return;
  input.dataset.ojo = '1';
  const wrap = document.createElement('span');
  wrap.className = 'pwd-wrap';
  // Trasladar el margen del input al contenedor para no romper el espaciado
  const cs = getComputedStyle(input);
  wrap.style.marginBottom = cs.marginBottom;
  input.style.marginBottom = '0';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pwd-toggle';
  btn.setAttribute('aria-label', 'Mostrar u ocultar contraseña');
  btn.innerHTML = OJO_ABIERTO;
  wrap.appendChild(btn);
  btn.addEventListener('click', () => {
    const oculto = input.type === 'password';
    input.type = oculto ? 'text' : 'password';
    btn.innerHTML = oculto ? OJO_CERRADO : OJO_ABIERTO;
    input.focus();
  });
}

function initOjosPassword(root) {
  (root || document).querySelectorAll('input[type="password"]').forEach(ojoPassword);
}

// Aplicar tema y modo al cargar cualquier página
cargarTema();
cargarModo();

// Agregar el ojo a los campos de contraseña existentes
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initOjosPassword(document));
} else {
  initOjosPassword(document);
}
