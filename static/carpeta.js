const params    = new URLSearchParams(window.location.search);
const categoria = params.get('cat') || 'Sin categoría';
document.title = `${categoria} — Archivo Paranormal`;

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('cat-title-top');
  if (el) el.textContent = categoria;
});

const contenedor = document.getElementById('lista-archivos');
const listaItems    = document.getElementById('lista-items');
const listaCount    = document.getElementById('lista-count');
const detalleVacio  = document.getElementById('detalle-vacio');
const detalleConten = document.getElementById('detalle-contenido');

let sesion = {};
let archivoIdActual = null;
renderSessionBar().then(me => { sesion = me; });

function linkificar(texto) {
  if (!texto) return '';
  const r = /(https?:\/\/[^\s<>"]+)/g;
  return texto
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(r, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}


/* ── Panel derecho ─────────────────────────────────────── */
async function mostrarDetalle(a) {
  const mediaAnterior = detalleConten.querySelector('video, audio');
  if (mediaAnterior) { mediaAnterior.pause(); mediaAnterior.src = ''; }

  detalleVacio.classList.add('hidden');
  detalleConten.classList.remove('hidden');

  document.querySelectorAll('.lista-item').forEach(el => el.classList.remove('activo'));
  document.querySelector(`.lista-item[data-id="${a.id}"]`)?.classList.add('activo');

  let mediaHtml = '';
  if (a.tipo === 'imagen')      mediaHtml = `<div class="media-blur" style="background-image:url('${a.url.replace(/'/g, "%27")}')"></div><img class="media-main" src="${a.url}" alt="${a.nombre}">`;
  else if (a.tipo === 'video')  mediaHtml = reproductorHtml('video', a.url);
  else if (a.tipo === 'audio')  mediaHtml = reproductorHtml('audio', a.url);
  else mediaHtml = `<div class="audio-bg"><a href="${a.url}" target="_blank" style="color:var(--red)">Descargar ↗</a></div>`;

  // La imagen conserva el botón de pantalla completa; video/audio traen su propio reproductor.
  const fsBtnHtml = a.tipo === 'imagen' ? `<button class="btn-fs-detalle" id="btn-fs" title="Pantalla completa">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
  </button>` : '';

  detalleConten.innerHTML = `
    <div class="detalle-media">${mediaHtml}${fsBtnHtml}</div>
    <div class="detalle-header">
      <p class="detalle-asunto ${!a.asunto ? 'sin-asunto' : ''}">${a.asunto || 'Sin asunto'}</p>
      <div class="detalle-meta">
        <span class="meta-user">${avatarChip(a)}${a.subido_por ? '@' + a.subido_por : 'Usuario'}</span>
        <span class="meta-fecha">${a.fecha}</span>
        <span class="meta-tipo">${a.tipo}</span>
        <span class="meta-vistas">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
          <span id="vistas-count">${a.visitas || 0}</span> visualizaciones
        </span>
      </div>
    </div>
    <div class="detalle-acciones">
      <button class="acc-btn" id="btn-like" title="Me gusta">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>
        <span id="likes-count">0</span>
      </button>
      <button class="acc-btn" id="btn-dislike" title="No me gusta">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>
        <span id="dislikes-count">0</span>
      </button>
      <button class="acc-btn" id="btn-guardar" title="Guardar">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
        Guardar
      </button>
      <button class="acc-btn" id="btn-compartir" title="Compartir">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
        Compartir
      </button>
    </div>
    <div class="detalle-body">
      <p class="detalle-nombre-label">Archivo</p>
      <p class="detalle-nombre-val">${a.nombre}</p>
      ${a.descripcion ? `<p class="detalle-desc-label">Descripción</p><div class="detalle-desc">${linkificar(a.descripcion)}</div>` : ''}
    </div>
    <div class="comentarios-section">
      <p class="detalle-desc-label">Comentarios</p>
      <div id="lista-comentarios"></div>
      <div class="comentario-form">
        ${!sesion.autenticado ? `<input type="text" id="nombre-anon" placeholder="Tu nombre (opcional)" maxlength="80">` : ''}
        <textarea id="texto-comentario" placeholder="Escribe un comentario..." rows="2" maxlength="1000"></textarea>
        <button id="btn-comentar">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          Comentar
        </button>
      </div>
    </div>
  `;

  // Activar el reproductor liquid glass (video/audio)
  activarReproductor(detalleConten);

  // Pantalla completa (imagen)
  detalleConten.querySelector('#btn-fs')?.addEventListener('click', () => {
    const el = detalleConten.querySelector('video, img');
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  });

  // Cargar reacciones y comentarios
  archivoIdActual = a.id;
  cargarReacciones(a.id);
  cargarComentarios(a.id);

  // Registrar visualización (y reflejarla en el contador al instante)
  fetch(`/api/archivos/${a.id}/visita`, { method: 'POST' }).catch(() => {});
  a.visitas = (a.visitas || 0) + 1;
  const vistasEl = document.getElementById('vistas-count');
  if (vistasEl) vistasEl.textContent = a.visitas;

  // Like / Dislike
  detalleConten.querySelector('#btn-like').addEventListener('click', () => reaccionar(a.id, 'like'));
  detalleConten.querySelector('#btn-dislike').addEventListener('click', () => reaccionar(a.id, 'dislike'));

  // Guardar
  const btnGuardar = detalleConten.querySelector('#btn-guardar');
  if (sesion.autenticado) {
    btnGuardar.addEventListener('click', async () => {
      const res  = await fetch(`/api/archivos/${a.id}/guardar`, { method: 'POST' });
      const data = await res.json();
      btnGuardar.classList.toggle('acc-btn-activo', data.guardado);
      btnGuardar.title = data.guardado ? 'Guardado' : 'Guardar';
    });
  } else {
    btnGuardar.addEventListener('click', () => alert('Inicia sesión para guardar publicaciones.'));
  }

  // Compartir
  detalleConten.querySelector('#btn-compartir').addEventListener('click', () => {
    const url = `${window.location.origin}/carpeta.html?cat=${encodeURIComponent(categoria)}&archivo=${a.id}`;
    if (navigator.share) {
      navigator.share({ title: a.asunto || a.nombre, url });
    } else {
      navigator.clipboard.writeText(url);
      alert('Enlace copiado al portapapeles.');
    }
  });

  // Comentar
  detalleConten.querySelector('#btn-comentar').addEventListener('click', () => enviarComentario(a.id));
}

async function cargarReacciones(archivoId) {
  const data = await fetch(`/api/archivos/${archivoId}/reacciones`).then(r => r.json());
  document.getElementById('likes-count').textContent    = data.likes;
  document.getElementById('dislikes-count').textContent = data.dislikes;
  if (data.mi_reaccion === 'like')    document.getElementById('btn-like')?.classList.add('acc-btn-activo');
  if (data.mi_reaccion === 'dislike') document.getElementById('btn-dislike')?.classList.add('acc-btn-activo');
}

async function reaccionar(archivoId, tipo) {
  const res  = await fetch(`/api/archivos/${archivoId}/reaccion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo }),
  });
  const data = await res.json();
  document.getElementById('likes-count').textContent    = data.likes;
  document.getElementById('dislikes-count').textContent = data.dislikes;
  document.getElementById('btn-like')?.classList.toggle('acc-btn-activo',    tipo === 'like'    && data.accion !== 'eliminada');
  document.getElementById('btn-dislike')?.classList.toggle('acc-btn-activo', tipo === 'dislike' && data.accion !== 'eliminada');
}

async function cargarComentarios(archivoId) {
  const wrap = document.getElementById('lista-comentarios');
  if (!wrap) return;
  const data = await fetch(`/api/archivos/${archivoId}/comentarios`).then(r => r.json());
  if (!data.length) {
    wrap.innerHTML = '<p class="sin-comentarios">Sé el primero en comentar.</p>';
    return;
  }
  wrap.innerHTML = '';
  data.forEach(c => {
    const div = document.createElement('div');
    div.className = 'comentario-item';
    div.dataset.id = c.id;
    const esAdmin = sesion.perfil === 0 || sesion.perfil === 1;
    div.innerHTML = `
      <div class="com-header">
        <span class="com-autor">${c.autor}</span>
        <span class="com-fecha">${c.fecha}</span>
        ${esAdmin ? `<button class="com-btn-del" data-id="${c.id}" title="Eliminar">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>` : ''}
      </div>
      <p class="com-texto">${c.texto}</p>
    `;
    wrap.appendChild(div);
  });

  // Botones eliminar comentario (solo admin)
  wrap.querySelectorAll('.com-btn-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('¿Eliminar este comentario?', 'Eliminar', true))) return;
      const res = await fetch('/api/comentarios/' + btn.dataset.id, { method: 'DELETE' });
      if ((await res.json()).ok) cargarComentarios(archivoIdActual);
    });
  });
}

async function enviarComentario(archivoId) {
  const textoEl  = document.getElementById('texto-comentario');
  const nombreEl = document.getElementById('nombre-anon');
  const texto    = textoEl.value.trim();
  if (!texto) return;

  const res = await fetch(`/api/archivos/${archivoId}/comentarios`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto, nombre: nombreEl?.value?.trim() || 'Anónimo' }),
  });
  const data = await res.json();
  if (data.ok) {
    textoEl.value = '';
    cargarComentarios(archivoId);
  }
}


/* ── Miniatura de previsualización ──────────────────────── */
function miniatura(a) {
  if (a.tipo === 'imagen') return `<img src="${a.url.replace('/api/archivo/', '/api/thumb/')}" alt="" loading="lazy">`;
  if (a.tipo === 'video')  return `<video src="${a.url}#t=0.1" muted preload="metadata"></video><span class="thumb-play"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>`;
  if (a.tipo === 'audio')  return `<span class="thumb-ph"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>`;
  return `<span class="thumb-ph"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>`;
}

/* ── Render lista izquierda ─────────────────────────────── */
function renderLista(archivos) {
  listaCount.textContent = `${archivos.length} archivo${archivos.length !== 1 ? 's' : ''}`;
  if (!archivos.length) {
    listaItems.innerHTML = '<p class="lista-vacia">No hay archivos en esta categoría todavía.</p>';
    return;
  }
  listaItems.innerHTML = '';
  archivos.forEach(a => {
    const item = document.createElement('div');
    item.className = 'lista-item';
    item.dataset.id = a.id;
    item.innerHTML = `
      <div class="item-thumb">${miniatura(a)}</div>
      <div class="item-info">
        <div class="item-top">
          <span class="item-usuario">${avatarChip(a)}${a.subido_por ? '@' + a.subido_por : 'Usuario'}</span>
          <span class="item-fecha">${a.fecha}</span>
        </div>
        <p class="item-asunto ${!a.asunto ? 'sin-asunto' : ''}">${a.asunto || 'Sin asunto'}</p>
        <div class="item-bottom">
          <span class="item-tipo">Tipo: ${a.tipo}</span>
        </div>
      </div>
    `;
    item.addEventListener('click', () => mostrarDetalle(a));
    listaItems.appendChild(item);
  });
  mostrarDetalle(archivos[0]);
}

listaItems.innerHTML = '<p class="cargando-lista">Cargando...</p>';
fetch(`/api/archivos/${encodeURIComponent(categoria)}`)
  .then(r => r.json()).then(renderLista)
  .catch(() => { listaItems.innerHTML = '<p class="lista-vacia">Error al cargar.</p>'; });
