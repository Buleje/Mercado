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
  entrando?: boolean;
  cites?: boolean;
}): string {
  const { kind, texto, color, entrando, cites } = opts;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  // SÓLO el icono, sin el texto al lado: medido en el navegador, seis chapitas
  // con el número de guía se pisaban entre sí dentro del patio (cada una ~110 px
  // sobre un polígono de 230 px). Qué guía es se lee en la barra lateral; el
  // mapa responde la otra pregunta —qué y cuánto hay acá— y para eso alcanza el
  // dibujo. El `aria-label` conserva el dato para lectores de pantalla.
  return [
    `<div class="ctp-marca${entrando ? " ctp-marca-entra" : ""}${cites ? " ctp-marca-cites" : ""}"`,
    ` style="--marca-color:${color}" role="img" aria-label="${esc(texto)}">`,
    `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG[kind]}</svg>`,
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
export const MARCA_CSS = `
.ctp-marca {
  display: grid; place-items: center;
  width: 26px; height: 26px; border-radius: 999px;
  transform: translate(-50%, -50%);
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
  0%   { transform: translate(-50%, -200%) scale(.5); opacity: 0; }
  60%  { transform: translate(-50%, -50%) scale(1.18); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1); }
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
@media (prefers-reduced-motion: reduce) {
  .ctp-marca-entra, .ctp-zona-objetivo { animation: none; }
}
`;
