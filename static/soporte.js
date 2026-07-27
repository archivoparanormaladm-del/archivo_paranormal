let sesionSoporte = {};

renderSessionBar().then(me => {
  sesionSoporte = me || {};
  // Si NO ha iniciado sesión, pedir el correo registrado (el backend valida
  // que exista). Si ya inició sesión, se usa el correo de su cuenta.
  if (!sesionSoporte.autenticado) {
    document.getElementById('campo-email').classList.remove('hidden');
  }
});

/* ── Crear solicitud ── */
document.getElementById('form-ticket').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('ticket-error');
  errEl.classList.add('hidden');

  const asunto     = document.getElementById('t-asunto').value.trim();
  const comentario = document.getElementById('t-comentario').value.trim();
  const email      = document.getElementById('t-email')?.value.trim() || '';

  if (!asunto || !comentario) {
    errEl.textContent = 'Asunto y comentarios son obligatorios.';
    errEl.classList.remove('hidden'); return;
  }
  if (!sesionSoporte.autenticado && !email) {
    errEl.textContent = 'Indica tu correo registrado.';
    errEl.classList.remove('hidden'); return;
  }

  const btn = document.getElementById('btn-enviar');
  btn.disabled = true; btn.textContent = 'Enviando...';

  try {
    const res = await fetch('/api/soporte', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asunto, comentario, email }),
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('form-ticket').classList.add('hidden');
      document.getElementById('res-numero').textContent = data.numero;
      document.getElementById('res-msg').textContent = data.mensaje;
      document.getElementById('ticket-resultado').classList.remove('hidden');
    } else {
      errEl.textContent = data.error || 'No se pudo enviar la solicitud.';
      errEl.classList.remove('hidden');
    }
  } catch {
    errEl.textContent = 'No se pudo conectar con el servidor.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar solicitud';
  }
});

/* ── Copiar número ── */
document.getElementById('btn-copiar').addEventListener('click', () => {
  const num = document.getElementById('res-numero').textContent;
  navigator.clipboard.writeText(num);
  const btn = document.getElementById('btn-copiar');
  btn.textContent = '¡Copiado!';
  setTimeout(() => (btn.textContent = 'Copiar número'), 1500);
});

/* ── Consultar solicitud ── */
const BADGES = {
  abierto:    { txt: 'Abierto',    cls: 'badge-abierto' },
  respondido: { txt: 'Respondido', cls: 'badge-respondido' },
  cerrado:    { txt: 'Cerrado',    cls: 'badge-cerrado' },
};

document.getElementById('form-consulta').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('consulta-error');
  const box   = document.getElementById('consulta-resultado');
  errEl.classList.add('hidden');
  box.classList.add('hidden');

  const numero = document.getElementById('c-numero').value.trim();
  if (!numero) return;

  try {
    const res  = await fetch('/api/soporte/consultar?numero=' + encodeURIComponent(numero));
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'No se encontró la solicitud.';
      errEl.classList.remove('hidden'); return;
    }
    document.getElementById('cr-numero').textContent = data.numero;
    document.getElementById('cr-asunto').textContent = data.asunto;
    document.getElementById('cr-fecha').textContent  = data.fecha;
    const badge = BADGES[data.estado] || { txt: data.estado, cls: '' };
    const badgeEl = document.getElementById('cr-estado');
    badgeEl.textContent = badge.txt;
    badgeEl.className = 'cr-badge ' + badge.cls;

    const respWrap = document.getElementById('cr-respuesta-wrap');
    if (data.respuesta) {
      document.getElementById('cr-respuesta').textContent = data.respuesta;
      respWrap.classList.remove('hidden');
    } else {
      respWrap.classList.add('hidden');
    }
    box.classList.remove('hidden');
  } catch {
    errEl.textContent = 'No se pudo conectar con el servidor.';
    errEl.classList.remove('hidden');
  }
});
