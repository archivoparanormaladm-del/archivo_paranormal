// ── Estado de sesión (perfil + permisos delegables) ──────
let ME = {};

// ── Redirigir si no es admin ni super admin ──────────────
(async () => {
  ME = await renderSessionBar();
  if (!ME.autenticado || (ME.perfil !== 0 && ME.perfil !== 1)) {
    window.location.href = '/dashboard.html';
    return;
  }
  configurarSegunPermisos();
})();

const PERM = () => (ME.permisos || {});

// Muestra u oculta elementos según perfil/permisos delegados.
function configurarSegunPermisos() {
  // La pestaña "Permisos" solo la ve el Super Administrador.
  const tabPerm = document.getElementById('tab-btn-permisos');
  if (tabPerm) tabPerm.classList.toggle('hidden', ME.perfil !== 0);
}

// ── Tabs ──────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');

    if (tab.dataset.tab === 'pendientes') cargarPendientes();
    if (tab.dataset.tab === 'usuarios')   cargarUsuarios();
  });
});

// ── PENDIENTES ────────────────────────────────────────────
async function cargarPendientes() {
  const wrap = document.getElementById('lista-pendientes');
  wrap.innerHTML = '<p class="cargando">Cargando...</p>';

  const archivos = await fetch('/api/admin/pendientes').then(r => r.json());

  if (!archivos.length) {
    wrap.innerHTML = '<p class="sin-items">No hay archivos pendientes de revisión.</p>';
    return;
  }

  wrap.innerHTML = '';
  archivos.forEach(a => {
    const card = document.createElement('div');
    card.className = 'pendiente-card';

    let media = '';
    if (a.tipo === 'imagen') {
      media = `<img src="${a.url_preview}" alt="${a.nombre}" loading="lazy">`;
    } else if (a.tipo === 'video') {
      media = `<video src="${a.url_preview}" controls preload="none"></video>`;
    } else if (a.tipo === 'audio') {
      media = `<audio src="${a.url_preview}" controls></audio>`;
    }

    card.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="tipo-badge">${a.tipo}</span>
        <span class="cat-badge">${a.categoria}</span>
      </div>
      ${media}
      <p class="p-nombre">${a.nombre}</p>
      ${a.asunto ? `<p class="p-asunto">"${a.asunto}"</p>` : ''}
      ${a.descripcion ? `<p class="p-desc">"${a.descripcion}"</p>` : ''}
      <p class="p-meta">
        Usuario: <strong>${a.usuario || '–'}</strong><br>
        Correo: ${a.email || '–'}<br>
        Fecha: ${a.fecha}
      </p>
      <div class="acciones-card">
        <button class="btn-accion btn-verde" data-id="${a.id}" data-accion="aprobar">✓ Aprobar</button>
        <button class="btn-accion btn-rojo"  data-id="${a.id}" data-accion="rechazar">✗ Rechazar</button>
      </div>
    `;
    wrap.appendChild(card);
  });

  // Eventos aprobar / rechazar
  wrap.querySelectorAll('.btn-accion[data-accion]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id, accion } = btn.dataset;
      const esAprobar = accion === 'aprobar';
      const ok = await confirmar(
        `¿${esAprobar ? 'Aprobar' : 'Rechazar'} este archivo?`,
        esAprobar ? 'Aprobar' : 'Rechazar',
        !esAprobar);
      if (!ok) return;

      btn.disabled = true;
      try {
        const res = await fetch(`/api/admin/${accion}/${id}`, { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          showToast(esAprobar ? 'Archivo aprobado y publicado.' : 'Archivo rechazado.');
          cargarPendientes();
        } else {
          showToast('Error: ' + (data.error || 'desconocido'), 'error');
          btn.disabled = false;
        }
      } catch {
        showToast('No se pudo conectar con el servidor.', 'error');
        btn.disabled = false;
      }
    });
  });
}

// ── USUARIOS ──────────────────────────────────────────────
let uidPwdTarget = null;

async function cargarUsuarios() {
  const wrap = document.getElementById('tabla-usuarios-wrap');
  wrap.innerHTML = '<p class="cargando">Cargando...</p>';

  const usuarios = await fetch('/api/admin/usuarios').then(r => r.json());

  if (!usuarios.length) {
    wrap.innerHTML = '<p class="sin-items">No hay usuarios.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'tabla-usuarios';
  table.innerHTML = `
    <thead><tr>
      <th>#</th><th>Nombre</th><th>@Usuario</th><th>Correo</th>
      <th>Perfil</th><th>Subida</th><th>Estado</th><th>Registro</th><th>Acciones</th>
    </tr></thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');

  const PERFILES = ['Super Admin', 'Admin', 'Estándar', 'Restringido'];

  usuarios.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.nombre}</td>
      <td style="color:#cc0000">@${u.username || '–'}</td>
      <td>${u.email}</td>
      <td>
        <span class="perfil-badge perfil-${u.perfil}">${PERFILES[u.perfil]}</span>
      </td>
      <td>${u.perfil === 2 ? (u.puede_subir ? '<span class="estado-ok">✓ Sí</span>' : '<span class="estado-bloq">✗ No</span>') : '—'}</td>
      <td>${u.bloqueado ? '<span class="estado-bloq">Bloqueado</span>' : '<span class="estado-ok">Activo</span>'}</td>
      <td>${u.fecha}</td>
      <td>
        <div class="acciones-usuario">

          <!-- Cambiar perfil (asignar roles de admin: solo Super Admin) -->
          <select class="select-perfil" data-uid="${u.id}" data-accion="perfil">
            ${ME.perfil === 0 ? `<option value="0" ${u.perfil===0?'selected':''}>Super Admin</option>` : ''}
            <option value="1" ${u.perfil===1?'selected':''} ${ME.perfil!==0?'disabled':''}>Admin</option>
            <option value="2" ${u.perfil===2?'selected':''}>Estándar</option>
            <option value="3" ${u.perfil===3?'selected':''}>Restringido</option>
          </select>

          <!-- Editar datos (permiso delegable) -->
          ${PERM().editar_usuarios
            ? `<button class="btn-mini btn-mini-azul" data-uid="${u.id}" data-accion="editar-datos"
                       data-nombre="${u.nombre}" data-username="${u.username || ''}" data-email="${u.email}">Editar datos</button>`
            : ''}

          <!-- Bloquear / desbloquear -->
          ${u.bloqueado
            ? `<button class="btn-mini btn-mini-verde" data-uid="${u.id}" data-accion="desbloquear">Desbloquear</button>`
            : `<button class="btn-mini btn-mini-rojo"  data-uid="${u.id}" data-accion="bloquear">Bloquear</button>`
          }

          <!-- Habilitar/deshabilitar subida (solo perfil 2) -->
          ${u.perfil === 2
            ? u.puede_subir
              ? `<button class="btn-mini btn-mini-gris" data-uid="${u.id}" data-accion="deshabilitar-subida">− Subida</button>`
              : `<button class="btn-mini btn-mini-azul" data-uid="${u.id}" data-accion="habilitar-subida">+ Subida</button>`
            : ''
          }

          <!-- Cambiar contraseña -->
          <button class="btn-mini btn-mini-gris" data-uid="${u.id}" data-accion="password">Contraseña</button>

          <!-- Eliminar -->
          <button class="btn-mini btn-mini-rojo" data-uid="${u.id}" data-accion="eliminar">Eliminar</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wrap.innerHTML = '';
  wrap.appendChild(table);

  // ── Eventos de la tabla ──────────────────────────────────
  table.querySelectorAll('.select-perfil').forEach(sel => {
    sel.addEventListener('change', async () => {
      const uid    = sel.dataset.uid;
      const perfil = parseInt(sel.value);
      if (!(await confirmar(`¿Cambiar perfil del usuario a ${['Super Admin','Admin','Estándar','Restringido'][perfil]}?`, 'Cambiar'))) {
        cargarUsuarios(); return;
      }
      try {
        const res = await fetch(`/api/admin/usuarios/${uid}/perfil`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ perfil }),
        });
        const data = await res.json();
        if (data.ok) cargarUsuarios();
        else { alert('Error: ' + (data.error || 'no se pudo cambiar el perfil')); cargarUsuarios(); }
      } catch {
        alert('No se pudo guardar el cambio (error de servidor).');
        cargarUsuarios();
      }
    });
  });

  table.querySelectorAll('.btn-mini[data-accion]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid    = btn.dataset.uid;
      const accion = btn.dataset.accion;

      if (accion === 'password') {
        uidPwdTarget = uid;
        document.getElementById('nueva-pwd').value = '';
        document.getElementById('pwd-error').classList.add('hidden');
        document.getElementById('modal-pwd').classList.remove('hidden');
        return;
      }

      if (accion === 'eliminar') {
        if (!(await confirmar('¿Eliminar este usuario permanentemente?', 'Eliminar', true))) return;
        const res  = await fetch(`/api/admin/usuarios/${uid}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) cargarUsuarios(); else alert('Error: ' + data.error);
        return;
      }

      if (accion === 'editar-datos') {
        const nombre   = prompt('Nombre:', btn.dataset.nombre);
        if (nombre === null) return;
        const username = prompt('Nombre de usuario:', btn.dataset.username);
        if (username === null) return;
        const email    = prompt('Correo:', btn.dataset.email);
        if (email === null) return;
        const res  = await fetch(`/api/admin/usuarios/${uid}/datos`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, username, email }),
        });
        const data = await res.json();
        if (data.ok) cargarUsuarios(); else alert('Error: ' + data.error);
        return;
      }

      let url = '';
      let body = null;
      if (accion === 'bloquear')           url = `/api/admin/usuarios/${uid}/bloquear`;
      if (accion === 'desbloquear')        url = `/api/admin/usuarios/${uid}/desbloquear`;
      if (accion === 'habilitar-subida')   { url = `/api/admin/usuarios/${uid}/subida`; body = { habilitado: true }; }
      if (accion === 'deshabilitar-subida') { url = `/api/admin/usuarios/${uid}/subida`; body = { habilitado: false }; }

      const opts = { method: 'POST' };
      if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }

      const res  = await fetch(url, opts);
      const data = await res.json();
      if (data.ok) cargarUsuarios(); else alert('Error: ' + data.error);
    });
  });
}

// ── Modal contraseña ──────────────────────────────────────
document.getElementById('btn-confirmar-pwd').addEventListener('click', async () => {
  const errEl = document.getElementById('pwd-error');
  const nueva = document.getElementById('nueva-pwd').value;
  errEl.classList.add('hidden');

  if (nueva.length < 8) {
    errEl.textContent = 'Mínimo 8 caracteres.';
    errEl.classList.remove('hidden');
    return;
  }
  const res  = await fetch(`/api/admin/usuarios/${uidPwdTarget}/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: nueva }),
  });
  const data = await res.json();
  if (data.ok) {
    document.getElementById('modal-pwd').classList.add('hidden');
    alert('Contraseña actualizada.');
  } else {
    errEl.textContent = data.error || 'Error desconocido.';
    errEl.classList.remove('hidden');
  }
});

// ── Cargar al iniciar ─────────────────────────────────────
cargarPendientes();

// ── Tab publicados ────────────────────────────────────────
async function cargarPublicados() {
  const wrap = document.getElementById('lista-publicados');
  wrap.innerHTML = '<p class="cargando">Cargando...</p>';
  const data = await fetch('/api/admin/publicados').then(r => r.json());
  if (!data.length) { wrap.innerHTML = '<p class="sin-items">No hay archivos publicados.</p>'; return; }

  wrap.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'lista-pendientes';

  data.forEach(a => {
    const card = document.createElement('div');
    card.className = 'pendiente-card';
    card.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="tipo-badge">${a.tipo}</span>
        <span class="cat-badge">${a.categoria}</span>
        ${a.oculto ? '<span class="tipo-badge" style="background:rgba(251,191,36,.1);color:#fbbf24;border-color:rgba(251,191,36,.3)">OCULTO</span>' : ''}
      </div>
      <p class="p-asunto">${a.asunto || 'Sin asunto'}</p>
      <p class="p-nombre">${a.nombre}</p>
      <p class="p-meta">Usuario: <strong>${a.usuario}</strong> · ${a.fecha}</p>
      <div class="acciones-card" style="flex-wrap:wrap;gap:6px">
        <button class="btn-accion ${a.oculto ? 'btn-verde' : 'btn-rojo'}" 
                data-id="${a.id}" data-accion="ocultar" style="flex:unset;padding:8px 14px">
          ${a.oculto ? '👁 Mostrar' : '🚫 Ocultar'}
        </button>
        <button class="btn-accion" data-id="${a.id}" data-accion="editar-asunto"
                style="flex:unset;padding:8px 14px;background:rgba(99,102,241,.1);color:#a5b4fc;border:1px solid rgba(99,102,241,.25)">
          ✏ Editar asunto
        </button>
        ${PERM().mover_archivos ? `<button class="btn-accion" data-id="${a.id}" data-accion="mover" data-cat="${a.categoria}"
                style="flex:unset;padding:8px 14px;background:rgba(6,182,212,.1);color:#67e8f9;border:1px solid rgba(6,182,212,.25)">
          📁 Mover
        </button>` : ''}
        <button class="btn-accion" data-id="${a.id}" data-accion="editar-desc"
                style="flex:unset;padding:8px 14px;background:rgba(99,102,241,.1);color:#a5b4fc;border:1px solid rgba(99,102,241,.25)">
          📝 Editar descripción
        </button>
        <button class="btn-accion" data-id="${a.id}" data-accion="ver-comentarios"
                style="flex:unset;padding:8px 14px;background:rgba(255,255,255,.05);color:#aaa;border:1px solid rgba(255,255,255,.1)">
          💬 Comentarios
        </button>
        <button class="btn-accion btn-rojo" data-id="${a.id}" data-accion="eliminar-pub"
                style="flex:unset;padding:8px 14px">
          🗑 Eliminar
        </button>
      </div>
    `;
    grid.appendChild(card);
  });

  wrap.appendChild(grid);

  grid.querySelectorAll('.btn-accion[data-accion]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id, accion } = btn.dataset;

      if (accion === 'ocultar') {
        const res  = await fetch(`/api/admin/archivos/${id}/ocultar`, { method: 'POST' });
        const data = await res.json();
        if (data.ok) cargarPublicados();

      } else if (accion === 'editar-asunto') {
        const nuevo = prompt('Nuevo asunto:');
        if (nuevo === null) return;
        const res = await fetch(`/api/admin/archivos/${id}/asunto`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asunto: nuevo }),
        });
        if ((await res.json()).ok) cargarPublicados();

      } else if (accion === 'editar-desc') {
        const nueva = prompt('Nueva descripción (máx 200 palabras):');
        if (nueva === null) return;
        const res = await fetch(`/api/admin/archivos/${id}/descripcion`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ descripcion: nueva }),
        });
        if ((await res.json()).ok) { alert('Descripción actualizada.'); cargarPublicados(); }

      } else if (accion === 'ver-comentarios') {
        const res  = await fetch('/api/archivos/' + id + '/comentarios');
        const coms = await res.json();
        if (!coms.length) { alert('No hay comentarios en esta publicación.'); return; }
        
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:999;display:flex;align-items:center;justify-content:center;';
        
        let comsHtml = '';
        coms.forEach(c => {
          comsHtml += '<div style="background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;">';
          comsHtml += '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">';
          comsHtml += '<span style="font-size:12px;font-weight:600;color:var(--red)">' + c.autor + '</span>';
          comsHtml += '<div style="display:flex;gap:8px;align-items:center;">';
          comsHtml += '<span style="font-size:11px;color:var(--text-3)">' + c.fecha + '</span>';
          comsHtml += '<button class="del-com-admin" data-cid="' + c.id + '" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#f87171;font-size:11px;padding:3px 8px;border-radius:4px;cursor:pointer">Eliminar</button>';
          comsHtml += '</div></div>';
          comsHtml += '<p style="font-size:13px;color:var(--text)">' + c.texto + '</p>';
          comsHtml += '</div>';
        });

        modal.innerHTML = '<div style="background:var(--bg-1);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:520px;width:90%;max-height:80vh;overflow-y:auto;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
          '<p style="font-weight:600;color:var(--text)">Comentarios</p>' +
          '<button id="cerrar-com-modal" style="background:none;border:none;color:var(--text-2);font-size:1.2rem;cursor:pointer">✕</button>' +
          '</div>' + comsHtml + '</div>';
        
        document.body.appendChild(modal);
        modal.querySelector('#cerrar-com-modal').onclick = () => modal.remove();
        modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
        modal.querySelectorAll('.del-com-admin').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!(await confirmar('¿Eliminar este comentario?', 'Eliminar', true))) return;
            const r = await fetch('/api/comentarios/' + btn.dataset.cid, { method: 'DELETE' });
            if ((await r.json()).ok) { modal.remove(); cargarPublicados(); }
          });
        });

      } else if (accion === 'mover') {
        const cats = await fetch('/api/categorias').then(r => r.json());
        const destino = prompt(
          `Mover de "${btn.dataset.cat}" a otra categoría.\nEscribe el nombre exacto de destino:\n\n${cats.join(', ')}`,
          btn.dataset.cat);
        if (destino === null) return;
        const res  = await fetch(`/api/admin/archivos/${id}/mover`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoria: destino.trim() }),
        });
        const data = await res.json();
        if (data.ok) cargarPublicados(); else alert('Error: ' + (data.error || 'desconocido'));

      } else if (accion === 'eliminar-pub') {
        if (!(await confirmar('¿Eliminar este archivo permanentemente?', 'Eliminar', true))) return;
        const res = await fetch(`/api/admin/archivos/${id}`, { method: 'DELETE' });
        if ((await res.json()).ok) cargarPublicados();
      }
    });
  });
}

// Agregar al listener de tabs
document.querySelectorAll('.tab').forEach(tab => {
  if (tab.dataset.tab === 'publicados') {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById('tab-publicados').classList.remove('hidden');
      cargarPublicados();
    });
  }
});

// ══ ESTADÍSTICAS ══
async function cargarEstadisticas() {
  const grid = document.getElementById('stats-grid');
  const top  = document.getElementById('top-archivos-wrap');
  grid.innerHTML = '<p class="cargando">Cargando...</p>';
  const data = await fetch('/api/admin/estadisticas').then(r => r.json());

  const items = [
    { label: 'Archivos publicados', valor: data.total_archivos },
    { label: 'Usuarios registrados', valor: data.total_usuarios },
    { label: 'Pendientes de aprobación', valor: data.total_pendientes },
    { label: 'Total likes', valor: data.total_likes },
    { label: 'Comentarios', valor: data.total_comentarios },
    { label: 'Visitas totales', valor: data.total_visitas },
  ];

  grid.innerHTML = items.map(i => `
    <div class="stat-card">
      <p class="stat-valor">${i.valor}</p>
      <p class="stat-label">${i.label}</p>
    </div>
  `).join('');

  if (data.top_archivos && data.top_archivos.length) {
    top.innerHTML = '<p class="section-title" style="margin-bottom:12px">Top archivos por likes</p>' +
      data.top_archivos.map((a, i) => `
        <div style="display:flex;justify-content:space-between;padding:10px 14px;background:var(--bg-1);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
          <span style="font-size:13px;color:var(--text)">${i+1}. ${a.asunto}</span>
          <span style="font-size:12px;color:var(--red)">♥ ${a.likes} · ${a.visitas} visitas</span>
        </div>
      `).join('');
  }
}

// ══ REPORTES ══
async function cargarReportes() {
  const wrap = document.getElementById('lista-reportes');
  wrap.innerHTML = '<p class="cargando">Cargando...</p>';
  const data = await fetch('/api/admin/reportes').then(r => r.json());
  if (!data.length) { wrap.innerHTML = '<p class="sin-items">No hay reportes pendientes.</p>'; return; }
  wrap.innerHTML = data.map(r => `
    <div style="background:var(--bg-1);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <div>
        <p style="font-size:12px;font-weight:600;color:var(--red);margin-bottom:4px">${r.tipo.toUpperCase()} #${r.objeto_id}</p>
        <p style="font-size:13px;color:var(--text)">${r.motivo || 'Sin motivo'}</p>
        <p style="font-size:11px;color:var(--text-3);margin-top:4px">${r.fecha}</p>
      </div>
      <button class="btn-mini btn-mini-verde" onclick="resolverReporte(${r.id}, this)">Resolver</button>
    </div>
  `).join('');
}

async function resolverReporte(id, btn) {
  btn.disabled = true;
  const res = await fetch('/api/admin/reportes/' + id + '/resolver', { method: 'POST' });
  if ((await res.json()).ok) cargarReportes();
}

// ══ CATEGORÍAS ══
async function cargarCategorias() {
  const wrap = document.getElementById('lista-categorias');
  wrap.innerHTML = '<p class="cargando">Cargando...</p>';
  const cats = await fetch('/api/admin/categorias').then(r => r.json());
  if (!cats.length) { wrap.innerHTML = '<p class="sin-items">No hay categorías.</p>'; return; }

  wrap.innerHTML = '';
  cats.forEach(c => {
    const row = document.createElement('div');
    row.className = 'cat-item';
    row.innerHTML = `
      <div class="cat-info">
        <span class="cat-nombre">${c.nombre}</span>
        <span class="cat-count">${c.archivos} archivo${c.archivos !== 1 ? 's' : ''}</span>
      </div>
      <div class="cat-acciones">
        ${PERM().renombrar_carpetas
          ? `<button class="btn-mini btn-mini-azul" data-id="${c.id}" data-nombre="${c.nombre}" data-accion="renombrar">Renombrar</button>`
          : ''}
        <button class="btn-mini btn-mini-rojo" data-id="${c.id}" data-nombre="${c.nombre}" data-accion="eliminar"
                ${c.archivos > 0 ? 'disabled title="Tiene archivos; no se puede eliminar"' : ''}>
          Eliminar
        </button>
      </div>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll('.btn-mini-azul[data-accion="renombrar"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nuevo = prompt(`Nuevo nombre para "${btn.dataset.nombre}":`, btn.dataset.nombre);
      if (nuevo === null) return;
      const res  = await fetch(`/api/admin/categorias/${btn.dataset.id}/renombrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevo.trim() }),
      });
      const data = await res.json();
      if (data.ok) cargarCategorias();
      else alert('Error: ' + (data.error || 'desconocido'));
    });
  });

  wrap.querySelectorAll('.btn-mini-rojo:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar(`¿Eliminar la categoría "${btn.dataset.nombre}"?`, 'Eliminar', true))) return;
      const res  = await fetch('/api/admin/categorias/' + btn.dataset.id, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) cargarCategorias();
      else alert('Error: ' + (data.error || 'desconocido'));
    });
  });
}

document.getElementById('btn-crear-cat').addEventListener('click', async () => {
  const input = document.getElementById('nueva-cat');
  const errEl = document.getElementById('cat-error');
  errEl.classList.add('hidden');
  const nombre = input.value.trim();
  if (!nombre) { errEl.textContent = 'Escribe un nombre.'; errEl.classList.remove('hidden'); return; }

  const res  = await fetch('/api/admin/categorias', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
  });
  const data = await res.json();
  if (data.ok) {
    input.value = '';
    cargarCategorias();
  } else {
    errEl.textContent = data.error || 'No se pudo crear la categoría.';
    errEl.classList.remove('hidden');
  }
});

// Agregar listeners para nuevos tabs
document.querySelectorAll('.tab').forEach(tab => {
  if (tab.dataset.tab === 'categorias') {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById('tab-categorias').classList.remove('hidden');
      cargarCategorias();
    });
  }
  if (tab.dataset.tab === 'estadisticas') {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById('tab-estadisticas').classList.remove('hidden');
      cargarEstadisticas();
    });
  }
  if (tab.dataset.tab === 'reportes') {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById('tab-reportes').classList.remove('hidden');
      cargarReportes();
    });
  }
  if (tab.dataset.tab === 'soporte') {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById('tab-soporte').classList.remove('hidden');
      cargarSoporte();
    });
  }
  if (tab.dataset.tab === 'permisos') {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById('tab-permisos').classList.remove('hidden');
      cargarPermisos();
    });
  }
});

// ══ SOPORTE (bandeja) ══
const ESTADO_BADGE = {
  abierto:    'background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.3)',
  respondido: 'background:rgba(74,222,128,.12);color:#4ade80;border:1px solid rgba(74,222,128,.3)',
  cerrado:    'background:var(--bg-3);color:var(--text-3);border:1px solid var(--border)',
};

async function cargarSoporte() {
  const wrap = document.getElementById('lista-soporte');
  wrap.innerHTML = '<p class="cargando">Cargando...</p>';
  const tickets = await fetch('/api/admin/soporte').then(r => r.json());
  if (!tickets.length) { wrap.innerHTML = '<p class="sin-items">No hay solicitudes de soporte.</p>'; return; }

  wrap.innerHTML = '';
  tickets.forEach(t => {
    const card = document.createElement('div');
    card.className = 'ticket-card';
    const badge = ESTADO_BADGE[t.estado] || '';
    card.innerHTML = `
      <div class="ticket-head">
        <span class="ticket-num">${t.numero}</span>
        <span class="ticket-badge" style="${badge}">${t.estado}</span>
      </div>
      <p class="ticket-asunto">${t.asunto}</p>
      <p class="ticket-com">${t.comentario}</p>
      <p class="ticket-meta">De: <strong>${t.usuario}</strong> · ${t.email} · ${t.fecha}</p>
      ${t.respuesta ? `<div class="ticket-resp"><span>Respuesta:</span> ${t.respuesta}</div>` : ''}
      <div class="ticket-form">
        <textarea rows="2" placeholder="Escribe una respuesta..." data-id="${t.id}">${t.respuesta || ''}</textarea>
        <div class="ticket-acciones">
          <button class="btn-mini btn-mini-verde" data-id="${t.id}" data-estado="respondido">Responder</button>
          <button class="btn-mini btn-mini-gris"  data-id="${t.id}" data-estado="cerrado">Cerrar ticket</button>
        </div>
      </div>
    `;
    wrap.appendChild(card);
  });

  wrap.querySelectorAll('.ticket-acciones button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ta = wrap.querySelector(`textarea[data-id="${btn.dataset.id}"]`);
      const respuesta = ta.value.trim();
      const estado = btn.dataset.estado;
      if (estado === 'respondido' && !respuesta) { alert('Escribe una respuesta.'); return; }
      const res  = await fetch(`/api/admin/soporte/${btn.dataset.id}/responder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuesta, estado }),
      });
      const data = await res.json();
      if (data.ok) cargarSoporte(); else alert('Error: ' + (data.error || 'desconocido'));
    });
  });
}

// ══ PERMISOS (solo Super Admin) ══
const PERMISOS_LABEL = {
  renombrar_carpetas: 'Cambiar el nombre de las carpetas',
  mover_archivos:     'Mover archivos de una carpeta a otra',
  editar_usuarios:    'Modificar los datos de los usuarios',
  editar_peso:        'Editar el peso máximo de subida',
};

async function cargarPermisos() {
  const wrap = document.getElementById('lista-permisos');
  wrap.innerHTML = '<p class="cargando">Cargando...</p>';
  const cfg = await fetch('/api/superadmin/config').then(r => r.json());

  wrap.innerHTML = '';
  Object.entries(PERMISOS_LABEL).forEach(([clave, label]) => {
    const activo = cfg.permisos[clave];
    const row = document.createElement('div');
    row.className = 'perm-item';
    row.innerHTML = `
      <span class="perm-label">${label}</span>
      <label class="switch">
        <input type="checkbox" data-clave="${clave}" ${activo ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', async () => {
      const res  = await fetch('/api/superadmin/permisos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: chk.dataset.clave, valor: chk.checked }),
      });
      const data = await res.json();
      if (!data.ok) { alert('Error: ' + (data.error || 'desconocido')); chk.checked = !chk.checked; }
    });
  });

  document.getElementById('peso-max').value = cfg.max_content_mb;
}

document.getElementById('btn-guardar-peso').addEventListener('click', async () => {
  const msg = document.getElementById('peso-msg');
  const mb  = parseInt(document.getElementById('peso-max').value);
  const res  = await fetch('/api/admin/config/peso-max', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mb }),
  });
  const data = await res.json();
  msg.textContent = data.ok ? `✓ Peso máximo actualizado a ${data.max_content_mb} MB` : ('Error: ' + (data.error || 'desconocido'));
});
