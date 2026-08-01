// Lista de categorías cargada desde el backend (para el grid de carpetas).
// El modal de subida y sus ayudantes viven en auth.js (disponibles en toda la app).
let CATEGORIAS = [];

renderSessionBar().then(async me => {
  // Contenido público: cualquiera ve las carpetas. El login solo se pide
  // para subir o interactuar (guardar, comentar, etc.).
  const grid = document.getElementById('folders-grid');

  try {
    CATEGORIAS = await fetch('/api/categorias').then(r => r.json());
  } catch {
    CATEGORIAS = ['Fantasmas','Duendes','Exorcismo','Poltergeist','Psicofonias','Ouija','Animales','Brujeria','Modo Incognito'];
  }

  CATEGORIAS.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'folder-item';
    const esIncognito = cat === 'Modo Incognito';
    item.innerHTML = `
      <p class="folder-label ${esIncognito ? 'folder-incognito' : ''}">${cat}</p>
      <div class="folder-icon ${esIncognito ? 'folder-icon-incognito' : ''}">
        <div class="folder-vhs"></div>
        <div class="folder-glitch"></div>
      </div>
    `;
    item.addEventListener('click', () => {
      window.location.href = '/carpeta.html?cat=' + encodeURIComponent(cat);
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
