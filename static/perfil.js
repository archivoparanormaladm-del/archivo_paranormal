const PARAMS = new URLSearchParams(location.search);
const U_PARAM = (PARAMS.get('u') || '').trim().toLowerCase();

let MIPERFIL = {};        // sesión actual
let MODO_PUBLICO = false; // viendo el perfil de otra persona
let PERFIL_USER = null;   // username del perfil mostrado

renderSessionBar().then(me => {
  MIPERFIL = me || {};
  const esMio = !U_PARAM || (me.autenticado && me.username && U_PARAM === me.username.toLowerCase());
  if (esMio) {
    if (!me.autenticado) { window.location.href = '/'; return; }
    MODO_PUBLICO = false;
    PERFIL_USER = me.username;
    setupMiPerfil(me);
  } else {
    MODO_PUBLICO = true;
    PERFIL_USER = U_PARAM;
    setupPerfilPublico(U_PARAM);
  }
});

/* ═════════ MI PERFIL ═════════ */
function setupMiPerfil(me) {
  pintarPerfil({ nombre: me.nombre, username: me.username, email: me.email, avatar: me.avatar });
  setContadores({ seguidores: me.seguidores || 0, siguiendo: me.siguiendo || 0 });
  cargarPublicaciones();
  cargarGuardados();
}

/* ═════════ PERFIL PÚBLICO (otro usuario) ═════════ */
async function setupPerfilPublico(username) {
  // Ocultar controles propios
  document.getElementById('avatar-input')?.remove();
  document.querySelector('.avatar-cam')?.remove();
  document.getElementById('avatar-wrap').style.cursor = 'default';
  document.querySelector('.perfil-tab[data-tab="guardados"]')?.remove();
  document.getElementById('tab-guardados')?.remove();
  // Renombrar la pestaña (no es "mi" perfil)
  const tabPub = document.querySelector('.perfil-tab[data-tab="publicaciones"]');
  if (tabPub) tabPub.lastChild.textContent = ' Publicaciones';

  let data;
  try { data = await fetch(`/api/usuario/${encodeURIComponent(username)}/perfil`).then(r => r.json()); }
  catch { data = { error: 'No se pudo cargar el perfil.' }; }

  if (data.error) {
    document.querySelector('.perfil-card').innerHTML = `<p class="vacio-txt">Usuario no encontrado.</p>`;
    document.getElementById('lista-publicaciones').innerHTML = '';
    document.getElementById('pub-section-title').textContent = '';
    return;
  }

  pintarPerfil(data);
  document.getElementById('perfil-email').remove(); // no exponer correo en perfil público
  setContadores(data);
  document.getElementById('pc-pubs').textContent = data.publicaciones.length;
  document.getElementById('pub-section-title').textContent = `PUBLICACIONES DE @${data.username}`;

  // Botón seguir / editar → seguir
  const acc = document.getElementById('perfil-acciones');
  acc.innerHTML = '';
  if (data.autenticado && !data.es_mio) {
    const btn = document.createElement('button');
    btn.className = 'btn-seguir-perfil' + (data.sigo ? ' siguiendo' : '');
    btn.textContent = data.sigo ? 'Siguiendo' : 'Seguir';
    btn.addEventListener('click', async () => {
      try {
        const d = await fetch(`/api/usuario/${encodeURIComponent(data.username)}/seguir`, { method: 'POST' }).then(r => r.json());
        if (d.ok) {
          btn.classList.toggle('siguiendo', d.siguiendo);
          btn.textContent = d.siguiendo ? 'Siguiendo' : 'Seguir';
          const seg = document.getElementById('pc-seg');
          seg.textContent = Math.max(0, (parseInt(seg.textContent) || 0) + (d.siguiendo ? 1 : -1));
        } else showToast(d.error || 'No se pudo seguir.', 'error');
      } catch {}
    });
    acc.appendChild(btn);
  } else if (!data.autenticado) {
    const a = document.createElement('a');
    a.className = 'btn-seguir-perfil'; a.href = '/login.html'; a.textContent = 'Inicia sesión para seguir';
    acc.appendChild(a);
  }

  // Publicaciones públicas
  const wrap = document.getElementById('lista-publicaciones');
  if (!data.publicaciones.length) {
    wrap.innerHTML = '<p class="vacio-txt">Este usuario aún no tiene publicaciones.</p>';
    return;
  }
  wrap.innerHTML = '';
  data.publicaciones.forEach(a => wrap.appendChild(pubCard(a, false)));
}

/* ── Tarjeta de perfil (cabecera) ── */
function pintarPerfil(u) {
  document.getElementById('perfil-nombre').textContent = u.nombre || '';
  document.getElementById('perfil-username').textContent = '@' + (u.username || '');
  const emailEl = document.getElementById('perfil-email');
  if (emailEl) emailEl.textContent = u.email || '';
  const img = document.getElementById('avatar-img');
  const ph = document.getElementById('avatar-ph');
  if (u.avatar) {
    img.src = u.avatar + (u.avatar.includes('?') ? '' : '?t=' + Date.now());
    img.classList.remove('hidden'); ph.classList.add('hidden');
  } else {
    img.classList.add('hidden'); ph.classList.remove('hidden');
  }
}

function setContadores({ seguidores = 0, siguiendo = 0 }) {
  document.getElementById('pc-seg').textContent = seguidores;
  document.getElementById('pc-sig').textContent = siguiendo;
}

document.getElementById('pc-btn-seg')?.addEventListener('click', () => abrirLista('seguidores', 'Seguidores'));
document.getElementById('pc-btn-sig')?.addEventListener('click', () => abrirLista('siguiendo', 'Siguiendo'));

async function abrirLista(tipo, titulo) {
  if (!PERFIL_USER) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="lu-close">✕</button>
      <p class="modal-title">${titulo}</p>
      <div class="lista-usuarios" id="lu-lista"><p class="cargando-txt">Cargando...</p></div>
    </div>`;
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.querySelector('#lu-close').addEventListener('click', cerrar);
  ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
  let data = [];
  try { data = await fetch(`/api/usuario/${encodeURIComponent(PERFIL_USER)}/${tipo}`).then(r => r.json()); } catch {}
  const lista = ov.querySelector('#lu-lista');
  if (!Array.isArray(data) || !data.length) {
    lista.innerHTML = `<p class="vacio-txt">${tipo === 'seguidores' ? 'Sin seguidores todavía.' : 'No sigue a nadie todavía.'}</p>`;
    return;
  }
  lista.innerHTML = data.map(u => `
    <a class="lu-item" href="/perfil.html?u=${encodeURIComponent(u.username)}">
      ${u.avatar
        ? `<img class="lu-avatar" src="${u.avatar}" alt="">`
        : `<span class="lu-avatar lu-avatar-ph">${(u.nombre || u.username || '?')[0].toUpperCase()}</span>`}
      <span class="lu-datos"><span class="lu-nombre">${(u.nombre || '').replace(/</g,'&lt;')}</span><span class="lu-user">@${u.username}</span></span>
    </a>`).join('');
}

/* ── Subir avatar (solo mi perfil) ── */
document.getElementById('avatar-wrap').addEventListener('click', () => {
  if (MODO_PUBLICO) return;
  document.getElementById('avatar-input')?.click();
});
document.getElementById('avatar-input')?.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { showToast('La imagen supera los 50MB.', 'error'); return; }
  const fd = new FormData(); fd.append('file', file);
  try {
    const res = await fetch('/api/usuario/avatar', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.ok) {
      MIPERFIL.avatar = data.avatar;
      pintarPerfil(MIPERFIL);
      if (typeof renderSessionBar === 'function') renderSessionBar();
      showToast('Foto de perfil actualizada.');
    } else { showToast('Error: ' + (data.error || 'no se pudo subir'), 'error'); }
  } catch { showToast('No se pudo conectar con el servidor.', 'error'); }
});

/* ── Editar perfil (modal) ── */
document.getElementById('btn-editar-perfil')?.addEventListener('click', () => {
  const me = MIPERFIL;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="ep-close">✕</button>
      <p class="modal-title">Editar perfil</p>
      <form id="ep-form">
        <label>Nombre <span style="color:var(--red)">*</span></label>
        <input type="text" id="ep-nombre" maxlength="120" value="${(me.nombre || '').replace(/"/g, '&quot;')}" required>
        <label>Nombre de usuario <span style="color:var(--red)">*</span></label>
        <input type="text" id="ep-username" maxlength="30" value="${me.username || ''}" required>
        <label>Correo <span style="color:var(--red)">*</span></label>
        <input type="email" id="ep-email" value="${me.email || ''}" required>
        <label>Nueva contraseña <small style="text-transform:none;font-weight:400;color:var(--text-3)">(opcional)</small></label>
        <input type="password" id="ep-password" placeholder="Déjalo vacío para no cambiarla" minlength="8">
        <p class="error-msg hidden" id="ep-error"></p>
        <button type="submit" class="btn-confirmar">Guardar cambios</button>
      </form>
    </div>`;
  document.body.appendChild(ov);
  if (typeof initOjosPassword === 'function') initOjosPassword(ov);
  const cerrar = () => ov.remove();
  ov.querySelector('#ep-close').addEventListener('click', cerrar);
  ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });

  ov.querySelector('#ep-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = ov.querySelector('#ep-error'); errEl.classList.add('hidden');
    const body = {
      nombre: ov.querySelector('#ep-nombre').value.trim(),
      username: ov.querySelector('#ep-username').value.trim(),
      email: ov.querySelector('#ep-email').value.trim(),
      password: ov.querySelector('#ep-password').value,
    };
    const btn = ov.querySelector('.btn-confirmar');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
      const res = await fetch('/api/usuario/perfil', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        Object.assign(MIPERFIL, { nombre: body.nombre, username: body.username, email: body.email });
        pintarPerfil(MIPERFIL);
        if (typeof renderSessionBar === 'function') renderSessionBar();
        cerrar();
        showToast('Perfil actualizado.');
      } else { errEl.textContent = data.error || 'No se pudo guardar.'; errEl.classList.remove('hidden'); }
    } catch { errEl.textContent = 'Error de conexión.'; errEl.classList.remove('hidden'); }
    finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  });
});

// Tabs
document.querySelectorAll('.perfil-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.perfil-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.perfil-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`)?.classList.remove('hidden');
  });
});

/* ── Media de una publicación en el perfil ── */
function mediaPerfil(a) {
  if (a.estado && a.estado !== 'aprobado') {
    const icon = a.tipo === 'video' ? '🎬' : a.tipo === 'audio' ? '🎵' : a.tipo === 'imagen' ? '🖼️' : '📄';
    const txt = a.estado === 'pendiente' ? 'En revisión' : 'Rechazado';
    return `<div class="pp-media-ph"><span class="pp-ph-icon">${icon}</span><span class="pp-ph-txt">${txt}</span></div>`;
  }
  return mediaHtmlPost(a);
}

function estadoBadge(estado) {
  const label = { aprobado: 'Publicado', pendiente: 'Pendiente', rechazado: 'Rechazado' };
  return `<span class="pub-estado estado-${estado}">${label[estado] || estado}</span>`;
}

/* ── Card estilo post (mis publicaciones y perfil público) ── */
function pubCard(a, editable) {
  const card = document.createElement('article');
  card.className = 'feed-card pp-card';
  card.dataset.id = a.id;
  const link = `/carpeta.html?cat=${encodeURIComponent(a.categoria)}&archivo=${a.id}`;
  card.innerHTML = `
    <div class="feed-media">${mediaPerfil(a)}${editable && a.estado ? estadoBadge(a.estado) : ''}</div>
    <p class="feed-asunto">${(a.asunto || 'Sin asunto').replace(/</g, '&lt;')}</p>
    ${a.descripcion ? `<p class="feed-desc">${(a.descripcion || '').replace(/</g, '&lt;')}</p>` : ''}
    <div class="pp-meta-row">
      <a class="feed-cat" href="/carpeta.html?cat=${encodeURIComponent(a.categoria)}">${a.categoria}</a>
      <span class="pp-fecha">${a.fecha}</span>
      ${a.visitas != null ? `<span class="pp-vistas">👁 ${a.visitas}</span>` : ''}
      <a class="pp-abrir" href="${link}">Abrir →</a>
    </div>
    ${editable ? `<div class="pub-acciones">
      <button class="pub-btn pub-btn-editar">Editar</button>
      <button class="pub-btn pub-btn-eliminar">Eliminar</button>
    </div>` : ''}
  `;
  if (typeof activarReproductor === 'function') activarReproductor(card);
  if (editable) {
    card.querySelector('.pub-btn-editar').addEventListener('click', () => editarPublicacion(a));
    card.querySelector('.pub-btn-eliminar').addEventListener('click', async () => {
      if (!(await confirmar('¿Eliminar esta publicación permanentemente?', 'Eliminar', true))) return;
      const res = await fetch('/api/usuario/publicaciones/' + a.id, { method: 'DELETE' });
      const d = await res.json();
      if (d.ok) { showToast('Publicación eliminada.'); cargarPublicaciones(); }
      else showToast('Error: ' + (d.error || 'no se pudo eliminar'), 'error');
    });
  }
  return card;
}

async function cargarPublicaciones() {
  const wrap = document.getElementById('lista-publicaciones');
  const data = await fetch('/api/usuario/publicaciones').then(r => r.json());
  document.getElementById('pc-pubs').textContent = data.length;
  if (!data.length) {
    wrap.innerHTML = '<p class="vacio-txt">No has subido publicaciones todavía.</p>';
    return;
  }
  wrap.innerHTML = '';
  data.forEach(a => wrap.appendChild(pubCard(a, true)));
}

/* ── Editar una publicación propia (modal) ── */
function editarPublicacion(a) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="pe-close">✕</button>
      <p class="modal-title">Editar publicación</p>
      <form id="pe-form">
        <label>Asunto <span style="color:var(--red)">*</span></label>
        <input type="text" id="pe-asunto" maxlength="200" value="${(a.asunto || '').replace(/"/g, '&quot;')}" required>
        <label>Descripción</label>
        <textarea id="pe-desc" rows="4" maxlength="2000">${a.descripcion || ''}</textarea>
        <p class="error-msg hidden" id="pe-error"></p>
        <button type="submit" class="btn-confirmar">Guardar cambios</button>
      </form>
    </div>`;
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.querySelector('#pe-close').addEventListener('click', cerrar);
  ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
  ov.querySelector('#pe-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = ov.querySelector('#pe-error'); errEl.classList.add('hidden');
    const body = { asunto: ov.querySelector('#pe-asunto').value.trim(), descripcion: ov.querySelector('#pe-desc').value.trim() };
    const btn = ov.querySelector('.btn-confirmar'); btn.disabled = true; btn.textContent = 'Guardando...';
    try {
      const res = await fetch('/api/usuario/publicaciones/' + a.id, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) { cerrar(); showToast('Publicación actualizada.'); cargarPublicaciones(); }
      else { errEl.textContent = data.error || 'No se pudo guardar.'; errEl.classList.remove('hidden'); }
    } catch { errEl.textContent = 'Error de conexión.'; errEl.classList.remove('hidden'); }
    finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  });
}

/* ── Guardados (solo mi perfil) ── */
function thumbHtml(a) {
  if (a.tipo === 'imagen') return `<img src="${a.url}" loading="lazy">`;
  if (a.tipo === 'video')  return `<video src="${a.url}#t=0.5" preload="metadata" muted></video>`;
  if (a.tipo === 'audio')  return `<div class="audio-ph"></div>`;
  return `<div class="otro-ph">📄</div>`;
}

async function cargarGuardados() {
  const wrap = document.getElementById('lista-guardados');
  if (!wrap) return;
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
