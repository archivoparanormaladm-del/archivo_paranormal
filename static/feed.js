const FEED_LIMIT = 6;
let feedOffset = 0, feedCargando = false, feedFin = false;
const feedWrap = document.getElementById('feed');

renderSessionBar();
cargarMasFeed();

// Scroll infinito: al acercarse al final, cargar más
window.addEventListener('scroll', () => {
  if (feedCargando || feedFin) return;
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 700) cargarMasFeed();
});

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const IC_HEART   = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>';
const IC_COMMENT = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const IC_EYE     = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';

async function cargarMasFeed() {
  if (feedCargando || feedFin) return;
  feedCargando = true;
  document.getElementById('feed-loader').classList.remove('hidden');
  let data = [];
  try {
    data = await fetch(`/api/feed?offset=${feedOffset}&limit=${FEED_LIMIT}`).then(r => r.json());
  } catch { /* red */ }
  document.getElementById('feed-loader').classList.add('hidden');
  document.getElementById('feed-cargando')?.remove();

  if (!data.length) {
    feedFin = true; feedCargando = false;
    if (feedOffset === 0) feedWrap.innerHTML = '<p class="feed-vacio">Aún no hay publicaciones. ¡Sé el primero en subir algo!</p>';
    return;
  }
  feedOffset += data.length;
  data.forEach(renderPost);
  feedCargando = false;
}

function renderPost(a) {
  const link = `/carpeta.html?cat=${encodeURIComponent(a.categoria)}&archivo=${a.id}`;
  const card = document.createElement('article');
  card.className = 'feed-card';
  card.innerHTML = `
    <div class="feed-head">
      ${avatarChip(a)}
      <div class="feed-head-info">
        <span class="feed-user">${a.subido_por ? '@' + a.subido_por : 'Anónimo'}</span>
        <span class="feed-fecha">${a.fecha}</span>
      </div>
      <a class="feed-cat" href="/carpeta.html?cat=${encodeURIComponent(a.categoria)}">${a.categoria}</a>
    </div>
    <div class="feed-media">${mediaHtmlPost(a)}</div>
    ${a.asunto ? `<p class="feed-asunto">${escapeHtml(a.asunto)}</p>` : ''}
    ${a.descripcion ? `<p class="feed-desc">${escapeHtml(a.descripcion)}</p>` : ''}
    <div class="feed-stats">
      <button class="feed-stat feed-like" title="Me gusta">${IC_HEART}<span class="feed-like-n">${a.likes}</span></button>
      <a class="feed-stat" href="${link}" title="Comentarios">${IC_COMMENT}<span>${a.comentarios}</span></a>
      <span class="feed-stat" title="Visualizaciones">${IC_EYE}<span>${a.visitas}</span></span>
      <a class="feed-stat feed-abrir" href="${link}">Ver publicación →</a>
    </div>
  `;
  feedWrap.appendChild(card);
  activarReproductor(card);

  // Like directo desde el feed
  const likeBtn = card.querySelector('.feed-like');
  const likeN = card.querySelector('.feed-like-n');
  fetch(`/api/archivos/${a.id}/reacciones`).then(r => r.json()).then(d => {
    if (d.mi_reaccion === 'like') likeBtn.classList.add('activo');
  }).catch(() => {});
  likeBtn.addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/archivos/${a.id}/reaccion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'like' }),
      });
      const d = await res.json();
      likeN.textContent = d.likes;
      likeBtn.classList.toggle('activo', d.accion !== 'eliminada');
    } catch { /* red */ }
  });
}
