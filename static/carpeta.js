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

// La publicación se ancla justo debajo de la barra superior, pero esa barra
// no mide siempre lo mismo: por debajo de cierto ancho se parte en dos filas.
// Se publica su alto real en `--nav-h` y el CSS lo usa para el anclaje.
function medirNavbar() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const alto = Math.round(nav.getBoundingClientRect().height);
  if (alto) document.documentElement.style.setProperty('--nav-h', alto + 'px');
}
// `ResizeObserver` cubre también los cambios de alto que no vienen de un
// `resize` de la ventana (la barra reacomodándose, una fuente que carga).
function vigilarNavbar() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  medirNavbar();
  new ResizeObserver(medirNavbar).observe(nav);
}

renderSessionBar().then(me => { sesion = me; vigilarNavbar(); });
window.addEventListener('resize', medirNavbar);

function linkificar(texto) {
  if (!texto) return '';
  const r = /(https?:\/\/[^\s<>"]+)/g;
  return texto
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(r, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}


/* ── Panel derecho ─────────────────────────────────────── */
// ── Iconos de la vista de carpeta ──
// Trazo, no relleno: heredan el color del contenedor y así siguen el tema.
const _sv = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
  `stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

const IC = {
  like:    _sv('<path d="M7 10v10H4V10h3Zm0 0 4.5-7c1.2 0 2 .9 2 2l-.8 4H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7"/>'),
  dislike: _sv('<path d="M17 14V4h3v10h-3Zm0 0-4.5 7c-1.2 0-2-.9-2-2l.8-4H5a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 6.2 4H17"/>'),
  save:    _sv('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>'),
  share:   _sv('<path d="M13 4l8 7-8 7v-4C7 14 4 16 3 20c0-8 5-11 10-11V4z"/>'),
  enviar:  _sv('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  play:    _sv('<path d="M9 6.5v11l8.5-5.5z"/>', 'fill="currentColor" stroke="none"'),
  imagen:  _sv('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.3" cy="9.3" r="1.4"/><path d="M21 15.5l-4.5-4.5L11 16l-2.5-2.5L3 18"/>'),
  galeria: _sv('<rect x="7" y="3" width="14" height="14" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12"/>'),
  audio:   _sv('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  texto:   _sv('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  cerrar:  _sv('<path d="M6 6l12 12M18 6 6 18"/>'),
  flecha:  _sv('<path d="M9 6l6 6-6 6"/>'),
  persona: _sv('<circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/>'),
  puntos:  _sv('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
               'fill="currentColor" stroke="none"'),
};

// Icono según el tipo de publicación, para la miniatura y la etiqueta.
function iconoTipo(a) {
  if (a.tipo === 'video') return IC.play;
  if (a.tipo === 'audio') return IC.audio;
  if (a.tipo === 'texto') return IC.texto;
  return piezas(a) > 1 ? IC.galeria : IC.imagen;
}

// Texto corto del tipo, para la línea bajo el título.
function etiquetaTipo(a) {
  const n = piezas(a);
  if (a.tipo === 'video') return 'Video';
  if (a.tipo === 'audio') return n > 1 ? `${n} pistas` : 'Audio';
  if (a.tipo === 'texto') return 'Texto';
  return n > 1 ? `${n} fotos` : 'Imagen';
}

// Nº de piezas de una publicación: >1 significa galería de fotos o lista
// de audio, y en la lista de la izquierda se marca con una pastilla.
function piezas(a) {
  return Math.max((a.imagenes || []).length, (a.pistas || []).length);
}

// Antigüedad abreviada a partir de una fecha dd/mm/aaaa, para la tercera
// tarjeta de la hoja ("3 d", "5 sem", "2 a"), como en la referencia.
function haceCuanto(fecha) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha || '');
  if (!m) return fecha || '—';
  const dias = Math.floor((Date.now() - new Date(+m[3], +m[2] - 1, +m[1])) / 86400000);
  if (dias < 0)   return 'hoy';
  if (dias === 0) return 'hoy';
  if (dias < 7)   return dias + ' d';
  if (dias < 31)  return Math.floor(dias / 7) + ' sem';
  if (dias < 365) return Math.floor(dias / 30) + ' mes';
  return Math.floor(dias / 365) + ' a';
}

// Cifras abreviadas al estilo de la referencia: 8100 -> "8,1 mil",
// 241000 -> "241 mil", 1200000 -> "1,2 M". Coma decimal, como en espanol.
function cifra(n) {
  n = Number(n) || 0;
  const corta = v => (v < 10 ? v.toFixed(1).replace('.', ',').replace(/,0$/, '')
                             : String(Math.round(v)));
  if (n < 1000)   return String(n);
  if (n < 1e6)    return corta(n / 1e3) + ' mil';
  return corta(n / 1e6) + ' M';
}

// Antiguedad en palabras: "hace 3 dias", "hace 1 semana". La version
// abreviada (`haceCuanto`) se sigue usando en las cifras de la hoja.
function haceCuantoLargo(fecha) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha || '');
  if (!m) return fecha || '—';
  const dias = Math.floor((Date.now() - new Date(+m[3], +m[2] - 1, +m[1])) / 86400000);
  if (dias <= 0) return 'hoy';
  const t = (v, sing, plur) => `hace ${v} ${v === 1 ? sing : plur}`;
  if (dias < 7)   return t(dias, 'día', 'días');
  if (dias < 31)  return t(Math.floor(dias / 7),   'semana', 'semanas');
  if (dias < 365) return t(Math.floor(dias / 30),  'mes',    'meses');
  return t(Math.floor(dias / 365), 'año', 'años');
}

// ¿Estamos en la disposición de móvil? Varias piezas del detalle cambian
// de texto (no sólo de estilo) según el ancho, y eso no lo resuelve el CSS.
// La presentación compacta (reproductor tipo YouTube, carrusel de fotos,
// comentarios plegados) se aplica en todos los anchos. Lo único que sigue
// dependiendo del tamaño es la disposición de la página, y de eso se ocupa
// el CSS: dos columnas en escritorio, una sola en móvil.
const vistaCompacta = () => true;

// ── Carrusel de galería (sólo móvil) ──
// El deslizamiento lo resuelve el CSS con scroll-snap. Aquí sólo se añade
// el contador de posición: sin él no se adivina que hay más fotos.
function activarCarrusel(root) {
  const ps = root.querySelector('.feed-photoset');
  if (!ps) return;
  const celdas = ps.querySelectorAll('.ps-celda');
  if (celdas.length < 2) return;

  // El contador va pegado al carrusel, no a la pagina. Como el contenedor
  // padre es `display: contents` en movil, no sirve de referencia: se
  // envuelve el photoset en un marco propio con `position: relative`.
  let marco = ps.parentElement;
  if (!marco.classList.contains('ps-carrusel')) {
    marco = document.createElement('div');
    marco.className = 'ps-carrusel';
    ps.parentElement.insertBefore(marco, ps);
    marco.appendChild(ps);
  }
  marco.querySelector('.ps-contador')?.remove();

  const cont = document.createElement('span');
  cont.className = 'ps-contador';
  cont.textContent = `1/${celdas.length}`;
  marco.appendChild(cont);

  // Flecha para pasar de foto sin tener que deslizar. Es una sola: avanza
  // hasta la ultima y ahi se da la vuelta para volver, y al llegar a la
  // primera se endereza otra vez. Asi nunca queda en un callejon sin
  // salida (una flecha que solo avanza se atasca en la ultima foto).
  marco.querySelector('.ps-nav')?.remove();
  const nav = document.createElement('button');
  nav.className = 'ps-nav';
  nav.type = 'button';
  nav.innerHTML = IC.flecha;
  marco.appendChild(nav);

  let haciaAtras = false;
  const indice = () => Math.round(ps.scrollLeft / ps.clientWidth);

  const pintar = () => {
    const i = Math.min(Math.max(indice(), 0), celdas.length - 1);
    if (i >= celdas.length - 1) haciaAtras = true;
    if (i <= 0)                 haciaAtras = false;
    cont.textContent = `${i + 1}/${celdas.length}`;
    nav.classList.toggle('atras', haciaAtras);
    nav.title = haciaAtras ? 'Anterior' : 'Siguiente';
    nav.setAttribute('aria-label', nav.title);
  };

  nav.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();          // la celda es un enlace: no abrir la foto
    pintar();                     // fija el sentido antes de moverse
    const destino = Math.min(Math.max(indice() + (haciaAtras ? -1 : 1), 0), celdas.length - 1);
    ps.scrollTo({ left: destino * ps.clientWidth, behavior: 'smooth' });
  });

  // El deslizamiento manual tambien cambia el sentido de la flecha.
  ps.addEventListener('scroll', pintar, { passive: true });
  pintar();
}

// ── Texto largo: se recorta al alto del reproductor ──
// Una publicación de texto no tiene medio, así que su cuerpo se muestra
// hasta donde llegaría ese marco 16:9 y, si sobra, se despliega con un
// botón. El límite se calcula aquí y no en CSS porque depende del ancho
// real del contenedor, que cambia entre móvil y escritorio.
function recortarTexto(cont) {
  if (!cont.classList.contains('es-texto')) return;
  const desc = cont.querySelector('.detalle-desc');
  if (!desc) return;
  cont.querySelector('.txt-mas')?.remove();

  // Se mide sobre el CONTENEDOR, que es lo que ocupa el marco 16:9. Con el
  // ancho del propio texto salía 530 px donde el vídeo mide 557: el texto
  // lleva relleno lateral y el medio va a sangre.
  const limite = () => Math.round((cont.clientWidth || desc.clientWidth) * 9 / 16);

  let tope = limite();
  desc.style.maxHeight = '';
  desc.classList.remove('recortado', 'abierto');
  // Con holgura: por unos pocos píxeles no compensa esconder nada.
  if (desc.scrollHeight <= tope + 12) return;

  desc.style.maxHeight = tope + 'px';
  desc.classList.add('recortado');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'txt-mas';
  btn.textContent = 'Ver más';
  desc.insertAdjacentElement('afterend', btn);

  btn.addEventListener('click', () => {
    const abierto = desc.classList.toggle('abierto');
    desc.classList.toggle('recortado', !abierto);
    desc.style.maxHeight = abierto ? '' : tope + 'px';
    btn.textContent = abierto ? 'Ver menos' : 'Ver más';
    if (!abierto) desc.scrollIntoView({ block: 'nearest' });
  });

  // Al girar el teléfono cambia el ancho y con él el alto del marco.
  const recalcular = () => {
    tope = limite();
    if (!desc.classList.contains('abierto')) desc.style.maxHeight = tope + 'px';
  };
  window.addEventListener('resize', recalcular);
}

// Ampliar una foto a pantalla completa. Se delega en el contenedor para que
// siga funcionando con las celdas que se pintan más tarde.
function activarAmpliar(root) {
  if (root.dataset.ampliarListo) return;   // una sola vez por contenedor
  root.dataset.ampliarListo = '1';
  root.addEventListener('click', e => {
    // Dentro de la categoría ya estás viendo esa publicación: tocar la foto
    // no debe llevarte a ningún sitio. `photosetHtml` ya evita generar el
    // enlace cuando no hay categoría, pero si la API llegara a incluir ese
    // campo el enlace volvería a aparecer; esto lo corta en cualquier caso.
    const celda = e.target.closest('.ps-celda');
    if (celda && celda.tagName === 'A') e.preventDefault();

    const btn = e.target.closest('.ps-expandir');
    if (!btn) return;
    e.preventDefault();          // la celda es un enlace: no navegar
    e.stopPropagation();
    const img = btn.parentElement.querySelector('img');
    if (!img) return;
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    (img.requestFullscreen || img.webkitRequestFullscreen)?.call(img);
  });
}

// ── Hoja de descripción ──
// El mockup la abre desde "…más". En escritorio es un panel lateral que
// entra desde la derecha y en móvil una hoja que sube desde abajo; el
// mismo marcado sirve para ambos, lo decide el CSS.
function abrirHojaDescripcion(a, stats) {
  document.getElementById('hoja-desc')?.remove();
  document.getElementById('hoja-fondo')?.remove();

  const fondo = document.createElement('div');
  fondo.className = 'hoja-fondo'; fondo.id = 'hoja-fondo';

  const hoja = document.createElement('div');
  hoja.className = 'hoja'; hoja.id = 'hoja-desc';
  hoja.setAttribute('role', 'dialog');
  hoja.setAttribute('aria-label', 'Descripción');
  hoja.innerHTML = `
    <div class="hoja-grip"></div>
    <div class="hoja-top">
      <span class="hoja-t">Descripción</span>
      <button class="hoja-x" type="button" aria-label="Cerrar">${IC.cerrar}</button>
    </div>
    <div class="hoja-body">
      <p class="hoja-titulo">${a.asunto || 'Sin asunto'}</p>
      <div class="hoja-stats">
        <div class="stat"><span class="v">${stats.likes ?? 0}</span><span class="l">Me gusta</span></div>
        <div class="stat"><span class="v">${a.visitas || 0}</span><span class="l">Vistas</span></div>
        <div class="stat"><span class="v">${haceCuanto(a.fecha)}</span><span class="l">Atrás</span></div>
      </div>
      <div class="hoja-desc">${linkificar(a.descripcion || '')}</div>
      <p class="hoja-pie">Subido por ${a.subido_por ? '@' + a.subido_por : 'un usuario'} · ${a.fecha}</p>
      <!-- En móvil la ficha del archivo no se muestra bajo la publicación,
           así que el nombre del fichero vive aquí. -->
      <p class="hoja-pie hoja-archivo">Archivo: ${a.nombre || '—'}</p>
    </div>`;

  document.body.appendChild(fondo);
  document.body.appendChild(hoja);
  // Forzar un reflow y luego marcar visible: así la transición arranca
  // desde el estado inicial. Se evita requestAnimationFrame a propósito,
  // porque no dispara si la página no está componiendo fotogramas (pestaña
  // en segundo plano, por ejemplo) y la hoja se quedaría fuera de pantalla.
  void hoja.offsetHeight;
  fondo.classList.add('visible');
  hoja.classList.add('visible');

  const cerrar = () => {
    hoja.classList.remove('visible'); fondo.classList.remove('visible');
    setTimeout(() => { hoja.remove(); fondo.remove(); }, 260);
    document.removeEventListener('keydown', esc);
  };
  function esc(e) { if (e.key === 'Escape') cerrar(); }
  hoja.querySelector('.hoja-x').addEventListener('click', cerrar);
  fondo.addEventListener('click', cerrar);
  document.addEventListener('keydown', esc);
}

async function mostrarDetalle(a) {
  const mediaAnterior = detalleConten.querySelector('video, audio');
  if (mediaAnterior) { mediaAnterior.pause(); mediaAnterior.src = ''; }

  detalleVacio.classList.add('hidden');
  detalleConten.classList.remove('hidden');
  detalleConten.classList.toggle('es-texto', a.tipo === 'texto');
  detalleConten.classList.toggle('es-audio', a.tipo === 'audio');

  document.querySelectorAll('.lista-item').forEach(el => el.classList.remove('activo'));
  document.querySelector(`.lista-item[data-id="${a.id}"]`)?.classList.add('activo');

  // Los formatos de publicación son los mismos que en el feed: galería de
  // fotos en rejilla, audio con carátula (y lista si trae varias pistas) y
  // texto sin marco de medio. Se reutilizan las funciones compartidas de
  // auth.js para que ambas vistas no se desincronicen.
  const esPhotoset = (a.imagenes || []).length > 1;
  const esAudio    = a.tipo === 'audio';

  let mediaHtml = '';
  if (a.tipo === 'imagen')      mediaHtml = `<div class="media-blur" style="background-image:url('${(a.url || '').replace(/'/g, "%27")}')"></div><img class="media-main" src="${a.url}" onerror="mediaRota(this)" alt="${a.nombre}">`;
  else if (a.tipo === 'video')  mediaHtml = reproductorHtml('video', a.url);

  // El botón de pantalla completa sólo aplica a una imagen suelta.
  const fsBtnHtml = (a.tipo === 'imagen' && !esPhotoset) ? `<button class="btn-fs-detalle" id="btn-fs" title="Pantalla completa">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
  </button>` : '';

  const bloqueMedio =
      a.tipo === 'texto' ? ''
    : esPhotoset         ? photosetHtml(a)
    : esAudio            ? audioPostHtml(a)
    : `<div class="detalle-media">${mediaHtml}${fsBtnHtml}</div>`;

  detalleConten.innerHTML = `
    ${bloqueMedio}
    <!-- Info: título + línea de datos, con "…más" hacia la hoja de descripción -->
    <div class="vinfo">
      <p class="vtitle ${!a.asunto ? 'sin-asunto' : ''}">${a.asunto || 'Sin asunto'}</p>
      <p class="metaline" id="metaline">
        <span class="mi solo-movil meta-autor">${a.subido_por ? '@' + a.subido_por : 'Usuario'}</span>
        <span class="mi solo-movil meta-likes"><span id="likes-meta">0</span> «Me gusta»</span>
        <span class="mi meta-vistas">
          <span class="solo-esc"><span id="vistas-count">${a.visitas || 0}</span> visualizaciones</span>
          <span class="solo-movil"><span id="vistas-movil">${cifra(a.visitas || 0)}</span> de vistas</span>
        </span>
        <span class="mi meta-fecha">
          <span class="solo-esc">${a.fecha}</span>
          <span class="solo-movil">${haceCuantoLargo(a.fecha)}</span>
        </span>
        <span class="mi solo-esc meta-tipo">${a.tipo}</span>
        ${a.descripcion ? '<button class="mas" id="btn-mas" type="button">…más</button>' : ''}
      </p>
    </div>

    <!-- Autor + acciones redondas -->
    <div class="chrow">
      <div class="chleft">
        <span class="ch-avatar">${avatarChip(a)}</span>
        <span class="ch-nombre">${a.subido_por ? '@' + a.subido_por : 'Usuario'}</span>
        ${(sesion.autenticado && a.subido_por && !a.es_mio)
          ? `<button class="ch-seguir ${a.siguiendo ? 'siguiendo' : ''}" id="btn-seguir" type="button">${a.siguiendo ? 'Siguiendo' : 'Seguir'}</button>`
          : ''}
      </div>
      <div class="acts">
        <button class="act" id="btn-like" title="Me gusta" aria-label="Me gusta">
          ${IC.like}<span class="act-n" id="likes-count">0</span>
        </button>
        <button class="act" id="btn-dislike" title="No me gusta" aria-label="No me gusta">
          ${IC.dislike}<span class="act-n" id="dislikes-count">0</span>
        </button>
        <button class="act" id="btn-guardar" title="Guardar" aria-label="Guardar">${IC.save}</button>
        <button class="act" id="btn-compartir" title="Compartir" aria-label="Compartir">${IC.share}</button>
        <button class="act solo-movil" id="btn-mas-acc" title="Más" aria-label="Más">${IC.puntos}</button>
      </div>
    </div>

    <!-- Ficha del archivo -->
    <div class="detalle-body">
      <p class="detalle-nombre-label">Archivo</p>
      <p class="detalle-nombre-val">${a.nombre || '—'}</p>
      ${a.descripcion ? `<p class="detalle-desc-label">Descripción</p><div class="detalle-desc">${linkificar(a.descripcion)}</div>` : ''}
    </div>

    <!-- Comentarios -->
    <div class="comentarios-section">
      <button class="com-cabecera" id="com-toggle" type="button">
        <span class="com-t">Comentarios <span class="com-n" id="com-n"></span></span>
        <span class="com-flecha">${IC.flecha}</span>
      </button>
      <div id="lista-comentarios"></div>
      <div class="comentario-form">
        <span class="cf-avatar solo-movil">${avatarChip(sesion)}</span>
        ${!sesion.autenticado ? `<input type="text" id="nombre-anon" placeholder="Tu nombre (opcional)" maxlength="80">` : ''}
        <textarea id="texto-comentario" placeholder="Comentar..." rows="2" maxlength="1000"></textarea>
        <button id="btn-comentar">
          ${IC.enviar} Comentar
        </button>
      </div>
    </div>
  `;

  // Activar el reproductor liquid glass (video/audio)
  activarReproductor(detalleConten);
  // Seguir / dejar de seguir al autor.
  detalleConten.querySelector('#btn-seguir')?.addEventListener('click', async e => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const d = await fetch(`/api/usuario/${encodeURIComponent(a.subido_por)}/seguir`,
                            { method: 'POST' }).then(r => r.json());
      if (d.siguiendo !== undefined) {
        a.siguiendo = d.siguiendo;
        b.classList.toggle('siguiendo', d.siguiendo);
        b.textContent = d.siguiendo ? 'Siguiendo' : 'Seguir';
      }
    } catch {}
    b.disabled = false;
  });

  // La cabecera de comentarios pliega y despliega la lista.
  detalleConten.querySelector('#com-toggle')?.addEventListener('click', e => {
    const sec = e.currentTarget.closest('.comentarios-section');
    sec.classList.toggle('plegada');
  });

  // "…más" abre la hoja con la descripción completa y las cifras. El
  // botón "…" de la fila de acciones (móvil) hace lo mismo.
  const verHoja = () => {
    const likes = parseInt(document.getElementById('likes-count')?.textContent) || 0;
    abrirHojaDescripcion(a, { likes });
  };
  detalleConten.querySelector('#btn-mas')?.addEventListener('click', verHoja);
  detalleConten.querySelector('#btn-mas-acc')?.addEventListener('click', verHoja);

  // En móvil la tarjeta de comentarios arranca plegada: sólo la cabecera
  // con el recuento y el campo para comentar, como en la referencia.
  if (vistaCompacta()) detalleConten.querySelector('.comentarios-section')?.classList.add('plegada');

  // El botón de enviar aparece al escribir, no antes.
  const cajaCom = detalleConten.querySelector('.comentario-form');
  const txtCom  = detalleConten.querySelector('#texto-comentario');
  txtCom?.addEventListener('focus', () => cajaCom.classList.add('activo'));
  txtCom?.addEventListener('blur',  () => {
    if (!txtCom.value.trim()) cajaCom.classList.remove('activo');
  });
  activarLista(detalleConten);   // listas de audio con varias pistas
  activarCarrusel(detalleConten);
  activarAmpliar(detalleConten);
  recortarTexto(detalleConten);

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
  const vistasMov = document.getElementById('vistas-movil');
  if (vistasMov) vistasMov.textContent = cifra(a.visitas);

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

// Los "Me gusta" salen en dos sitios: el contador del botón (escritorio)
// y la línea de datos bajo el título (móvil, abreviado).
function pintarLikes(likes, dislikes) {
  const c = document.getElementById('likes-count');
  const d = document.getElementById('dislikes-count');
  const m = document.getElementById('likes-meta');
  if (c) c.textContent = likes;
  if (d) d.textContent = dislikes;
  if (m) m.textContent = cifra(likes);
}

async function cargarReacciones(archivoId) {
  const data = await fetch(`/api/archivos/${archivoId}/reacciones`).then(r => r.json());
  pintarLikes(data.likes, data.dislikes);
  if (data.mi_reaccion === 'like')    document.getElementById('btn-like')?.classList.add('acc-btn-activo');
  if (data.mi_reaccion === 'dislike') document.getElementById('btn-dislike')?.classList.add('acc-btn-activo');
}

async function reaccionar(archivoId, tipo) {
  const res  = await fetch(`/api/archivos/${archivoId}/reaccion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo }),
  });
  const data = await res.json();
  pintarLikes(data.likes, data.dislikes);
  document.getElementById('btn-like')?.classList.toggle('acc-btn-activo',    tipo === 'like'    && data.accion !== 'eliminada');
  document.getElementById('btn-dislike')?.classList.toggle('acc-btn-activo', tipo === 'dislike' && data.accion !== 'eliminada');
}

async function cargarComentarios(archivoId) {
  const wrap = document.getElementById('lista-comentarios');
  if (!wrap) return;
  const data = await fetch(`/api/archivos/${archivoId}/comentarios`).then(r => r.json());
  // Contador en la cabecera, como en la referencia.
  const nEl = document.getElementById('com-n');
  if (nEl) nEl.textContent = data.length || '';
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
  if (a.tipo === 'video')  return `<video src="${a.url}" muted preload="metadata"></video><span class="thumb-play"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>`;
  if (a.tipo === 'audio')  return `<span class="thumb-ph"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>`;
  return `<span class="thumb-ph"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>`;
}

/* ── Render lista izquierda ─────────────────────────────── */
function renderLista(archivos) {
  // El rótulo es el mismo en los dos modos: la lista cumple el papel de
  // "A continuación" tanto debajo de la publicación como al lado.
  listaCount.textContent = 'A continuación';
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
      <div class="thumb ${piezas(a) > 1 ? 'apilada' : ''}">
        ${miniatura(a)}
        <span class="thumb-tipo">${iconoTipo(a)}</span>
        ${piezas(a) > 1 ? `<span class="thumb-badge">${IC.galeria} ${piezas(a)}</span>` : ''}
      </div>
      <div class="item-meta">
        <p class="m-title ${!a.asunto ? 'sin-asunto' : ''}">${a.asunto || 'Sin asunto'}</p>
        <p class="m-sub">
          <span class="kind">${iconoTipo(a)} ${etiquetaTipo(a)}</span>
          <span class="mi solo-esc">${a.subido_por ? '@' + a.subido_por : 'Usuario'}</span>
          <span class="mi solo-movil">${cifra(a.visitas || 0)} vistas</span>
          <span class="mi solo-esc">${a.fecha}</span>
          <span class="mi solo-movil">${haceCuantoLargo(a.fecha)}</span>
        </p>
      </div>
      <button class="item-mas solo-movil" type="button" title="Más" aria-label="Más">${IC.puntos}</button>
    `;
    // El "…" de cada fila abre la hoja de ese archivo sin abrir la publicación.
    item.querySelector('.item-mas')?.addEventListener('click', e => {
      e.stopPropagation();
      abrirHojaDescripcion(a, { likes: 0 });
    });
    // Duración del vídeo sobre la miniatura. El elemento ya carga sus
    // metadatos para pintar el fotograma, así que no cuesta nada más.
    const vt = item.querySelector('.thumb video');
    if (vt) vt.addEventListener('loadedmetadata', () => {
      if (!isFinite(vt.duration) || !vt.duration) return;
      // El primer fotograma suele ser negro (fundidos de entrada) y no dice
      // nada del contenido. Se usa el del segundo 4, el mismo que enseña la
      // vista previa del reproductor, para que miniatura y reproductor no
      // muestren imágenes distintas del mismo vídeo.
      // `preload="metadata"` no trae ese trozo: el salto lo pide al
      // servidor por rango, y por eso se hace aquí y no en la URL.
      try { vt.currentTime = Math.min(4, vt.duration / 2); } catch {}
      const mm = Math.floor(vt.duration / 60), ss = Math.floor(vt.duration % 60);
      const b = document.createElement('span');
      b.className = 'thumb-badge thumb-dur solo-movil';
      b.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      item.querySelector('.thumb').appendChild(b);
    }, { once: true });
    item.addEventListener('click', () => mostrarDetalle(a));
    listaItems.appendChild(item);
  });
  mostrarDetalle(archivos[0]);
}

listaItems.innerHTML = '<p class="cargando-lista">Cargando...</p>';
fetch(`/api/archivos/${encodeURIComponent(categoria)}`)
  .then(r => r.json()).then(renderLista)
  .catch(() => { listaItems.innerHTML = '<p class="lista-vacia">Error al cargar.</p>'; });

// El rótulo ya no cambia con el ancho: se deja fijo en renderLista.
