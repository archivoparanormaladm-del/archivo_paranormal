const FEED_LIMIT = 6;
let feedOffset = 0, feedCargando = false, feedFin = false;
let feedMe = {};
let feedFiltro = 'todos';
const feedWrap = document.getElementById('feed');

renderSessionBar().then(me => {
  feedMe = me || {};
  // Mostrar pestañas Para ti / Siguiendo solo a usuarios autenticados
  if (feedMe.autenticado) {
    const tabs = document.getElementById('feed-tabs');
    tabs.classList.remove('hidden');
    tabs.querySelectorAll('.feed-tab').forEach(t => t.addEventListener('click', () => {
      if (t.classList.contains('active')) return;
      tabs.querySelectorAll('.feed-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      feedFiltro = t.dataset.filtro;
      reiniciarFeed();
    }));
  }
  cargarMasFeed();
});

function reiniciarFeed() {
  feedOffset = 0; feedFin = false; feedCargando = false;
  feedWrap.innerHTML = '<p class="feed-cargando" id="feed-cargando">Cargando publicaciones...</p>';
  cargarMasFeed();
}

// Scroll infinito
window.addEventListener('scroll', () => {
  if (feedCargando || feedFin) return;
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 700) cargarMasFeed();
});

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function linkify(s) {
  return escapeHtml(s).replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

const IC_HEART   = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>';
const IC_COMMENT = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const IC_SAVE    = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const IC_SHARE   = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>';
const IC_EYE     = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';

async function cargarMasFeed() {
  if (feedCargando || feedFin) return;
  feedCargando = true;
  document.getElementById('feed-loader').classList.remove('hidden');
  let data = [];
  const q = feedFiltro === 'siguiendo' ? '&filtro=siguiendo' : '';
  try { data = await fetch(`/api/feed?offset=${feedOffset}&limit=${FEED_LIMIT}${q}`).then(r => r.json()); } catch {}
  document.getElementById('feed-loader').classList.add('hidden');
  document.getElementById('feed-cargando')?.remove();
  if (!data.length) {
    feedFin = true; feedCargando = false;
    if (feedOffset === 0) feedWrap.innerHTML = feedFiltro === 'siguiendo'
      ? '<p class="feed-vacio">Aún no sigues a nadie o quienes sigues no han publicado. ¡Explora "Para ti"!</p>'
      : '<p class="feed-vacio">Aún no hay publicaciones. ¡Sé el primero en subir algo!</p>';
    return;
  }
  feedOffset += data.length;
  data.forEach(renderPost);
  feedCargando = false;
}

function renderPost(a) {
  const link = `/carpeta.html?cat=${encodeURIComponent(a.categoria)}&archivo=${a.id}`;
  const usuario = a.subido_por ? '@' + a.subido_por : 'Anónimo';
  const puedeSeguir = feedMe.autenticado && !a.es_mio && a.subido_por;
  const descLarga = (a.descripcion || '').length > 160;

  const perfilHref = a.subido_por ? `/perfil.html?u=${encodeURIComponent(a.subido_por)}` : null;
  const card = document.createElement('article');
  card.className = 'feed-card';
  card.dataset.id = a.id;
  card.innerHTML = `
    <div class="feed-head">
      ${perfilHref ? `<a href="${perfilHref}" class="feed-perfil-link">${avatarChip(a)}</a>` : avatarChip(a)}
      <div class="feed-head-info">
        ${perfilHref ? `<a class="feed-user feed-perfil-link" href="${perfilHref}">${usuario}</a>` : `<span class="feed-user">${usuario}</span>`}
        <span class="feed-fecha">${a.fecha}</span>
      </div>
      ${puedeSeguir ? `<button class="feed-seguir ${a.siguiendo ? 'siguiendo' : ''}">${a.siguiendo ? 'Siguiendo' : 'Seguir'}</button>` : ''}
      <a class="feed-cat" href="/carpeta.html?cat=${encodeURIComponent(a.categoria)}">${a.categoria}</a>
    </div>
    <div class="feed-media">${mediaHtmlPost(a)}</div>
    ${a.asunto ? `<p class="feed-asunto">${escapeHtml(a.asunto)}</p>` : ''}
    ${a.descripcion ? `<div class="feed-desc-wrap">
        <p class="feed-desc ${descLarga ? 'truncada' : ''}">${linkify(a.descripcion)}</p>
        ${descLarga ? '<button class="feed-vermas" type="button">Ver más</button>' : ''}
      </div>` : ''}
    <div class="feed-stats">
      <button class="feed-stat feed-like ${a.liked ? 'activo' : ''}" title="Me gusta">${IC_HEART}<span class="feed-like-n">${a.likes}</span></button>
      <button class="feed-stat feed-coment-btn" title="Comentar">${IC_COMMENT}<span class="feed-coment-n">${a.comentarios}</span></button>
      <button class="feed-stat feed-guardar ${a.guardado ? 'activo' : ''}" title="Guardar">${IC_SAVE}</button>
      <button class="feed-stat feed-compartir" title="Compartir">${IC_SHARE}</button>
      <span class="feed-stat feed-vistas" title="Visualizaciones">${IC_EYE}<span>${a.visitas}</span></span>
      <a class="feed-stat feed-abrir" href="${link}">Abrir →</a>
    </div>
  `;
  feedWrap.appendChild(card);
  activarReproductor(card);

  // Ver más / ver menos
  const verMas = card.querySelector('.feed-vermas');
  if (verMas) verMas.addEventListener('click', () => {
    const desc = card.querySelector('.feed-desc');
    const abierto = !desc.classList.contains('truncada');
    desc.classList.toggle('truncada', abierto);
    verMas.textContent = abierto ? 'Ver más' : 'Ver menos';
  });

  // Like
  const likeBtn = card.querySelector('.feed-like');
  likeBtn.addEventListener('click', async () => {
    try {
      const d = await fetch(`/api/archivos/${a.id}/reaccion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'like' }) }).then(r => r.json());
      card.querySelector('.feed-like-n').textContent = d.likes;
      likeBtn.classList.toggle('activo', d.accion !== 'eliminada');
    } catch {}
  });

  // Guardar
  const guardarBtn = card.querySelector('.feed-guardar');
  guardarBtn.addEventListener('click', async () => {
    if (!feedMe.autenticado) { showToast('Inicia sesión para guardar.', 'error'); return; }
    try {
      const d = await fetch(`/api/archivos/${a.id}/guardar`, { method: 'POST' }).then(r => r.json());
      guardarBtn.classList.toggle('activo', d.guardado);
      showToast(d.guardado ? 'Guardado en tu perfil.' : 'Quitado de guardados.');
    } catch {}
  });

  // Compartir (con marca de agua para imágenes)
  card.querySelector('.feed-compartir').addEventListener('click', () => compartirPost(a, link));

  // Seguir
  const segBtn = card.querySelector('.feed-seguir');
  if (segBtn) segBtn.addEventListener('click', async () => {
    try {
      const d = await fetch(`/api/usuario/${encodeURIComponent(a.subido_por)}/seguir`, { method: 'POST' }).then(r => r.json());
      if (d.ok) {
        // Reflejar en todas las cards del mismo autor
        document.querySelectorAll('.feed-card').forEach(c => {
          if (c.querySelector('.feed-user')?.textContent === usuario) {
            const b = c.querySelector('.feed-seguir');
            if (b) { b.classList.toggle('siguiendo', d.siguiendo); b.textContent = d.siguiendo ? 'Siguiendo' : 'Seguir'; }
          }
        });
      } else showToast(d.error || 'No se pudo seguir.', 'error');
    } catch {}
  });

  // Comentarios inline (Instagram)
  card.querySelector('.feed-coment-btn').addEventListener('click', () => toggleComentarios(card, a));
}

/* ── Compartir como historia (Instagram/Tumblr/Reddit) con marca de agua ──
   Imagen y GIF: el servidor genera la historia (GIF conserva animación).
   Video: sin ffmpeg, el navegador arma una portada 9:16 con un fotograma. */
async function compartirPost(a, link) {
  const url = window.location.origin + link;
  showToast('Preparando historia con marca de agua...');
  try {
    if (a.tipo === 'video') {
      const blob = await portadaVideoHistoria(a);
      if (blob) return compartirBlob(blob, `darkfiles-${a.id}.png`, a, url);
    } else {
      const resp = await fetch(`/api/historia/${a.id}`);
      const ct = resp.headers.get('content-type') || '';
      if (ct.startsWith('image/')) {
        const blob = await resp.blob();
        const ext = ct.includes('gif') ? 'gif' : 'jpg';
        return compartirBlob(blob, `darkfiles-${a.id}.${ext}`, a, url);
      }
    }
  } catch (e) { /* cae al enlace */ }
  // Fallback: compartir el enlace.
  if (navigator.share) navigator.share({ title: a.asunto || 'DARK FILES', url }).catch(() => {});
  else { navigator.clipboard.writeText(url); showToast('Enlace copiado al portapapeles.'); }
}

async function compartirBlob(blob, filename, a, url) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: a.asunto || 'DARK FILES', text: `${a.asunto || ''}\n${url}`.trim() });
      return true;
    } catch { /* usuario canceló o no soportado → descargar */ }
  }
  const dl = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = dl; el.download = filename;
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(dl), 4000);
  showToast('Historia con marca de agua descargada para compartir.');
  return true;
}

/* Portada 9:16 de un video (fotograma + ▶ + marca), generada en el navegador. */
function portadaVideoHistoria(a) {
  return new Promise(resolve => {
    const W = 1080, H = 1920;
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'metadata';
    const fin = b => resolve(b);
    const fallo = () => resolve(null);
    let listo = false;
    v.addEventListener('loadeddata', () => {
      try { v.currentTime = Math.min(1.0, (v.duration || 2) / 2); } catch { fallo(); }
    });
    v.addEventListener('seeked', () => {
      if (listo) return; listo = true;
      try {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        const vw = v.videoWidth || 16, vh = v.videoHeight || 9;
        // Fondo: fotograma que cubre, desenfocado y oscurecido
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.filter = 'blur(30px) brightness(.5)';
        const cover = Math.max(W / vw, H / vh);
        const cw = vw * cover, ch = vh * cover;
        ctx.drawImage(v, (W - cw) / 2, (H - ch) / 2, cw, ch);
        ctx.restore();
        // Fotograma centrado
        const fit = Math.min((W - 120) / vw, (H - 560) / vh);
        const fw = vw * fit, fh = vh * fit;
        const fx = (W - fw) / 2, fy = (H - fh) / 2;
        ctx.drawImage(v, fx, fy, fw, fh);
        // Botón play
        dibujarPlay(ctx, W / 2, H / 2, 70);
        // Marca de agua tipo historia
        dibujarMarcaHistoria(ctx, W, H, a.subido_por, a.asunto);
        c.toBlob(b => fin(b), 'image/png');
      } catch { fallo(); }
    });
    v.addEventListener('error', fallo);
    setTimeout(fallo, 9000);
    v.src = a.url;
  });
}

function dibujarPlay(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  const s = r * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy - s);
  ctx.lineTo(cx - s * 0.5, cy + s);
  ctx.lineTo(cx + s, cy);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function dibujarMarcaHistoria(ctx, W, H, autor, asunto) {
  const wordmark = (x, y, size, align) => {
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = `800 ${size}px system-ui, -apple-system, sans-serif`;
    const wDark = ctx.measureText('DARK ').width;
    const wFiles = ctx.measureText('FILES').width;
    let x0 = x;
    if (align === 'center') x0 = x - (wDark + wFiles) / 2;
    ctx.fillStyle = '#fff'; ctx.fillText('DARK ', x0, y);
    ctx.fillStyle = '#e11d2a'; ctx.fillText('FILES', x0 + wDark, y);
    return wDark + wFiles;
  };
  // Logo arriba-izquierda (con sombra)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 10;
  wordmark(46, 92, 52);
  ctx.restore();
  // Asunto centrado sobre el pie
  if (asunto) {
    ctx.font = `600 46px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    const txt = asunto.length <= 42 ? asunto : asunto.slice(0, 41) + '…';
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
    ctx.fillText(txt, W / 2, H - 170); ctx.restore();
  }
  // Pie centrado: DARK FILES · @autor
  const handle = autor ? ' · @' + autor : '';
  ctx.font = `800 40px system-ui, -apple-system, sans-serif`;
  const wMarca = ctx.measureText('DARK FILES').width;
  ctx.font = `600 40px system-ui, -apple-system, sans-serif`;
  const wHandle = ctx.measureText(handle).width;
  const x0 = (W - (wMarca + wHandle)) / 2;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
  const anchoMarca = wordmark(x0, H - 70, 40);
  ctx.textAlign = 'left'; ctx.font = `600 40px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#ededed'; ctx.fillText(handle, x0 + anchoMarca, H - 70);
  ctx.restore();
}

/* ── Comentarios inline ── */
function toggleComentarios(card, a) {
  let sec = card.querySelector('.feed-coments');
  if (sec) { sec.classList.toggle('hidden'); return; }
  sec = document.createElement('div');
  sec.className = 'feed-coments';
  sec.innerHTML = `
    <div class="fc-lista"><p class="fc-cargando">Cargando comentarios...</p></div>
    <form class="fc-form">
      ${!feedMe.autenticado ? '<input class="fc-nombre" type="text" placeholder="Tu nombre (opcional)" maxlength="80">' : ''}
      <input class="fc-input" type="text" placeholder="Añade un comentario..." maxlength="1000" required>
      <button class="fc-enviar" type="submit">Publicar</button>
    </form>`;
  card.appendChild(sec);
  cargarComentarios(a.id, card);
  sec.querySelector('.fc-form').addEventListener('submit', async e => {
    e.preventDefault();
    const inp = sec.querySelector('.fc-input');
    const texto = inp.value.trim();
    if (!texto) return;
    const nombre = sec.querySelector('.fc-nombre')?.value.trim() || 'Anónimo';
    try {
      const d = await fetch(`/api/archivos/${a.id}/comentarios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, nombre }),
      }).then(r => r.json());
      if (d.ok) {
        inp.value = '';
        cargarComentarios(a.id, card);
        const n = card.querySelector('.feed-coment-n');
        if (n) n.textContent = (parseInt(n.textContent) || 0) + 1;
      }
    } catch {}
  });
}

async function cargarComentarios(id, card) {
  const lista = card.querySelector('.feed-coments .fc-lista');
  if (!lista) return;
  let data = [];
  try { data = await fetch(`/api/archivos/${id}/comentarios`).then(r => r.json()); } catch {}
  if (!data.length) { lista.innerHTML = '<p class="fc-vacio">Sé el primero en comentar.</p>'; return; }
  lista.innerHTML = data.map(c => `
    <div class="fc-item">
      <div><span class="fc-autor">${escapeHtml(c.autor)}</span> <span class="fc-texto">${escapeHtml(c.texto)}</span></div>
      <span class="fc-fecha">${c.fecha}</span>
    </div>`).join('');
}
