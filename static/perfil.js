renderSessionBar().then(me => {
  if (!me.autenticado) {
    window.location.href = '/';
    return;
  }
  cargarPublicaciones();
  cargarGuardados();
});

// Tabs
document.querySelectorAll('.perfil-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.perfil-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.perfil-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
  });
});

function thumbHtml(a) {
  if (a.tipo === 'imagen') return `<img src="${a.url}" loading="lazy">`;
  if (a.tipo === 'video')  return `<video src="${a.url}#t=0.5" preload="metadata" muted></video>`;
  if (a.tipo === 'audio')  return `<div class="audio-ph"></div>`;
  return `<div class="otro-ph">📄</div>`;
}

function estadoBadge(estado) {
  const map = { aprobado: 'aprobado', pendiente: 'pendiente', rechazado: 'rechazado' };
  const label = { aprobado: 'Publicado', pendiente: 'Pendiente', rechazado: 'Rechazado' };
  return `<span class="pub-estado estado-${map[estado]}">${label[estado] || estado}</span>`;
}

async function cargarPublicaciones() {
  const wrap = document.getElementById('lista-publicaciones');
  const data = await fetch('/api/usuario/publicaciones').then(r => r.json());
  if (!data.length) {
    wrap.innerHTML = '<p class="vacio-txt">No has subido publicaciones todavía.</p>';
    return;
  }
  wrap.innerHTML = '';
  data.forEach(a => {
    const card = document.createElement('div');
    card.className = 'pub-card';
    card.innerHTML = `
      <div class="pub-thumb">
        ${thumbHtml(a)}
        ${estadoBadge(a.estado)}
      </div>
      <div class="pub-info">
        <p class="pub-asunto ${!a.asunto ? 'sin-asunto' : ''}">${a.asunto || 'Sin asunto'}</p>
        <div class="pub-meta">
          <span class="pub-cat">${a.categoria}</span>
          <span class="pub-fecha">${a.fecha}</span>
        </div>
      </div>
    `;
    wrap.appendChild(card);
  });
}

async function cargarGuardados() {
  const wrap = document.getElementById('lista-guardados');
  const data = await fetch('/api/usuario/guardados').then(r => r.json());
  if (!data.length) {
    wrap.innerHTML = '<p class="vacio-txt">No has guardado publicaciones todavía.</p>';
    return;
  }
  wrap.innerHTML = '';
  data.forEach(a => {
    const card = document.createElement('div');
    card.className = 'pub-card';
    card.innerHTML = `
      <div class="pub-thumb">${thumbHtml(a)}</div>
      <div class="pub-info">
        <p class="pub-asunto ${!a.asunto ? 'sin-asunto' : ''}">${a.asunto || 'Sin asunto'}</p>
        <div class="pub-meta">
          <span class="pub-cat">${a.categoria}</span>
          <span class="pub-fecha">${a.fecha}</span>
        </div>
      </div>
    `;
    wrap.appendChild(card);
  });
}
