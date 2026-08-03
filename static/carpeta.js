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

/* ── Reproductor liquid glass (video / audio) ──────────── */
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

function reproductorHtml(tipo, url) {
  const media = tipo === 'video'
    ? `<video class="gp-blur" src="${url}" muted playsinline preload="auto" tabindex="-1"></video><video class="gp-media" src="${url}" playsinline preload="metadata"></video>`
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

  // Capa desenfocada de fondo (relleno "ambient") que sigue al video principal
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
    <div class="detalle-header">
      <p class="detalle-asunto ${!a.asunto ? 'sin-asunto' : ''}">${a.asunto || 'Sin asunto'}</p>
      <div class="detalle-meta">
        ${a.subido_por ? `<span class="meta-user">@${a.subido_por}</span>` : ''}
        <span class="meta-fecha">${a.fecha}</span>
        <span class="meta-tipo">${a.tipo}</span>
        <span class="meta-vistas">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
          <span id="vistas-count">${a.visitas || 0}</span>
        </span>
      </div>
    </div>
    <div class="detalle-media">${mediaHtml}${fsBtnHtml}</div>
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
  if (a.tipo === 'imagen') return `<img src="${a.url}" alt="" loading="lazy">`;
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
          <span class="item-usuario">${a.subido_por ? '@' + a.subido_por : 'Usuario'}</span>
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
