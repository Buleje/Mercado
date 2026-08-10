/**
 * planta-iconos — cómo se ve cada cosa sobre el mapa del aserradero.
 *
 * Los marcadores del mapa se dibujan con `L.divIcon`, que recibe HTML plano:
 * no pasa por React y por eso los iconos van como SVG en texto y no como
 * componentes de lucide. Son tres dibujos propios y no los genéricos del panel,
 * porque a 22 px lo que tiene que leerse de un vistazo es QUÉ hay ahí:
 *
 * - **troza**: la rodaja de un tronco, con sus anillos.
 * - **aserrada**: tablas apiladas de canto.
 * - **despacho**: el camión que se la lleva.
 *
 * Los colores llegan resueltos desde el componente: dentro de un `divIcon` los
 * tokens `var(--…)` sí resuelven (el HTML vive en el documento), pero el
 * contraste contra el satélite se decide acá, con una base oscura fija —el
 * mapa es una foto, no una superficie del tema.
 */

import type { ItemKind } from "./planta-zona-types";

/** Trazo blanco sobre fondo del tipo: legible contra selva, techos y tierra. */
const SVG: Record<ItemKind, string> = {
  // Rodaja de tronco: círculo + dos anillos.
  troza:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  // Tablas apiladas, vistas de canto.
  producto:
    '<rect x="3" y="5.5" width="18" height="3.6" rx="1"/><rect x="3" y="10.2" width="18" height="3.6" rx="1"/><rect x="3" y="14.9" width="18" height="3.6" rx="1"/>',
  // Camión de despacho.
  despacho:
    '<path d="M2 7.5h10.5v9H2z"/><path d="M12.5 10.5H17l4 3.2v2.8h-8.5z"/><circle cx="6.5" cy="18" r="1.8" fill="currentColor"/><circle cx="16.5" cy="18" r="1.8" fill="currentColor"/>',
};

/**
 * El texto de la chapita: sin el prefijo que ya dice el icono. «GTF QA-CUADRE-
 * 5467124» entra cortado a la mitad; «QA-CUADRE-5467124» entra entero, y el
 * dibujo del tronco ya dijo que es una guía de ingreso.
 */
export function etiquetaCorta(label: string): string {
  return label
    .replace(/^GTF\s+/i, "")
    .replace(/^Corrida\s*#?\s*/i, "#")
    .replace(/^Despacho\s*#?\s*/i, "#");
}

export const ICONO_LABEL: Record<ItemKind, string> = {
  troza: "Troza",
  producto: "Aserrada",
  despacho: "Despacho",
};

/**
 * Chapita de un ítem sobre el mapa: icono + texto corto.
 *
 * `color` es el del tipo de zona (llega ya resuelto o como token) y `entrando`
 * enciende la animación de caída — sólo para el que se acaba de soltar, así el
 * ojo lo encuentra sin buscarlo.
 */
export function marcaHtml(opts: {
  kind: ItemKind;
  texto: string;
  color: string;
  /** Cantidad ya formateada («12.5 m³»). Va arriba del icono. */
  cantidad?: string;
  entrando?: boolean;
  cites?: boolean;
}): string {
  const { kind, texto, color, cantidad, entrando, cites } = opts;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  // SÓLO el icono, sin el texto al lado: medido en el navegador, seis chapitas
  // con el número de guía se pisaban entre sí dentro del patio (cada una ~110 px
  // sobre un polígono de 230 px). Qué guía es se lee en la barra lateral; el
  // mapa responde la otra pregunta —qué y cuánto hay acá— y para eso alcanza el
  // dibujo. El `aria-label` conserva el dato para lectores de pantalla.
  return [
    `<div class="ctp-marca-wrap">`,
    // La cantidad va ARRIBA del icono: es el dato que se busca al mirar el
    // patio («cuánto hay en esa pila»), y no cabe adentro del círculo.
    cantidad ? `<span class="ctp-marca-cant">${esc(cantidad)}</span>` : "",
    `<div class="ctp-marca${entrando ? " ctp-marca-entra" : ""}${cites ? " ctp-marca-cites" : ""}"`,
    ` style="--marca-color:${color}" role="img" aria-label="${esc(texto)}${cantidad ? ` · ${esc(cantidad)}` : ""}">`,
    `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG[kind]}</svg>`,
    `</div>`,
    `</div>`,
  ].join("");
}

/** Pila «+N» para lo que no entró en la zona. */
export function marcaSobranteHtml(n: number, color: string): string {
  return `<div class="ctp-marca ctp-marca-mas" style="--marca-color:${color}">+${n}</div>`;
}

/**
 * Estilos de las chapitas. Van una sola vez en el documento (`<style jsx global>`
 * no alcanza: el HTML del `divIcon` lo inserta Leaflet fuera del árbol de React).
 */
// ─── Fichas emergentes del mapa ────────────────────────────────────────────

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/**
 * Ficha de UN ítem, al tocar su icono.
 *
 * Responde lo que se pregunta parado frente a la pila: qué es, de qué especie,
 * cuánto queda y en qué zona está. La acción de sacarlo del mapa va acá adentro
 * porque es donde el operador la busca: señaló la pila, quiere moverla.
 */
export function fichaItemHtml(d: {
  kind: ItemKind;
  titulo: string;
  especie: string | null;
  cantidad: string;
  zona: string;
  cites: boolean;
  entryId: string;
}): string {
  const filas = [
    d.especie ? `<div class="ctp-pop-fila"><span>Especie</span><b>${esc(d.especie)}</b></div>` : "",
    `<div class="ctp-pop-fila"><span>Disponible</span><b>${esc(d.cantidad)}</b></div>`,
    `<div class="ctp-pop-fila"><span>Zona</span><b>${esc(d.zona)}</b></div>`,
  ].join("");
  return [
    `<div class="ctp-pop">`,
    `<div class="ctp-pop-tit">`,
    `<span class="ctp-pop-ico"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG[d.kind]}</svg></span>`,
    `<b>${esc(d.titulo)}</b>`,
    d.cites ? `<span class="ctp-pop-cites">CITES</span>` : "",
    `</div>`,
    `<div class="ctp-pop-body">${filas}</div>`,
    `<div class="ctp-pop-pie">Arrastrá el icono para moverlo dentro de la zona`,
    `<button type="button" class="ctp-pop-btn" data-quitar="${esc(d.entryId)}">Quitar del mapa</button>`,
    `</div>`,
    `</div>`,
  ].join("");
}

/**
 * Ficha de una ZONA: el terreno y lo que hay parado adentro, con el desglose
 * por especie —que es el que decide si un pedido se puede cumplir con lo que
 * hay en el patio—.
 */
export function fichaZonaHtml(d: {
  codigo: string;
  nombre: string | null;
  tipoLabel: string;
  color: string;
  area: string | null;
  notas: string | null;
  /** Ya formateados por `fmtSubtotales`, para no meter lógica de números acá. */
  porKind: { label: string; valor: string; lineas: number }[];
  porEspecie: { especie: string; valor: string; lineas: number }[];
  vacia: boolean;
}): string {
  const kinds = d.porKind
    .map((k) => `<div class="ctp-pop-fila"><span>${esc(k.label)} <i>· ${k.lineas}</i></span><b>${esc(k.valor)}</b></div>`)
    .join("");
  const especies = d.porEspecie
    .map((e) => `<div class="ctp-pop-fila"><span>${esc(e.especie)} <i>· ${e.lineas}</i></span><b>${esc(e.valor)}</b></div>`)
    .join("");
  return [
    `<div class="ctp-pop ctp-pop-zona" style="--marca-color:${d.color}">`,
    `<div class="ctp-pop-tit"><b>${esc(d.codigo)}</b><span class="ctp-pop-tipo">${esc(d.tipoLabel)}</span></div>`,
    d.nombre ? `<p class="ctp-pop-sub">${esc(d.nombre)}</p>` : "",
    `<div class="ctp-pop-body">`,
    d.area ? `<div class="ctp-pop-fila"><span>Superficie</span><b>${esc(d.area)}</b></div>` : "",
    d.vacia
      ? `<p class="ctp-pop-vacia">Sin madera ubicada acá todavía.</p>`
      : `${kinds}<div class="ctp-pop-sep">Por especie</div>${especies}`,
    `</div>`,
    d.notas ? `<p class="ctp-pop-notas">${esc(d.notas)}</p>` : "",
    `<div class="ctp-pop-pie"><button type="button" class="ctp-pop-btn" data-ficha="1">Ver ficha de la zona</button></div>`,
    `</div>`,
  ].join("");
}

export const MARCA_CSS = `
/* El icono y su cantidad viajan juntos; el ancla del marcador es el icono. */
.ctp-marca-wrap { position: relative; width: 26px; height: 26px; }
.ctp-marca-cant {
  position: absolute; left: 50%; top: -13px; transform: translateX(-50%);
  padding: 1px 5px; border-radius: 999px; white-space: nowrap;
  background: rgba(9, 14, 22, .9); color: #fff;
  border: 1px solid var(--marca-color, #fff);
  font: 800 9px/1.3 system-ui, sans-serif;
}
.ctp-marca {
  display: grid; place-items: center;
  width: 26px; height: 26px; border-radius: 999px;
  background: var(--marca-color, #fff); color: #0b1220;
  border: 2px solid rgba(9, 14, 22, .85);
  box-shadow: 0 2px 6px rgba(0,0,0,.5);
}
/* CITES: un anillo rojo alrededor, sin tapar el dibujo. */
.ctp-marca-cites { box-shadow: 0 0 0 2px var(--data-error-500, #ef4444), 0 2px 6px rgba(0,0,0,.5); }
/* La pila de lo que no entró: misma medida, sin icono. */
.ctp-marca-mas {
  width: auto; min-width: 26px; height: 22px; padding: 0 7px; border-radius: 999px;
  background: rgba(9, 14, 22, .9); color: #fff;
  border: 2px solid var(--marca-color, #fff);
  font: 800 11px/1 system-ui, sans-serif;
}
/* Caída del que se acaba de soltar: entra desde arriba y asienta. */
.ctp-marca-entra { animation: ctp-marca-caer .45s cubic-bezier(.2,.9,.3,1.3); }
@keyframes ctp-marca-caer {
  0%   { transform: translateY(-38px) scale(.5); opacity: 0; }
  60%  { transform: translateY(0) scale(1.18); opacity: 1; }
  100% { transform: translateY(0) scale(1); }
}
/* La ficha de zona anclada al borde de arriba se corre hacia afuera para no
   pisar la primera fila de chapitas. */
.ctp-zona-ficha-arriba { transform: translate(-50%, -125%) !important; }
/* La zona bajo el puntero mientras se arrastra: latido, no un color fijo. */
.ctp-zona-objetivo { animation: ctp-zona-latir 1.1s ease-in-out infinite; }
@keyframes ctp-zona-latir {
  0%, 100% { fill-opacity: .45; }
  50%      { fill-opacity: .75; }
}
/* Mientras se arrastra un icono dentro de su zona. */
.ctp-marca-moviendo { cursor: grabbing; filter: brightness(1.25); }
.leaflet-marker-draggable .ctp-marca { cursor: grab; }

/* ── Fichas emergentes ────────────────────────────────────────────────── */
.ctp-pop { min-width: 200px; max-width: 260px; font: 500 12px/1.45 system-ui, sans-serif; }
.ctp-pop-tit { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.ctp-pop-tit b { font-weight: 800; }
.ctp-pop-ico {
  display: grid; place-items: center; width: 20px; height: 20px; border-radius: 999px;
  background: var(--marca-color, var(--accent, #14b8a6)); color: #0b1220; flex: 0 0 auto;
}
.ctp-pop-tipo { margin-left: auto; font-size: 10px; font-weight: 800; color: var(--marca-color, inherit); }
.ctp-pop-cites {
  padding: 0 5px; border-radius: 999px; font-size: 9px; font-weight: 800;
  background: var(--data-error-500, #ef4444); color: #fff;
}
.ctp-pop-sub { margin: 2px 0 0; opacity: .75; }
.ctp-pop-body { margin-top: 6px; display: grid; gap: 2px; }
.ctp-pop-fila { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.ctp-pop-fila span { opacity: .7; }
.ctp-pop-fila i { font-style: normal; opacity: .6; font-size: 10px; }
.ctp-pop-fila b { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ctp-pop-sep {
  margin-top: 5px; padding-top: 5px; border-top: 1px solid currentColor;
  font-size: 9px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; opacity: .55;
}
.ctp-pop-vacia { margin: 4px 0 0; opacity: .6; }
.ctp-pop-notas { margin: 6px 0 0; padding-top: 5px; border-top: 1px solid currentColor; opacity: .65; font-size: 11px; }
.ctp-pop-pie { margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 10px; opacity: .7; }
.ctp-pop-btn {
  margin-left: auto; flex: 0 0 auto; cursor: pointer;
  padding: 3px 8px; border-radius: 7px; border: 1.5px solid currentColor; background: transparent;
  font: 800 10px system-ui, sans-serif; color: inherit;
}
.ctp-pop-btn:hover { background: rgba(127,127,127,.18); }

/* El globo de Leaflet es blanco por defecto: acá manda el tema del panel. */
.ctp-popup .leaflet-popup-content-wrapper {
  background: var(--surface-raised, #fff);
  color: var(--text-primary, #111);
  border: 2px solid var(--rule-base, #e5e7eb);
  border-radius: 14px;
  box-shadow: 0 8px 28px rgba(0,0,0,.35);
}
.ctp-popup .leaflet-popup-content { margin: 10px 12px; }
.ctp-popup .leaflet-popup-tip { background: var(--surface-raised, #fff); border: 2px solid var(--rule-base, #e5e7eb); }
.ctp-popup .leaflet-popup-close-button { color: var(--text-tertiary, #888); }

@media (prefers-reduced-motion: reduce) {
  .ctp-marca-entra, .ctp-zona-objetivo { animation: none; }
}
`;

