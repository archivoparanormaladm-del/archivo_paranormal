let MIPERFIL = {};

renderSessionBar().then(me => {
  if (!me.autenticado) {
    window.location.href = '/';
    return;
  }
  MIPERFIL = me;
  pintarPerfil(me);
  cargarPublicaciones();
  cargarGuardados();
});

/* ── Tarjeta de perfil ── */
function pintarPerfil(me) {
  document.getElementById('perfil-nombre').textContent = me.nombre || '';
  document.getElementById('perfil-username').textContent = '@' + (me.username || '');
  document.getElementById('perfil-email').textContent = me.email || '';
  const img = document.getElementById('avatar-img');
  const ph = document.getElementById('avatar-ph');
  if (me.avatar) {
    img.src = me.avatar + '?t=' + Date.now();
    img.classList.remove('hidden'); ph.classList.add('hidden');
  } else {
    img.classList.add('hidden'); ph.classList.remove('hidden');
  }
}

/* ── Subir avatar ── */
document.getElementById('avatar-wrap').addEventListener('click', () => {
  document.getElementById('avatar-input').click();
});
document.getElementById('avatar-input').addEventListener('change', async e => {
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
      showToast('Foto de perfil actualizada.');
    } else { showToast('Error: ' + (data.error || 'no se pudo subir'), 'error'); }
  } catch { showToast('No se pudo conectar con el servidor.', 'error'); }
});

/* ── Editar perfil (modal) ── */
document.getElementById('btn-editar-perfil').addEventListener('click', () => {
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
        <div class="pub-acciones">
          <button class="pub-btn pub-btn-editar">Editar</button>
          <button class="pub-btn pub-btn-eliminar">Eliminar</button>
        </div>
      </div>
    `;
    card.querySelector('.pub-btn-editar').addEventListener('click', () => editarPublicacion(a));
    card.querySelector('.pub-btn-eliminar').addEventListener('click', async () => {
      if (!(await confirmar('¿Eliminar esta publicación permanentemente?', 'Eliminar', true))) return;
      const res = await fetch('/api/usuario/publicaciones/' + a.id, { method: 'DELETE' });
      const d = await res.json();
      if (d.ok) { showToast('Publicación eliminada.'); cargarPublicaciones(); }
      else showToast('Error: ' + (d.error || 'no se pudo eliminar'), 'error');
    });
    wrap.appendChild(card);
  });
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
