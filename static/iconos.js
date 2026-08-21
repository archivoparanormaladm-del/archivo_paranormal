/* ══════════════════════════════════════════════════════════
   LIBRERÍA DE ICONOS — temática de terror / paranormal
   Compartida por el grid de categorías (dashboard.js) y por el
   selector del panel de administración (admin.js).

   Cada icono es el *contenido* de un <svg viewBox="0 0 24 24">
   dibujado con trazo (no relleno): el color lo hereda del
   contenedor. La clave se guarda en `categorias.icono` en la BD.
   ══════════════════════════════════════════════════════════ */

const ICONOS_TERROR = {

  /* ── Espectros ── */
  fantasma: { grupo: 'Espectros', nombre: 'Fantasma',
    d: '<path d="M12 2.5a7 7 0 0 0-7 7v11.2l2.6-2 2.2 1.8L12 18.6l2.2 1.9 2.2-1.8 2.6 2V9.5a7 7 0 0 0-7-7Z"/><circle cx="9.6" cy="10" r="1.05"/><circle cx="14.4" cy="10" r="1.05"/>' },
  calavera: { grupo: 'Espectros', nombre: 'Calavera',
    d: '<path d="M12 2.5c-4.7 0-8 3.4-8 7.7 0 2.6 1.2 4.4 2.6 5.5.5.4.8 1 .8 1.6v1.4a1.8 1.8 0 0 0 1.8 1.8h5.6a1.8 1.8 0 0 0 1.8-1.8v-1.4c0-.6.3-1.2.8-1.6 1.4-1.1 2.6-2.9 2.6-5.5 0-4.3-3.3-7.7-8-7.7Z"/><circle cx="9.2" cy="10.4" r="1.9"/><circle cx="14.8" cy="10.4" r="1.9"/><path d="M12 13.6v2.2M10 20.8v-2M14 20.8v-2"/>' },
  huesos: { grupo: 'Espectros', nombre: 'Huesos cruzados',
    d: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/><circle cx="5.2" cy="5.2" r="1.7"/><circle cx="18.8" cy="18.8" r="1.7"/><circle cx="18.8" cy="5.2" r="1.7"/><circle cx="5.2" cy="18.8" r="1.7"/>' },
  demonio: { grupo: 'Espectros', nombre: 'Demonio',
    d: '<path d="M4.4 3.4c3 .4 5 2.4 6 5.4M19.6 3.4c-3 .4-5 2.4-6 5.4"/><path d="M12 8.8c-3.9 0-6.6 2.8-6.6 6.4 0 3 2.2 5.4 5 5.4.9 0 1.2-.4 1.6-.4s.7.4 1.6.4c2.8 0 5-2.4 5-5.4 0-3.6-2.7-6.4-6.6-6.4Z"/><circle cx="9.6" cy="14.4" r="1"/><circle cx="14.4" cy="14.4" r="1"/>' },
  mascara: { grupo: 'Espectros', nombre: 'Máscara',
    d: '<path d="M2.6 9.6C5.7 8 8.8 7.3 12 7.3s6.3.7 9.4 2.3v1.9c0 2.6-2.1 4.7-4.7 4.7-2 0-3.6-1.1-4.7-2.8-1.1 1.7-2.7 2.8-4.7 2.8-2.6 0-4.7-2.1-4.7-4.7V9.6Z"/><path d="M6.4 6.1 8 3.1h8l1.6 3"/>' },
  garras: { grupo: 'Espectros', nombre: 'Zarpazo',
    d: '<path d="M5.5 3c2.2 3.6 3.4 9.2 3.4 17.4"/><path d="M11 2.2c1.6 3.9 2.3 9.8 2.1 18"/><path d="M16.6 3c.6 4-.2 9.8-1.6 16.6"/>' },
  sangre: { grupo: 'Espectros', nombre: 'Gota de sangre',
    d: '<path d="M12 2.6c3.4 4.6 5.6 7.8 5.6 10.6a5.6 5.6 0 1 1-11.2 0c0-2.8 2.2-6 5.6-10.6Z"/>' },

  /* ── Ocultismo ── */
  ouija: { grupo: 'Ocultismo', nombre: 'Ouija',
    d: '<path d="M12 2.6c4.5 0 8.1 3 8.1 6.7 0 2.7-1.9 5-4.7 6.1L12 21.4l-3.4-6C5.8 14.3 3.9 12 3.9 9.3c0-3.7 3.6-6.7 8.1-6.7Z"/><circle cx="12" cy="9.2" r="2.7"/>' },
  pentagrama: { grupo: 'Ocultismo', nombre: 'Pentagrama',
    d: '<circle cx="12" cy="12" r="9.2"/><path d="m12 3.4 2.98 13.9L4.05 8.9h15.9L9.02 17.3Z"/>' },
  cruz: { grupo: 'Ocultismo', nombre: 'Cruz',
    d: '<path d="M12 2.5v19"/><path d="M6.5 8.2h11"/>' },
  cruz_invertida: { grupo: 'Ocultismo', nombre: 'Cruz invertida',
    d: '<path d="M12 2.5v19"/><path d="M6.5 15.8h11"/>' },
  ojo: { grupo: 'Ocultismo', nombre: 'Ojo',
    d: '<path d="M2.2 12s3.8-6.6 9.8-6.6S21.8 12 21.8 12s-3.8 6.6-9.8 6.6S2.2 12 2.2 12Z"/><circle cx="12" cy="12" r="3.2"/>' },
  ojo_triangulo: { grupo: 'Ocultismo', nombre: 'Ojo que todo lo ve',
    d: '<path d="m12 2.6 9.4 17.4H2.6Z"/><path d="M6.6 14.4s2.2-3 5.4-3 5.4 3 5.4 3-2.2 3-5.4 3-5.4-3-5.4-3Z"/><circle cx="12" cy="14.4" r="1.4"/>' },
  grimorio: { grupo: 'Ocultismo', nombre: 'Grimorio',
    d: '<path d="M4.4 4.2a2 2 0 0 1 2-2h13.2v17.6H6.4a2 2 0 0 0-2 2Z"/><path d="M4.4 19.8a2 2 0 0 1 2-2h13.2"/><path d="m12 6.4 1.1 2.5 2.5.4-1.8 1.9.4 2.6-2.2-1.2-2.2 1.2.4-2.6-1.8-1.9 2.5-.4z"/>' },
  sigilo: { grupo: 'Ocultismo', nombre: 'Sigilo',
    d: '<path d="m12 2.4 2.6 6.4 6.9.5-5.3 4.5 1.7 6.7L12 16.9l-5.9 3.6 1.7-6.7-5.3-4.5 6.9-.5z"/>' },
  sombrero_bruja: { grupo: 'Ocultismo', nombre: 'Sombrero de bruja',
    d: '<path d="m12 2.4 4 11.2H8Z"/><path d="M4.4 13.6h15.2c.7 0 1.2.6 1.2 1.3 0 2.2-4 3.5-8.8 3.5s-8.8-1.3-8.8-3.5c0-.7.5-1.3 1.2-1.3Z"/><path d="M9.8 13.6h4.4"/>' },
  caldero: { grupo: 'Ocultismo', nombre: 'Caldero',
    d: '<path d="M4 9.4h16"/><path d="M5.2 9.4v4.2a6.8 6.8 0 0 0 13.6 0V9.4"/><path d="M9 6.4c0-1.4 1-1.8 1-3M13.4 6c0-1.8 1.2-2.2 1.2-3.6"/><path d="M3.4 20.6h17.2"/>' },
  pocion: { grupo: 'Ocultismo', nombre: 'Poción',
    d: '<path d="M9.4 2.6h5.2M10.4 2.6v5L6.2 15.4a4.6 4.6 0 0 0 4.1 6.8h3.4a4.6 4.6 0 0 0 4.1-6.8L13.6 7.6v-5"/><path d="M7.6 14.2c2.6 1.4 6.2 1.4 8.8 0"/><circle cx="11" cy="17.6" r=".9"/>' },
  escoba: { grupo: 'Ocultismo', nombre: 'Escoba',
    d: '<path d="M12 2.2v9.4"/><path d="M7.4 11.6h9.2l1.4 9.6c-2 .8-9.4.8-12 0z"/><path d="M9.6 13.8v6.6M12 13.8v7M14.4 13.8v6.6"/>' },
  vela: { grupo: 'Ocultismo', nombre: 'Vela',
    d: '<path d="M12 2.4c1.6 1.8 2.4 3.1 2.4 4.2a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.4 2.4-4.2Z"/><path d="M8.6 9.6h6.8v11.8H8.6z"/>' },

  /* ── Criaturas ── */
  duende: { grupo: 'Criaturas', nombre: 'Duende',
    d: '<path d="M12 2.2 5.6 12h12.8L12 2.2Z"/><path d="M6.6 12h10.8c0 3.6-2.2 6-5.4 9-3.2-3-5.4-5.4-5.4-9Z"/><circle cx="9.9" cy="14.2" r=".85"/><circle cx="14.1" cy="14.2" r=".85"/>' },
  murcielago: { grupo: 'Criaturas', nombre: 'Murciélago',
    d: '<path d="M12 8.4c-1 0-1.7.9-2 1.9-.9-1.5-2.4-3-4.3-3.4.4 1.2.3 2.3-.2 3.2-1 0-2 .3-2.8.9 2.6.5 4.4 2.4 5.3 4.8l1.7-1.5L12 17l2.3-2.7 1.7 1.5c.9-2.4 2.7-4.3 5.3-4.8-.8-.6-1.8-.9-2.8-.9-.5-.9-.6-2-.2-3.2-1.9.4-3.4 1.9-4.3 3.4-.3-1-1-1.9-2-1.9Z"/>' },
  arania: { grupo: 'Criaturas', nombre: 'Araña',
    d: '<circle cx="12" cy="13" r="3.4"/><circle cx="12" cy="8.6" r="1.9"/><path d="M8.8 10.8 5 8.2 3.2 9.8M8.8 13H4.4l-1.8 1.8M9.2 15.4 5.6 18.2 5 20.6M15.2 10.8 19 8.2l1.8 1.6M15.2 13h4.4l1.8 1.8M14.8 15.4l3.6 2.8.6 2.4"/>' },
  telarania: { grupo: 'Criaturas', nombre: 'Telaraña',
    d: '<path d="M12 2.6 21 7.2v9.6L12 21.4 3 16.8V7.2Z"/><path d="M12 7.4 16.8 9.8v4.4L12 16.6 7.2 14.2V9.8Z"/><path d="M12 2.6v4.8M21 7.2l-4.2 2.6M21 16.8l-4.2-2.6M12 21.4v-4.8M3 16.8l4.2-2.6M3 7.2l4.2 2.6"/>' },
  cuervo: { grupo: 'Criaturas', nombre: 'Cuervo',
    d: '<path d="M4.2 13.6c0-3.9 3-7 6.8-7 2.4 0 4 1 5 2.4l4-1.6-1.6 3 1.8 1.2-2.4.8c-.2 3.6-3.2 6.4-6.8 6.4-.6 2-2.4 2.6-2.4 2.6s.4-1.8-.4-2.8c-2.4-1-4-3.4-4-5Z"/><circle cx="14.6" cy="10.4" r=".8"/>' },
  gato: { grupo: 'Criaturas', nombre: 'Gato negro',
    d: '<path d="M5.4 9.6 4.6 3.8l4.4 3.1a9.4 9.4 0 0 1 6 0l4.4-3.1-.8 5.8a7.4 7.4 0 0 1 1.2 4c0 4.4-3.6 7.6-7.8 7.6S4.2 18 4.2 13.6c0-1.4.4-2.8 1.2-4Z"/><circle cx="9.4" cy="13" r="1"/><circle cx="14.6" cy="13" r="1"/><path d="M12 15.6v1.4M9.6 17.4h4.8"/>' },
  huella: { grupo: 'Criaturas', nombre: 'Huella',
    d: '<path d="M12 21.4c-2.8 0-4.6-1.9-4.6-4.4 0-3 2-4.6 2-7.4 0-2.4 1.1-4 2.6-4s2.6 1.6 2.6 4c0 2.8 2 4.4 2 7.4 0 2.5-1.8 4.4-4.6 4.4Z"/><circle cx="8.2" cy="5.6" r="1.3"/><circle cx="11.2" cy="3.4" r="1.2"/><circle cx="14.4" cy="3.6" r="1.2"/><circle cx="16.8" cy="5.8" r="1.3"/>' },
  patas: { grupo: 'Criaturas', nombre: 'Huella animal',
    d: '<ellipse cx="6.3" cy="10.2" rx="1.85" ry="2.25"/><ellipse cx="9.9" cy="6.6" rx="1.85" ry="2.25"/><ellipse cx="14.1" cy="6.6" rx="1.85" ry="2.25"/><ellipse cx="17.7" cy="10.2" rx="1.85" ry="2.25"/><path d="M12 12.6c-3.1 0-5.2 2.1-5.2 4.6 0 2 1.5 3.2 3.3 3.2 1 0 1.4-.4 1.9-.4s.9.4 1.9.4c1.8 0 3.3-1.2 3.3-3.2 0-2.5-2.1-4.6-5.2-4.6Z"/>' },
  alien: { grupo: 'Criaturas', nombre: 'Alien',
    d: '<path d="M12 2.6c4.4 0 7.4 3.2 7.4 7.4 0 5.4-4.4 11.4-7.4 11.4S4.6 15.4 4.6 10c0-4.2 3-7.4 7.4-7.4Z"/><path d="M8.4 9.6c1.2.2 2.2 1 2.6 2.2-1.2.4-2.6-.4-3.4-1.4M15.6 9.6c-1.2.2-2.2 1-2.6 2.2 1.2.4 2.6-.4 3.4-1.4"/>' },
  ovni: { grupo: 'Criaturas', nombre: 'OVNI',
    d: '<ellipse cx="12" cy="13" rx="9.2" ry="3.4"/><path d="M7.2 11.4c.6-2.8 2.5-4.6 4.8-4.6s4.2 1.8 4.8 4.6"/><path d="M6.4 16.8 4.4 20M12 17v3.4M17.6 16.8l2 3.2"/>' },

  /* ── Lugares ── */
  casa: { grupo: 'Lugares', nombre: 'Casa embrujada',
    d: '<path d="M3.4 11.2 12 4l8.6 7.2"/><path d="M5.8 10v11h12.4V10"/><path d="M10 21v-5.2h4V21"/><path d="M8.4 12.6h1.8M13.8 12.6h1.8"/><path d="M12 4V1.8"/>' },
  lapida: { grupo: 'Lugares', nombre: 'Lápida',
    d: '<path d="M5.5 21.5V9a6.5 6.5 0 0 1 13 0v12.5Z"/><path d="M12 7.5v6M9.6 10.5h4.8"/><path d="M3 21.5h18"/>' },
  ataud: { grupo: 'Lugares', nombre: 'Ataúd',
    d: '<path d="M9 2.5h6l3 6.5-3 12.5H9L6 9Z"/><path d="M12 8.5v6M9.6 11.5h4.8"/>' },
  puerta: { grupo: 'Lugares', nombre: 'Puerta',
    d: '<path d="M5.4 2.6h13.2v18.8H5.4z"/><circle cx="15.4" cy="12.2" r="1.1"/><path d="M8.6 6.6h6.8"/>' },
  espejo: { grupo: 'Lugares', nombre: 'Espejo',
    d: '<ellipse cx="12" cy="9.6" rx="7" ry="7.4"/><ellipse cx="12" cy="9.6" rx="4.6" ry="5"/><path d="M12 17v4.4M8.6 21.4h6.8"/>' },
  luna: { grupo: 'Lugares', nombre: 'Luna',
    d: '<path d="M20.4 14.4A9 9 0 0 1 9.6 3.6a9 9 0 1 0 10.8 10.8Z"/>' },

  /* ── Objetos ── */
  daga: { grupo: 'Objetos', nombre: 'Daga',
    d: '<path d="M12 2.2 14.4 12h-4.8Z"/><path d="M9.6 12h4.8v2.4H9.6z"/><path d="M6.6 14.4h10.8"/><path d="M12 14.4v7.4"/>' },
  cadena: { grupo: 'Objetos', nombre: 'Cadenas',
    d: '<rect x="2.6" y="9" width="8.4" height="6" rx="3"/><rect x="13" y="9" width="8.4" height="6" rx="3"/><path d="M11 12h2"/>' },
  llave: { grupo: 'Objetos', nombre: 'Llave',
    d: '<circle cx="7.4" cy="8.2" r="4.6"/><path d="M10.7 11.5 20.4 21.2"/><path d="m16.4 17.2-2 2M18.4 19.2l-2 2"/>' },
  reloj: { grupo: 'Objetos', nombre: 'Reloj',
    d: '<circle cx="12" cy="12" r="9.2"/><path d="M12 6.4V12l3.6 2.2"/>' },
  calabaza: { grupo: 'Objetos', nombre: 'Calabaza',
    d: '<path d="M12 6.2c-.8-1.4-2-2-3.4-2C5.8 4.2 3.4 7.6 3.4 12s2.4 7.8 5.2 7.8c1.2 0 2.3-.5 3.4-1.4 1.1.9 2.2 1.4 3.4 1.4 2.8 0 5.2-3.4 5.2-7.8s-2.4-7.8-5.2-7.8c-1.4 0-2.6.6-3.4 2Z"/><path d="M12 6.2V3.4c0-.9.7-1.6 1.6-1.6"/><path d="m8.4 11 2 2.2-2 .8M15.6 11l-2 2.2 2 .8"/><path d="M8.6 16.4c1 .8 2.2 1.2 3.4 1.2s2.4-.4 3.4-1.2"/>' },
  onda: { grupo: 'Objetos', nombre: 'Psicofonía',
    d: '<path d="M2.8 12h1.4"/><path d="M7 8.1v7.8"/><path d="M11 4.4v15.2"/><path d="M15 6.9v10.2"/><path d="M19 9.6v4.8"/><path d="M21.6 11.4v1.2"/>' },
  vhs: { grupo: 'Objetos', nombre: 'Cinta VHS',
    d: '<rect x="2.4" y="5.4" width="19.2" height="13.2" rx="2"/><circle cx="8.6" cy="12" r="2.6"/><circle cx="15.4" cy="12" r="2.6"/><path d="M8.6 12h6.8"/><path d="M5 16.6h14"/>' },
  tv: { grupo: 'Objetos', nombre: 'Estática',
    d: '<rect x="2.6" y="7" width="18.8" height="13.4" rx="2.2"/><path d="m8 3.4 4 3.6 4-3.6"/><path d="M6 11h3M11 11h2M15 11h3M6 14h5M13 14h5M6 17h2M10 17h4M16 17h2"/>' },
  gif: { grupo: 'Objetos', nombre: 'Video / GIF',
    d: '<rect x="2.6" y="4.6" width="18.8" height="14.8" rx="2.6"/><path d="M2.6 8.4h18.8M7 4.6v3.8M17 4.6v3.8"/><path d="m10.4 11.6 4.4 2.6-4.4 2.6z"/>' },
  carpeta: { grupo: 'Objetos', nombre: 'Carpeta',
    d: '<path d="M3.2 7.1a2.1 2.1 0 0 1 2.1-2.1h3.9l2.1 2.1h7.4a2.1 2.1 0 0 1 2.1 2.1v8.6a2.1 2.1 0 0 1-2.1 2.1H5.3a2.1 2.1 0 0 1-2.1-2.1Z"/>' },
};

/* Icono usado cuando la categoría no tiene ninguno asignado. */
const ICONO_DEFECTO = 'carpeta';

/* Adivina un icono a partir del nombre, para las categorías que ya
   existían antes de que la columna `icono` existiera en la base. */
const ALIAS_ICONO = {
  fantasmas: 'fantasma', duendes: 'duende', exorcismo: 'cruz',
  poltergeist: 'casa', psicofonias: 'onda', ouija: 'ouija',
  animales: 'patas', brujeria: 'pentagrama', 'modo incognito': 'mascara',
  criptozoologia: 'huella', gif: 'gif', otros: 'carpeta',
};

/* Sin tildes y en minúsculas, para que el nombre real de la BD calce. */
function normalizarNombre(txt) {
  return String(txt || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/* Devuelve el SVG interno de una categoría. `clave` es lo guardado en
   la BD; si viene vacía o es desconocida se deduce del nombre: primero
   por alias, luego probando el nombre como clave directa (así "Ovni" o
   "Calavera" aciertan solos), y si nada calza, el icono por defecto. */
function svgIcono(clave, nombre) {
  if (clave && ICONOS_TERROR[clave]) return ICONOS_TERROR[clave].d;
  const n = normalizarNombre(nombre);
  const k = ALIAS_ICONO[n]
         || (ICONOS_TERROR[n] ? n : null)
         || (ICONOS_TERROR[n.replace(/ /g, '_')] ? n.replace(/ /g, '_') : null)
         || ICONO_DEFECTO;
  return ICONOS_TERROR[k].d;
}

/* Agrupa las claves por su `grupo`, respetando el orden de definición. */
function iconosPorGrupo() {
  const grupos = {};
  for (const [clave, ico] of Object.entries(ICONOS_TERROR)) {
    (grupos[ico.grupo] ||= []).push({ clave, ...ico });
  }
  return grupos;
}
