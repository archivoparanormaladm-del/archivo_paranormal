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
  // Los permisos delegables se editan desde la columna "Permisos" de
  // Gestión de Usuarios; ya no hay pestaña propia que ocultar.

  // El Super Admin (perfil 0) tiene todas las capacidades. Se muestran las
  // secciones de forma explícita en vez de salir sin más: así la función
  // deja el mismo resultado se llame las veces que se llame, y no arrastra
  // ocultamientos de una ejecución anterior.
  if (ME.perfil === 0) {
    document.querySelectorAll('.admin-sidebar .tab').forEach(t => t.classList.remove('hidden'));
    document.getElementById('cat-form')?.classList.remove('hidden');
    return;
  }

  const p = PERM();
  const tabPorPermiso = {
    pendientes: p.moderar_archivos,
    usuarios:   p.gestionar_usuarios || p.editar_usuarios,
    soporte:    p.responder_soporte,
    reportes:   p.gestionar_reportes,
    // El servidor ya bloqueaba guardar en estas dos, pero la sección se
    // veía igual: se entraba, se tocaban los campos y el error aparecía
    // recién al pulsar Guardar. Ahora se ocultan, como el resto.
    pesos:      p.editar_peso,
    // Donaciones sólo lo cambia el Super Administrador, y éste ya salió
    // por el `return` de arriba: para un Administrador nunca aplica.
    donaciones: false,
  };
  Object.entries(tabPorPermiso).forEach(([tab, permitido]) => {
    const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
    if (btn) btn.classList.toggle('hidden', !permitido);
  });

  // Formulario de crear categoría: solo con permiso.
  const catForm = document.getElementById('cat-form');
  if (catForm) catForm.classList.toggle('hidden', !p.gestionar_categorias);

  // Si la pestaña activa quedó oculta, activar la primera visible.
  const activa = document.querySelector('.tab.active');
  if (activa && activa.classList.contains('hidden')) {
    const primera = document.querySelector('.tab:not(.hidden)');
    if (primera) primera.click();
  }
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
    if ((a.piezas || []).length > 1) {
      media = rejillaPiezas(a.piezas);
    } else if (a.tipo === 'imagen') {
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

const ICO_LAPIZ = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICO_ESCUDO = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>';

// La tabla vive en un contenedor con scroll horizontal que recorta a sus
// hijos posicionados, y `.tab-content` lleva backdrop-filter, que convierte
// a la tarjeta en el bloque contenedor de cualquier `position: fixed`. Por
// las dos razones el panel se traslada al <body> mientras está abierto y
// se sitúa por coordenadas de ventana.
//
// Las medidas se toman de documentElement y no de innerWidth/innerHeight:
// con emulación de móvil, innerWidth puede devolver el ancho del panel del
// navegador (896) en lugar del viewport real (375).
function colocarMenuLapiz(btn, panel) {
  if (panel.parentElement !== document.body) {
    panel._origen = panel.parentElement;            // para devolverlo al cerrar
    document.body.appendChild(panel);
  }
  panel.style.top = panel.style.left = 'auto';

  const anchoV = document.documentElement.clientWidth;
  const altoV  = document.documentElement.clientHeight;
  const b = btn.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const margen = 8;

  let izq = b.right - p.width;                      // alineado a la derecha del botón
  izq = Math.min(izq, anchoV - p.width - margen);
  izq = Math.max(margen, izq);

  let arriba = b.bottom + 6;
  if (arriba + p.height > altoV - margen) {          // no cabe abajo: se abre hacia arriba
    arriba = Math.max(margen, b.top - p.height - 6);
  }
  panel.style.left = izq + 'px';
  panel.style.top  = arriba + 'px';
}

// Menú del lápiz: sólo uno abierto a la vez y se cierra al pulsar fuera.
function cerrarMenusLapiz(salvo) {
  document.querySelectorAll('.lapiz-panel').forEach(pnl => {
    if (pnl === salvo) return;
    pnl.classList.add('hidden');
    // Devolverlo a su fila: si la tabla se repinta, se va con ella y no
    // quedan paneles huérfanos colgando del <body>.
    if (pnl._origen && pnl.parentElement === document.body) {
      pnl._origen.appendChild(pnl);
    }
  });
}
document.addEventListener('click', e => {
  if (!e.target.closest('.menu-lapiz')) cerrarMenusLapiz(null);
});
// Con posición fija, el panel no sigue al contenido: es preferible cerrarlo.
addEventListener('scroll', () => cerrarMenusLapiz(null), true);
addEventListener('resize', () => cerrarMenusLapiz(null));

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
      <th>Perfil</th><th>Estado</th><th>Registro</th><th>Permisos</th><th>Acciones</th>
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
      <td>${u.bloqueado ? '<span class="estado-bloq">Bloqueado</span>' : '<span class="estado-ok">Activo</span>'}</td>
      <td>${u.fecha}</td>
      <td>
        <button class="btn-mini btn-permisos" data-uid="${u.id}" data-perfil="${u.perfil}"
                data-accion="permisos" ${u.perfil > 1 ? 'disabled title="Sólo para Administrador y Super Administrador"' : ''}>
          ${ICO_ESCUDO} Permisos
        </button>
      </td>
      <td>
        <div class="acciones-usuario">

          <!-- Cambiar perfil (asignar roles de admin: solo Super Admin) -->
          ${PERM().gestionar_usuarios ? `<select class="select-perfil" data-uid="${u.id}" data-accion="perfil">
            ${ME.perfil === 0 ? `<option value="0" ${u.perfil===0?'selected':''}>Super Admin</option>` : ''}
            <option value="1" ${u.perfil===1?'selected':''} ${ME.perfil!==0?'disabled':''}>Admin</option>
            <option value="2" ${u.perfil===2?'selected':''}>Estándar</option>
            <option value="3" ${u.perfil===3?'selected':''}>Restringido</option>
          </select>` : ''}

          <!-- El resto de acciones vive dentro del menú del lápiz, para que
               la fila no se llene de botones. -->
          ${PERM().editar_usuarios || PERM().gestionar_usuarios ? `
          <div class="menu-lapiz">
            <button class="btn-lapiz" data-uid="${u.id}" data-accion="menu" title="Más acciones" aria-label="Más acciones">
              ${ICO_LAPIZ}
            </button>
            <div class="lapiz-panel hidden">
              ${PERM().editar_usuarios
                ? `<button class="lapiz-op" data-uid="${u.id}" data-accion="editar-datos"
                           data-nombre="${u.nombre}" data-username="${u.username || ''}" data-email="${u.email}">Editar datos</button>`
                : ''}
              ${PERM().gestionar_usuarios ? `
                ${u.bloqueado
                  ? `<button class="lapiz-op" data-uid="${u.id}" data-accion="desbloquear">Desbloquear</button>`
                  : `<button class="lapiz-op" data-uid="${u.id}" data-accion="bloquear">Bloquear</button>`}
                ${u.perfil === 2
                  ? (u.puede_subir
                      ? `<button class="lapiz-op" data-uid="${u.id}" data-accion="deshabilitar-subida">Quitar permiso de subida</button>`
                      : `<button class="lapiz-op" data-uid="${u.id}" data-accion="habilitar-subida">Dar permiso de subida</button>`)
                  : ''}
                <button class="lapiz-op" data-uid="${u.id}" data-accion="password">Cambiar contraseña</button>
                <button class="lapiz-op lapiz-op-peligro" data-uid="${u.id}" data-accion="eliminar">Eliminar usuario</button>
              ` : ''}
            </div>
          </div>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wrap.innerHTML = '';
  wrap.appendChild(table);

  // ── Eventos de la tabla ──────────────────────────────────
  table.querySelectorAll('.btn-lapiz').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const panel = btn.nextElementSibling;
      const abierto = !panel.classList.contains('hidden');
      cerrarMenusLapiz(null);
      if (abierto) { panel.classList.add('hidden'); return; }
      panel.classList.remove('hidden');
      colocarMenuLapiz(btn, panel);
    });
  });
  // Al elegir una opción, el menú se cierra
  table.querySelectorAll('.lapiz-op').forEach(op => {
    op.addEventListener('click', () => cerrarMenusLapiz(null));
  });

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

  table.querySelectorAll('.btn-mini[data-accion], .lapiz-op[data-accion]').forEach(btn => {
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

      if (accion === 'permisos') {
        abrirModalPermisos(uid, btn.dataset.perfil);
        return;   // sin esto caía al bloque de abajo y disparaba un POST a url vacía
      }

      if (accion === 'eliminar') {
        if (!(await confirmar('¿Eliminar este usuario permanentemente?', 'Eliminar', true))) return;
        const res  = await fetch(`/api/admin/usuarios/${uid}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) cargarUsuarios(); else alert('Error: ' + data.error);
        return;
      }

      if (accion === 'editar-datos') {
        abrirModalDatos(uid, btn.dataset);
        return;
      }

      let url = '';
      let body = null;
      if (accion === 'bloquear')           url = `/api/admin/usuarios/${uid}/bloquear`;
      if (accion === 'desbloquear')        url = `/api/admin/usuarios/${uid}/desbloquear`;
      if (accion === 'habilitar-subida')   { url = `/api/admin/usuarios/${uid}/subida`; body = { habilitado: true }; }
      if (accion === 'deshabilitar-subida') { url = `/api/admin/usuarios/${uid}/subida`; body = { habilitado: false }; }

      if (!url) return;   // acción sin URL: nunca disparar un POST fantasma

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

  PUBLICADOS = {};
  data.forEach(a => {
    PUBLICADOS[a.id] = a;
    const card = document.createElement('div');
    card.className = 'pendiente-card';
    card.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="tipo-badge">${a.tipo}</span>
        <span class="cat-badge">${a.categoria}</span>
        ${a.oculto ? '<span class="tipo-badge" style="background:rgba(251,191,36,.1);color:#fbbf24;border-color:rgba(251,191,36,.3)">OCULTO</span>' : ''}
      </div>
      ${rejillaPiezas(a.piezas)}
      <p class="p-asunto">${a.asunto || 'Sin asunto'}</p>
      <p class="p-nombre">${(a.piezas || []).length > 1 ? a.nombre + ' + ' + (a.piezas.length - 1) + ' más' : a.nombre}</p>
      <p class="p-meta">Usuario: <strong>${a.usuario}</strong> · ${a.fecha}</p>
      <p class="p-meta p-aprobacion">
        Aprobado por <strong>${a.aprobado_por || '—'}</strong>
        ${a.aprobado_en ? ` · ${a.aprobado_en}` : ''}
      </p>
      <div class="acciones-card" style="flex-wrap:wrap;gap:6px">
        ${PERM().eliminar_publicaciones ? `<button class="btn-accion ${a.oculto ? 'btn-verde' : 'btn-rojo'}"
                data-id="${a.id}" data-accion="ocultar" style="flex:unset;padding:8px 14px">
          ${a.oculto ? '👁 Mostrar' : '🚫 Ocultar'}
        </button>` : ''}
        <button class="btn-accion btn-editar" data-id="${a.id}" data-accion="editar">
          ✏ Editar
        </button>
        <button class="btn-accion" data-id="${a.id}" data-accion="ver-comentarios"
                style="flex:unset;padding:8px 14px;background:rgba(255,255,255,.05);color:#aaa;border:1px solid rgba(255,255,255,.1)">
          💬 Comentarios
        </button>
        ${PERM().eliminar_publicaciones ? `<button class="btn-accion btn-rojo" data-id="${a.id}" data-accion="eliminar-pub"
                style="flex:unset;padding:8px 14px">
          🗑 Eliminar
        </button>` : ''}
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

      } else if (accion === 'editar') {
        abrirModalEditar(PUBLICADOS[id]);

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
// ══ ESTADÍSTICAS ══
// Los gráficos se dibujan con SVG en línea: la app no tiene paso de
// compilación y una librería de gráficos pesaría más que todo el panel.
//
// Color: las series de una sola medida (actividad, categorías, top) van
// en UN solo tono —el del tema—, porque codifican magnitud, no identidad;
// pintar cada barra de un color distinto sugeriría categorías donde no las
// hay. El reparto por tipo sí son identidades, así que usa una paleta
// categórica de cuatro tonos verificada para daltonismo en claro y oscuro.
const PALETA_TIPOS = {
  claro:  ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  oscuro: ['#3987e5', '#d95926', '#199e70', '#c98500'],
};
const paletaTipos = () =>
  PALETA_TIPOS[document.documentElement.getAttribute('data-modo') === 'claro' ? 'claro' : 'oscuro'];

const esc = t => String(t ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nfmt = n => (Number(n) || 0).toLocaleString('es-CL');

// Marco común de cada gráfico: título arriba, lámina debajo.
function marco(titulo, subtitulo, cuerpo) {
  return `<figcaption class="g-cabecera">
            <span class="g-titulo">${esc(titulo)}</span>
            ${subtitulo ? `<span class="g-sub">${esc(subtitulo)}</span>` : ''}
          </figcaption>
          <div class="g-lamina">${cuerpo}</div>`;
}

// ── Área de actividad: una serie, sin leyenda (el título ya la nombra) ──
function grafActividad(serie) {
  if (!serie || !serie.length) return marco('Actividad', '', '<p class="g-vacio">Sin datos.</p>');
  const W = 640, H = 170, mx = 8, my = 14;
  const max = Math.max(1, ...serie.map(d => d.n));
  const px = i => mx + (i * (W - mx * 2)) / Math.max(1, serie.length - 1);
  const py = v => H - my - (v / max) * (H - my * 2);
  const puntos = serie.map((d, i) => [px(i), py(d.n)]);
  const linea = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area  = `${linea} L${px(serie.length - 1).toFixed(1)} ${H - my} L${mx} ${H - my} Z`;
  const ult   = serie[serie.length - 1];
  const total = serie.reduce((a, d) => a + d.n, 0);
  // Rejilla discreta en tres niveles, sin líneas discontinuas.
  const rejilla = [0, .5, 1].map(f =>
    `<line x1="${mx}" x2="${W - mx}" y1="${py(max * f)}" y2="${py(max * f)}" class="g-rejilla"/>`).join('');
  return marco('Subidas por día', `Últimos 30 días · ${nfmt(total)} en total`, `
    <svg viewBox="0 0 ${W} ${H}" class="g-svg" role="img"
         aria-label="Subidas por día en los últimos 30 días. Total ${nfmt(total)}.">
      ${rejilla}
      <path d="${area}" class="g-area"/>
      <path d="${linea}" class="g-linea"/>
      <circle cx="${px(serie.length - 1).toFixed(1)}" cy="${py(ult.n).toFixed(1)}" r="4.5" class="g-punto"/>
    </svg>
    <div class="g-eje-x"><span>${esc(serie[0].fecha)}</span><span>${esc(ult.fecha)}</span></div>
    <p class="g-nota">Máximo en un día: <strong>${nfmt(max)}</strong></p>`);
}

// ── Barras horizontales: magnitud, un solo tono, valor en la punta ──
function grafBarras(titulo, subtitulo, filas, vacio) {
  if (!filas || !filas.length) return marco(titulo, subtitulo, `<p class="g-vacio">${esc(vacio)}</p>`);
  const max = Math.max(1, ...filas.map(f => f.n));
  return marco(titulo, subtitulo, `<div class="g-barras">` + filas.map(f => `
      <div class="g-fila">
        <span class="g-etq" title="${esc(f.nombre)}">${esc(f.nombre)}</span>
        <span class="g-pista"><span class="g-barra" style="width:${Math.max(2, (f.n / max) * 100)}%"></span></span>
        <span class="g-val">${nfmt(f.n)}</span>
      </div>`).join('') + `</div>`);
}

// ── Barra apilada por tipo: aquí sí hay identidades, con leyenda ──
function grafTipos(filas) {
  if (!filas || !filas.length)
    return marco('Reparto por tipo', '', '<p class="g-vacio">Sin publicaciones.</p>');
  const col = paletaTipos();
  const total = filas.reduce((a, f) => a + f.n, 0) || 1;
  // Un hueco de 2 px del color de la lámina separa los segmentos; no se
  // dibuja borde alrededor, que añadiría tinta que no es dato.
  const segmentos = filas.map((f, i) => `
    <span class="g-seg" style="flex:${f.n};background:${col[i % col.length]}"
          title="${esc(f.nombre)}: ${nfmt(f.n)}"></span>`).join('');
  const leyenda = filas.map((f, i) => `
    <span class="g-leg">
      <span class="g-punto-leg" style="background:${col[i % col.length]}"></span>
      ${esc(f.nombre)} <strong>${nfmt(f.n)}</strong>
      <span class="g-pct">${Math.round((f.n / total) * 100)}%</span>
    </span>`).join('');
  return marco('Reparto por tipo', `${nfmt(total)} publicaciones`,
    `<div class="g-apilada">${segmentos}</div><div class="g-leyenda">${leyenda}</div>`);
}

async function cargarEstadisticas() {
  const grid = document.getElementById('stats-grid');
  // Sólo se anuncia la carga la primera vez. Al volver a entrar en la
  // pestaña, borrar lo ya pintado dejaba un "Cargando..." suelto encima
  // de unos gráficos que seguían en pantalla.
  if (!grid.querySelector('.stat-card')) grid.innerHTML = '<p class="cargando">Cargando...</p>';
  const data = await fetch('/api/admin/estadisticas').then(r => r.json());

  // Cifras: primero las tres que se miran a diario, luego el resto.
  const items = [
    { label: 'Archivos publicados',      valor: data.total_archivos,    destacado: true },
    { label: 'Pendientes de aprobación', valor: data.total_pendientes,  destacado: true, alerta: data.total_pendientes > 0 },
    { label: 'Visitas totales',          valor: data.total_visitas,     destacado: true },
    { label: 'Usuarios registrados',     valor: data.total_usuarios },
    { label: 'Me gusta',                 valor: data.total_likes },
    { label: 'Comentarios',              valor: data.total_comentarios },
    { label: 'Guardados',                valor: data.total_guardados },
    { label: 'Rechazados',               valor: data.total_rechazados },
  ];
  grid.innerHTML = items.map(i => `
    <div class="stat-card${i.destacado ? ' stat-destacada' : ''}${i.alerta ? ' stat-alerta' : ''}">
      <p class="stat-valor">${nfmt(i.valor)}</p>
      <p class="stat-label">${esc(i.label)}</p>
    </div>`).join('');

  document.getElementById('g-actividad').innerHTML = grafActividad(data.por_dia);
  document.getElementById('g-categorias').innerHTML =
    grafBarras('Publicaciones por categoría', 'Sólo aprobadas', data.por_categoria, 'Sin publicaciones.');
  document.getElementById('g-tipos').innerHTML = grafTipos(data.por_tipo);
  document.getElementById('g-top').innerHTML = grafBarras(
    'Más gustadas', 'Top 5 por «me gusta»',
    (data.top_archivos || []).map(a => ({ nombre: a.asunto, n: a.likes })),
    'Todavía no hay reacciones.');
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


// ══ SELECTOR DE ICONOS ══
// Pinta la librería de static/iconos.js agrupada, y recuerda la clave
// elegida en `contenedor.dataset.icono`. Se usa tanto en el formulario de
// crear categoría como en el cambio de icono de una categoría existente.
function montarPickerIconos(contenedor, seleccionado) {
  const grupos = iconosPorGrupo();
  contenedor.dataset.icono = seleccionado || '';
  contenedor.innerHTML = Object.entries(grupos).map(([grupo, iconos]) => `
    <div class="ico-grupo">
      <p class="ico-grupo-titulo">${grupo}</p>
      <div class="ico-grid">
        ${iconos.map(i => `
          <button type="button" class="ico-opcion${i.clave === seleccionado ? ' activo' : ''}"
                  data-clave="${i.clave}" title="${i.nombre}" aria-label="${i.nombre}">
            <svg viewBox="0 0 24 24" aria-hidden="true">${i.d}</svg>
          </button>`).join('')}
      </div>
    </div>`).join('');

  contenedor.querySelectorAll('.ico-opcion').forEach(btn => {
    btn.addEventListener('click', () => {
      const yaEstaba = btn.classList.contains('activo');
      contenedor.querySelectorAll('.ico-opcion').forEach(b => b.classList.remove('activo'));
      // Volver a pulsar el icono activo lo deselecciona.
      if (yaEstaba) { contenedor.dataset.icono = ''; return; }
      btn.classList.add('activo');
      contenedor.dataset.icono = btn.dataset.clave;
    });
  });
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
        <span class="cat-icono"><svg viewBox="0 0 24 24" aria-hidden="true">${svgIcono(c.icono, c.nombre)}</svg></span>
        <span class="cat-nombre">${c.nombre}</span>
        <span class="cat-count">${c.archivos} archivo${c.archivos !== 1 ? 's' : ''}</span>
      </div>
      <div class="cat-acciones">
        ${PERM().gestionar_categorias
          ? `<button class="btn-mini btn-mini-gris" data-id="${c.id}" data-icono="${c.icono || ''}" data-accion="icono">Icono</button>`
          : ''}
        ${PERM().renombrar_carpetas
          ? `<button class="btn-mini btn-mini-azul" data-id="${c.id}" data-nombre="${c.nombre}" data-accion="renombrar">Renombrar</button>`
          : ''}
        ${PERM().gestionar_categorias
          ? `<button class="btn-mini btn-mini-rojo" data-id="${c.id}" data-nombre="${c.nombre}" data-accion="eliminar"
                ${c.archivos > 0 ? 'disabled title="Tiene archivos; no se puede eliminar"' : ''}>
          Eliminar
        </button>`
          : ''}
      </div>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll('.btn-mini[data-accion="icono"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fila = btn.closest('.cat-item');
      const abierto = fila.nextElementSibling?.classList.contains('ico-picker');
      // Cerrar cualquier otro picker abierto (sólo uno a la vez).
      wrap.querySelectorAll('.ico-picker').forEach(p => p.remove());
      if (abierto) return;

      const caja = document.createElement('div');
      caja.className = 'ico-picker ico-picker-inline';
      fila.after(caja);
      montarPickerIconos(caja, btn.dataset.icono || '');

      const barra = document.createElement('div');
      barra.className = 'ico-picker-acciones';
      barra.innerHTML = `<button class="btn-mini btn-mini-verde">Guardar icono</button>
                         <button class="btn-mini">Cancelar</button>`;
      caja.appendChild(barra);
      barra.lastElementChild.addEventListener('click', () => caja.remove());
      barra.firstElementChild.addEventListener('click', async e => {
        e.target.disabled = true;
        const res = await fetch(`/api/admin/categorias/${btn.dataset.id}/icono`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ icono: caja.dataset.icono }),
        });
        const data = await res.json();
        if (data.ok) cargarCategorias();
        else { alert('Error: ' + (data.error || 'desconocido')); e.target.disabled = false; }
      });
    });
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

// Selector de icono del formulario "crear categoria".
const pickerNueva = document.getElementById('ico-picker-nueva');
if (pickerNueva) montarPickerIconos(pickerNueva, '');

document.getElementById('btn-crear-cat').addEventListener('click', async () => {
  const input = document.getElementById('nueva-cat');
  const errEl = document.getElementById('cat-error');
  errEl.classList.add('hidden');
  const nombre = input.value.trim();
  if (!nombre) { errEl.textContent = 'Escribe un nombre.'; errEl.classList.remove('hidden'); return; }

  const res  = await fetch('/api/admin/categorias', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, icono: pickerNueva ? pickerNueva.dataset.icono : '' }),
  });
  const data = await res.json();
  if (data.ok) {
    input.value = '';
    if (pickerNueva) montarPickerIconos(pickerNueva, '');   // limpiar seleccion
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
  renombrar_carpetas:     'Cambiar el nombre de las carpetas',
  mover_archivos:         'Mover archivos de una carpeta a otra',
  editar_usuarios:        'Modificar los datos de los usuarios',
  editar_peso:            'Editar el peso máximo por tipo de archivo',
  moderar_archivos:       'Aprobar o rechazar archivos pendientes',
  gestionar_usuarios:     'Bloquear usuarios, cambiar roles y contraseñas',
  gestionar_categorias:   'Crear y eliminar categorías',
  eliminar_publicaciones: 'Ocultar y eliminar publicaciones ya aprobadas',
  responder_soporte:      'Responder tickets de soporte',
  gestionar_reportes:     'Resolver reportes de usuarios',
};

// ══ MODAL: EDITAR DATOS DE USUARIO ══
// Antes eran tres prompt() encadenados; si cancelabas el tercero perdías
// lo escrito en los dos primeros. Ahora es un formulario único.
function abrirModalDatos(uid, datos) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  const esc = v => String(v || '').replace(/"/g, '&quot;');
  ov.innerHTML = `
    <div class="modal-box modal-datos">
      <button class="modal-close" type="button" aria-label="Cerrar">&times;</button>
      <h3 class="modal-title">Editar datos del usuario</h3>

      <label for="ed-nombre">Nombre</label>
      <input type="text" id="ed-nombre" maxlength="120" value="${esc(datos.nombre)}">

      <label for="ed-username">Nombre de usuario</label>
      <input type="text" id="ed-username" maxlength="30" value="${esc(datos.username)}">
      <p class="edit-nota">Entre 3 y 30 caracteres: letras, números, punto o guion bajo.</p>

      <label for="ed-email">Correo</label>
      <input type="email" id="ed-email" maxlength="255" value="${esc(datos.email)}">

      <p class="error-msg hidden" id="ed-error"></p>
      <div class="edit-acciones">
        <button class="btn-accion" type="button" id="ed-cancelar">Cancelar</button>
        <button class="btn-accion btn-verde" type="button" id="ed-guardar">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const cerrar = () => ov.remove();
  ov.querySelector('.modal-close').addEventListener('click', cerrar);
  ov.querySelector('#ed-cancelar').addEventListener('click', cerrar);
  ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
  document.addEventListener('keydown', function escKey(e) {
    if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', escKey); }
  });
  ov.querySelector('#ed-nombre').focus();

  ov.querySelector('#ed-guardar').addEventListener('click', async e => {
    const err = ov.querySelector('#ed-error');
    err.classList.add('hidden');
    const nombre   = ov.querySelector('#ed-nombre').value.trim();
    const username = ov.querySelector('#ed-username').value.trim();
    const email    = ov.querySelector('#ed-email').value.trim();

    // Validación en el cliente para no gastar un viaje; el servidor
    // vuelve a comprobarlo todo de su lado.
    if (!nombre)   return fallo(err, 'El nombre es obligatorio.');
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username))
      return fallo(err, 'Nombre de usuario inválido: 3-30 caracteres, letras, números, punto o guion bajo.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return fallo(err, 'El correo no tiene un formato válido.');

    e.target.disabled = true; e.target.textContent = 'Guardando...';
    try {
      const res = await fetch(`/api/admin/usuarios/${uid}/datos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, username, email }),
      });
      const d = await res.json();
      if (d.ok) { cerrar(); cargarUsuarios(); return; }
      fallo(err, d.error || 'No se pudieron guardar los datos.');
    } catch {
      fallo(err, 'No se pudo conectar con el servidor.');
    }
    e.target.disabled = false; e.target.textContent = 'Guardar';
  });
}

function fallo(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ══ MODAL DE PERMISOS ══
// Los permisos son del PERFIL Administrador, no de un usuario concreto: se
// abren desde la fila para tenerlos a mano, pero lo que se edita afecta a
// todos los administradores. El modal lo dice de forma explícita.
async function abrirModalPermisos(uid, perfil) {
  const esSuper = Number(perfil) === 0;
  let cfg;
  try { cfg = await fetch('/api/superadmin/config').then(r => r.json()); }
  catch { alert('No se pudo cargar la configuración.'); return; }
  if (cfg.error) { alert(cfg.error); return; }

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-box modal-permisos">
      <button class="modal-close" type="button" aria-label="Cerrar">&times;</button>
      <h3 class="modal-title">Permisos del perfil Administrador</h3>
      <p class="perm-hint">
        ${esSuper
          ? 'El Super Administrador tiene siempre todas las capacidades: no se pueden revocar.'
          : 'Estas capacidades se delegan al <strong>perfil Administrador completo</strong>, no a este usuario en particular: el cambio afecta a todos los administradores.'}
      </p>
      <div class="perm-lista">
        ${Object.entries(PERMISOS_LABEL).map(([clave, label]) => `
          <div class="perm-item">
            <span class="perm-label">${label}</span>
            <label class="switch">
              <input type="checkbox" data-clave="${clave}"
                     ${esSuper || cfg.permisos[clave] ? 'checked' : ''}
                     ${esSuper ? 'disabled' : ''}>
              <span class="slider"></span>
            </label>
          </div>`).join('')}
      </div>
      <p class="error-msg hidden" id="perm-error"></p>
      <div class="edit-acciones">
        <button class="btn-accion" type="button" id="perm-cerrar">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const cerrar = () => ov.remove();
  ov.querySelector('.modal-close').addEventListener('click', cerrar);
  ov.querySelector('#perm-cerrar').addEventListener('click', cerrar);
  ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', esc); }
  });

  if (esSuper) return;   // sólo lectura
  ov.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', async () => {
      const res = await fetch('/api/superadmin/permisos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: chk.dataset.clave, valor: chk.checked }),
      });
      const data = await res.json();
      if (!data.ok) {
        chk.checked = !chk.checked;
        const aviso = ov.querySelector('#perm-error');
        aviso.textContent = data.error || 'No se pudo guardar el permiso.';
        aviso.classList.remove('hidden');
      }
    });
  });
}

// ══ DONACIONES ══
// El enlace de PayPal lo guarda el Super Admin; la app sólo lo abre en una
// pestaña nueva. La validación real (https + dominio de PayPal) la hace el
// servidor; aquí se adelanta el aviso para no gastar un viaje.
async function cargarDonaciones() {
  const url = document.getElementById('don-url');
  const txt = document.getElementById('don-texto');
  const act = document.getElementById('don-activo');
  if (!url) return;
  try {
    const d = await fetch('/api/admin/donaciones').then(r => r.json());
    url.value = d.url || '';
    txt.value = d.texto || 'Donar';
    act.checked = !!d.activo;
    pintarProbarDon();
  } catch {}
}

function pintarProbarDon() {
  const a = document.getElementById('don-probar');
  const v = (document.getElementById('don-url')?.value || '').trim();
  if (!a) return;
  a.href = v || '#';
  a.classList.toggle('hidden', !v);
}

document.getElementById('don-url')?.addEventListener('input', pintarProbarDon);

document.getElementById('btn-guardar-don')?.addEventListener('click', async e => {
  const msg = document.getElementById('don-msg');
  const url = document.getElementById('don-url').value.trim();
  const texto = document.getElementById('don-texto').value.trim() || 'Donar';
  const activo = document.getElementById('don-activo').checked;

  if (url && !/^https:\/\/(www\.)?paypal\.(me|com)(\/|$)/i.test(url)) {
    msg.textContent = 'El enlace debe empezar por https:// y ser de paypal.me o paypal.com.';
    msg.style.color = 'var(--red)';
    return;
  }
  e.target.disabled = true;
  try {
    const r = await fetch('/api/admin/donaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, texto, activo }),
    });
    const d = await r.json();
    if (d.ok) {
      msg.textContent = d.activo
        ? 'Guardado. El botón ya aparece en la barra superior.'
        : 'Guardado. El botón está oculto.';
      msg.style.color = 'var(--text-3)';
    } else {
      msg.textContent = d.error || 'No se pudo guardar.';
      msg.style.color = 'var(--red)';
    }
  } catch {
    msg.textContent = 'No se pudo conectar con el servidor.';
    msg.style.color = 'var(--red)';
  } finally {
    e.target.disabled = false;
  }
});

document.querySelectorAll('.tab').forEach(t => {
  if (t.dataset.tab === 'donaciones') t.addEventListener('click', cargarDonaciones);
});

// ══ PESO POR TIPO DE ARCHIVO ══
// Sustituye al campo único de "peso máximo de subida": ahora cada tipo
// tiene su tope y el global se ajusta solo si alguno lo supera.
// El tope global no es un valor suelto: lo calcula el servidor a partir de
// los pesos por tipo, porque debe cubrir el envío más grande (una galería
// entera viaja en una sola petición).
function pintarGlobal(d) {
  const el = document.getElementById('peso-global');
  if (el) el.textContent = d.max_content_mb;
  const nota = document.getElementById('pesos-nota');
  if (nota && d.max_fotos) {
    nota.textContent = `Se calcula solo: cubre el envío más grande posible `
      + `(hasta ${d.max_fotos} fotos de galería o ${d.max_pistas} pistas en una sola subida).`;
  }
}

// Rejilla de las piezas de una galería. Un lote subido junto es UNA
// publicación: se muestra en una sola tarjeta y se aprueba o rechaza
// entero, en vez de repetirse una vez por foto.
function rejillaPiezas(piezas) {
  if (!piezas || piezas.length < 2) return '';
  return `<div class="gal-rejilla" data-n="${piezas.length}">` +
    piezas.map(p => `<span class="gal-celda">
        <img src="${p.url}" alt="" loading="lazy">
      </span>`).join('') +
    `</div><p class="gal-pie">${piezas.length} archivos en esta publicación</p>`;
}

// ── Uso de almacenamiento ──────────────────────────────────
// Cuánto ocupa el sitio: total, reparto por zona y peso por categoría.
// Se mide el disco, no la base, para que salgan también los ficheros
// huérfanos, que son el espacio recuperable.
function tam(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return b + ' B';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (v < 10 ? v.toFixed(1) : Math.round(v)).toLocaleString('es-CL') + ' ' + u[i];
}

async function cargarAlmacenamiento() {
  const wrap = document.getElementById('uso-almacenamiento');
  if (!wrap) return;
  const d = await fetch('/api/admin/almacenamiento').then(r => r.json()).catch(() => null);
  if (!d) { wrap.innerHTML = '<p class="sin-items">No se pudo leer el almacenamiento.</p>'; return; }

  const col = paletaTipos();
  const zonas = d.zonas.filter(z => z.bytes > 0);
  const total = d.total_bytes || 1;
  const barra = zonas.map((z, i) => `
    <span class="g-seg" style="flex:${z.bytes};background:${col[i % col.length]}"
          title="${esc(z.nombre)}: ${tam(z.bytes)}"></span>`).join('');
  const leyenda = zonas.map((z, i) => `
    <span class="g-leg">
      <span class="g-punto-leg" style="background:${col[i % col.length]}"></span>
      ${esc(z.nombre)} <strong>${tam(z.bytes)}</strong>
      <span class="g-pct">${Math.round((z.bytes / total) * 100)}%</span>
    </span>`).join('');

  // Sólo se listan las categorías que ocupan algo: una lista de ceros
  // no dice nada y empuja hacia abajo lo que sí importa.
  const cats = d.por_categoria.filter(c => c.bytes > 0);
  const maxCat = Math.max(1, ...cats.map(c => c.bytes));
  const filasCat = cats.length ? cats.map(c => `
    <div class="g-fila">
      <span class="g-etq" title="${esc(c.nombre)}">${esc(c.nombre)}</span>
      <span class="g-pista"><span class="g-barra" style="width:${Math.max(2, (c.bytes / maxCat) * 100)}%"></span></span>
      <span class="g-val">${tam(c.bytes)}</span>
    </div>`).join('') : '<p class="g-vacio">Ninguna categoría ocupa espacio todavía.</p>';

  const recuperable = (d.aduana_huerfanos || 0) + (d.publicados_huerfanos || 0);

  wrap.innerHTML = `
    <div class="alm-total">
      <p class="alm-cifra">${tam(d.total_bytes)}</p>
      <p class="alm-pie">ocupa el sitio en total · ${nfmt(d.zonas.reduce((a, z) => a + z.archivos, 0))} ficheros</p>
    </div>

    <div class="graficos-grid" style="margin-top:16px">
      <figure class="grafico">
        <figcaption class="g-cabecera"><span class="g-titulo">Reparto por zona</span></figcaption>
        <div class="g-lamina">
          <div class="g-apilada">${barra}</div>
          <div class="g-leyenda">${leyenda}</div>
          ${recuperable ? `<p class="alm-aviso">
              <strong>${nfmt(recuperable)}</strong> fichero${recuperable === 1 ? '' : 's'} sin publicación asociada
              — espacio recuperable${d.aduana_huerfanos ? ` (${nfmt(d.aduana_huerfanos)} en aduana)` : ''}.
            </p>` : ''}
        </div>
      </figure>

      <figure class="grafico">
        <figcaption class="g-cabecera">
          <span class="g-titulo">Peso por categoría</span>
          <span class="g-sub">Sólo archivos publicados</span>
        </figcaption>
        <div class="g-lamina"><div class="g-barras">${filasCat}</div></div>
      </figure>
    </div>`;
}

async function cargarPesos() {
  const wrap = document.getElementById('lista-pesos');
  if (!wrap) return;
  wrap.innerHTML = '<p class="cargando">Cargando...</p>';
  try {
    const d = await fetch('/api/admin/config/pesos').then(r => r.json());
    if (d.error) { wrap.innerHTML = `<p class="sin-items">${d.error}</p>`; return; }
    wrap.innerHTML = d.pesos.map(p => `
      <div class="peso-item">
        <label for="peso-${p.clave}">${p.etiqueta}</label>
        <div class="peso-campo">
          <input type="number" id="peso-${p.clave}" data-clave="${p.clave}"
                 min="1" max="2000" value="${p.mb}">
          <span class="peso-unidad">MB</span>
        </div>
      </div>`).join('');
    pintarGlobal(d);
  } catch {
    wrap.innerHTML = '<p class="sin-items">No se pudo cargar la configuración.</p>';
  }
}

document.getElementById('btn-guardar-pesos')?.addEventListener('click', async e => {
  const msg = document.getElementById('pesos-msg');
  const campos = [...document.querySelectorAll('#lista-pesos input[data-clave]')];
  if (!campos.length) return;

  const cuerpo = {};
  for (const c of campos) {
    const v = parseInt(c.value, 10);
    if (!Number.isFinite(v) || v < 1 || v > 2000) {
      msg.textContent = 'Cada peso debe ser un número entre 1 y 2000 MB.';
      msg.style.color = 'var(--peligro)';
      c.focus();
      return;
    }
    cuerpo[c.dataset.clave] = v;
  }

  e.target.disabled = true;
  try {
    const r = await fetch('/api/admin/config/pesos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const d = await r.json();
    if (d.ok) {
      pintarGlobal(d);
      msg.textContent = `Guardado. Tope de la petición recalculado a ${d.max_content_mb} MB.`;
      msg.style.color = 'var(--text-3)';
    } else {
      msg.textContent = d.error || 'No se pudo guardar.';
      msg.style.color = 'var(--peligro)';
    }
  } catch {
    msg.textContent = 'No se pudo conectar con el servidor.';
    msg.style.color = 'var(--peligro)';
  } finally {
    e.target.disabled = false;
  }
});

document.querySelectorAll('.tab').forEach(t => {
  if (t.dataset.tab === 'pesos') t.addEventListener('click', () => {
    cargarAlmacenamiento();
    cargarPesos();
  });
});

// ══ MODAL DE EDICIÓN DE PUBLICACIÓN ══
// Reúne asunto, descripción y categoría en un solo diálogo, con la
// categoría como lista desplegable (antes había que teclear el nombre
// exacto en un prompt) y una previsualización del contenido editado.
let PUBLICADOS = {};

function previsualizacionHtml(a) {
  if (!a.url) {
    return `<div class="edit-sinmedia">Publicación de texto — sin archivo</div>`;
  }
  if (a.tipo === 'imagen')
    return `<img src="${a.url}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'edit-sinmedia',textContent:'Archivo no disponible'}))">`;
  if (a.tipo === 'video')
    return `<video src="${a.url}" controls preload="metadata"></video>`;
  if (a.tipo === 'audio')
    return `<audio src="${a.url}" controls preload="metadata"></audio>`;
  return `<div class="edit-sinmedia">Sin previsualización para este tipo</div>`;
}

async function abrirModalEditar(a) {
  if (!a) return;
  let cats = [];
  // Misma caché compartida que el modal de subida (definida en auth.js):
  // evita el viaje de red que retrasaba la apertura del diálogo.
  cats = categoriasCacheadas() || [];
  if (!cats.length) { try { cats = await pedirCategorias(); } catch {} }
  else pedirCategorias();
  const puedeMover = !!PERM().mover_archivos;

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-box modal-editar">
      <button class="modal-close" type="button" aria-label="Cerrar">&times;</button>
      <h3 class="modal-title">Editar publicación</h3>

      <div class="edit-preview">${previsualizacionHtml(a)}</div>
      <p class="edit-archivo">${a.nombre} · <span>${a.tipo}</span> · ${a.fecha}</p>

      <label for="edit-asunto">Asunto</label>
      <input type="text" id="edit-asunto" maxlength="200" value="${(a.asunto || '').replace(/"/g, '&quot;')}">

      <label for="edit-desc">Descripción</label>
      <textarea id="edit-desc" rows="4" maxlength="20000"></textarea>

      <label for="edit-cat">Categoría</label>
      <select id="edit-cat" ${puedeMover ? '' : 'disabled'}>
        ${cats.map(c => `<option value="${c}"${c === a.categoria ? ' selected' : ''}>${c}</option>`).join('')}
      </select>
      ${puedeMover ? '' : '<p class="edit-nota">No tienes el permiso para mover archivos de categoría.</p>'}

      <p class="error-msg hidden" id="edit-error"></p>
      <div class="edit-acciones">
        <button class="btn-accion" type="button" id="edit-cancelar">Cancelar</button>
        <button class="btn-accion btn-verde" type="button" id="edit-guardar">Guardar cambios</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  // El textarea se rellena por propiedad, no por HTML, para que un texto
  // con < o & no rompa el marcado.
  ov.querySelector('#edit-desc').value = a.descripcion || '';

  const cerrar = () => {
    ov.querySelector('video, audio')?.pause();
    ov.remove();
  };
  ov.querySelector('.modal-close').addEventListener('click', cerrar);
  ov.querySelector('#edit-cancelar').addEventListener('click', cerrar);
  ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', esc); }
  });

  ov.querySelector('#edit-guardar').addEventListener('click', async e => {
    const err = ov.querySelector('#edit-error');
    err.classList.add('hidden');
    const asunto = ov.querySelector('#edit-asunto').value.trim();
    const desc   = ov.querySelector('#edit-desc').value;
    const cat    = ov.querySelector('#edit-cat').value;

    e.target.disabled = true;
    e.target.textContent = 'Guardando...';
    const fallos = [];
    const enviar = async (ruta, cuerpo) => {
      try {
        const r = await fetch(ruta, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
        const d = await r.json();
        if (!d.ok) fallos.push(d.error || 'error desconocido');
      } catch { fallos.push('sin conexión'); }
    };

    // Sólo se envía lo que cambió: así un fallo de permiso en «mover» no
    // impide guardar el resto.
    if (asunto !== (a.asunto || ''))      await enviar(`/api/admin/archivos/${a.id}/asunto`, { asunto });
    if (desc !== (a.descripcion || ''))   await enviar(`/api/admin/archivos/${a.id}/descripcion`, { descripcion: desc });
    if (puedeMover && cat !== a.categoria) await enviar(`/api/admin/archivos/${a.id}/mover`, { categoria: cat });

    if (fallos.length) {
      err.textContent = fallos.join(' · ');
      err.classList.remove('hidden');
      e.target.disabled = false;
      e.target.textContent = 'Guardar cambios';
      return;
    }
    cerrar();
    cargarPublicados();
  });
}
