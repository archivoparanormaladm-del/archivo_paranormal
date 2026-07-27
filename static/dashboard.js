const EXTENSIONES = {
  imagen: ['jpg','jpeg','png','gif','webp','bmp','svg'],
  video:  ['mp4','mov','avi','mkv','webm','wmv'],
  audio:  ['mp3','wav','ogg','flac','m4a','aac']
};
const TODAS_EXT = [...EXTENSIONES.imagen, ...EXTENSIONES.video, ...EXTENSIONES.audio];

function showToast(msg, tipo='ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function getExt(nombre) { return nombre.split('.').pop().toLowerCase(); }

function detectarTipo(ext) {
  if (EXTENSIONES.imagen.includes(ext)) return 'imagen';
  if (EXTENSIONES.video.includes(ext))  return 'video';
  if (EXTENSIONES.audio.includes(ext))  return 'audio';
  return null;
}

// Lista de categorías cargada desde el backend (compartida con el modal de subida)
let CATEGORIAS = [];

renderSessionBar().then(async me => {
  if (!me.autenticado) { window.location.href = '/'; return; }

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

  // Modal subida
  const btnSubir = document.getElementById('btn-subir');
  if (btnSubir && (me.perfil === 0 || me.perfil === 1 || me.puede_subir)) {
    btnSubir.classList.remove('hidden');
    btnSubir.addEventListener('click', () => abrirModal());
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

function abrirModal(catDefault) {
  const modal = document.getElementById('modal-subida');
  if (modal) { modal.classList.remove('hidden'); return; }

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
          ${CATEGORIAS.map(c => `<option value="${c}">${c}</option>`).join('')}
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
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('modal-close-btn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  if (catDefault) document.getElementById('categoria-input').value = catDefault;

  // Detectar tipo y validar extensión
  document.getElementById('archivo-input').addEventListener('change', e => {
    const file = e.target.files[0];
    const extEl = document.getElementById('ext-error');
    const tipoEl = document.getElementById('tipo-detectado');
    if (!file) return;
    const ext = getExt(file.name);
    if (!TODAS_EXT.includes(ext)) {
      extEl.classList.remove('hidden');
      tipoEl.textContent = '';
      e.target.value = '';
      return;
    }
    extEl.classList.add('hidden');
    const tipo = detectarTipo(ext);
    tipoEl.textContent = tipo ? 'Tipo detectado: ' + tipo : '';
  });

  // Aviso incógnito
  document.getElementById('categoria-input').addEventListener('change', e => {
    const av = document.getElementById('aviso-incognito');
    e.target.value === 'Modo Incognito' ? av.classList.remove('hidden') : av.classList.add('hidden');
  });

  // Contador palabras
  document.getElementById('desc-input').addEventListener('input', e => {
    const words = e.target.value.trim().split(/\s+/).filter(Boolean).length;
    document.getElementById('word-count').textContent = words + ' / 200 palabras';
    if (words > 200) document.getElementById('word-count').style.color = 'var(--red)';
    else document.getElementById('word-count').style.color = 'var(--text-3)';
  });

  document.getElementById('upload-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.classList.add('hidden');

    const archivo = document.getElementById('archivo-input').files[0];
    const categoria = document.getElementById('categoria-input').value;
    const asunto = document.getElementById('asunto-input').value.trim();
    const desc = document.getElementById('desc-input').value.trim();

    // Validaciones obligatorias
    if (!archivo) { errEl.textContent = 'Debes seleccionar un archivo.'; errEl.classList.remove('hidden'); return; }
    if (!categoria) { errEl.textContent = 'Debes seleccionar una categoría.'; errEl.classList.remove('hidden'); return; }
    if (!asunto) { errEl.textContent = 'El asunto es obligatorio.'; errEl.classList.remove('hidden'); return; }

    const ext = getExt(archivo.name);
    if (!TODAS_EXT.includes(ext)) { errEl.textContent = 'Extensión de archivo no permitida.'; errEl.classList.remove('hidden'); return; }

    const words = desc.split(/\s+/).filter(Boolean).length;
    if (words > 200) { errEl.textContent = 'La descripción supera las 200 palabras.'; errEl.classList.remove('hidden'); return; }

    if (archivo.size > 50 * 1024 * 1024) { errEl.textContent = 'El archivo supera los 50MB.'; errEl.classList.remove('hidden'); return; }

    const fd = new FormData();
    fd.append('file', archivo);
    fd.append('categoria', categoria);
    fd.append('asunto', asunto);
    fd.append('descripcion', desc);

    const btn = e.target.querySelector('.btn-confirmar');
    btn.disabled = true; btn.textContent = 'Subiendo...';

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.ok) {
        overlay.remove();
        showToast('Archivo enviado a revisión. El admin lo aprobará pronto.');
      } else {
        errEl.textContent = data.error || 'Error al subir archivo.';
        errEl.classList.remove('hidden');
      }
    } catch {
      errEl.textContent = 'No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Subir archivo';
    }
  });
}
