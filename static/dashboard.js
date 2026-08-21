// Lista de categorías cargada desde el backend (para el grid de carpetas).
// El modal de subida y sus ayudantes viven en auth.js (disponibles en toda la app).
let CATEGORIAS = [];

renderSessionBar().then(async me => {
  // Contenido público: cualquiera ve las carpetas. El login solo se pide
  // para subir o interactuar (guardar, comentar, etc.).
  const grid = document.getElementById('folders-grid');

  try {
    CATEGORIAS = await fetch('/api/categorias/detalle').then(r => r.json());
  } catch {
    CATEGORIAS = ['Fantasmas','Duendes','Exorcismo','Poltergeist','Psicofonias',
                  'Ouija','Animales','Brujeria','Modo Incognito']
                 .map(nombre => ({ nombre, icono: '' }));
  }

  const contador = document.getElementById('cats-count');
  if (contador) contador.textContent = CATEGORIAS.length;

  // La casilla marcada es la última categoría que se abrió. Sin ella la
  // rejilla se queda entera en gris y pierde el acento de la referencia,
  // donde siempre hay una encendida.
  const ultima = localStorage.getItem('ultimaCategoria');

  CATEGORIAS.forEach(c => {
    const cat = c.nombre;
    const esIncognito = normalizarNombre(cat) === 'modo incognito';
    const item = document.createElement('div');
    item.className = 'folder-item'
      + (esIncognito ? ' es-incognito' : '')
      + (cat === ultima ? ' activa' : '');
    item.tabIndex = 0;
    item.setAttribute('role', 'link');
    item.setAttribute('aria-label', 'Abrir categoría ' + cat);
    item.innerHTML = `
      <span class="folder-badge">
        <svg viewBox="0 0 24 24" aria-hidden="true">${svgIcono(c.icono, cat)}</svg>
      </span>
      <p class="folder-label">${cat}</p>
    `;
    const abrir = () => {
      localStorage.setItem('ultimaCategoria', cat);
      window.location.href = '/carpeta.html?cat=' + encodeURIComponent(cat);
    };
    item.addEventListener('click', abrir);
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
    });
    grid.appendChild(item);
  });

  // Buscador
  const buscador = document.getElementById('buscador');
  if (buscador) {
    let timer;
    buscador.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => buscar(buscador.value.trim()), 350);
    });
  }

  // Botón grande "Subir archivo" (escritorio) → abre el modal compartido en el lugar
  const btnSubir = document.getElementById('btn-subir');
  if (btnSubir && me.autenticado && (me.perfil === 0 || me.perfil === 1 || me.puede_subir)) {
    btnSubir.classList.remove('hidden');
    btnSubir.addEventListener('click', () => abrirModalSubida());
  }
});

async function buscar(q) {
  const res = document.getElementById('resultados-busqueda');
  if (!q) { res && (res.innerHTML = ''); return; }
  const data = await fetch('/api/buscar?q=' + encodeURIComponent(q)).then(r => r.json());
  if (!res) return;
  if (!data.length) { res.innerHTML = '<p style="color:var(--text-3);font-size:13px">Sin resultados.</p>'; return; }
  res.innerHTML = data.map(a => `
    <div class="resultado-item" onclick="window.location.href='/carpeta.html?cat=${encodeURIComponent(a.categoria)}&archivo=${a.id}'">
      <span class="resultado-asunto">${a.asunto || a.nombre}</span>
      <span class="resultado-cat">${a.categoria}</span>
    </div>
  `).join('');
}
