/**
 * planta-croquis-html — el HTML de lo que Leaflet dibuja sobre el croquis
 * (etiqueta de zona, troza suelta, máquina) y su CSS. Va como strings porque
 * Leaflet inserta los `divIcon` fuera del árbol de React; el CSS se monta una
 * vez con `<style jsx global>`. Solo tokens del DS: así el croquis sigue al
 * tema claro/oscuro sin tocar nada.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Etiqueta de una zona: código y, si tiene madera, cuánto (PT primero). */
export function etiquetaZonaHtml(d: { codigo: string; color: string; dato: string | null; atenuada: boolean }): string {
  return `<div class="ctp-croquis-etq${d.atenuada ? " ctp-croquis-atenuado" : ""}" style="--zona-color:${d.color}"><b>${esc(d.codigo)}</b>${d.dato ? `<span>${esc(d.dato)}</span>` : ""}</div>`;
}

/** Una troza separada de su pila: una pastilla con el código pintado en la madera. */
export function trozaSueltaHtml(d: { codigo: string; color: string; seleccionada: boolean }): string {
  return `<div class="ctp-troza-suelta${d.seleccionada ? " ctp-croquis-sel" : ""}" style="--marca-color:${d.color}" role="img" aria-label="Troza ${esc(d.codigo)}">${esc(d.codigo)}</div>`;
}

/** Una máquina del plano (D1–D7). Gris y con borde punteado cuando está fuera de la planta. */
export function maquinaHtml(d: { codigo: string; fuera: boolean; seleccionada: boolean }): string {
  return `<div class="ctp-maquina${d.fuera ? " ctp-maquina-fuera" : ""}${d.seleccionada ? " ctp-croquis-sel" : ""}" role="img" aria-label="Máquina ${esc(d.codigo)}${d.fuera ? " fuera de la planta" : ""}">${esc(d.codigo)}</div>`;
}

/** Rótulo fijo (la franja «fuera de la planta», cotas del terreno). */
export function rotuloHtml(texto: string): string {
  return `<div class="ctp-croquis-rotulo">${esc(texto)}</div>`;
}

export const CROQUIS_CSS = `
.ctp-croquis-etq{transform:translate(-50%,-50%);display:inline-flex;align-items:baseline;gap:6px;white-space:nowrap;
  border-left:3px solid var(--zona-color);background:var(--surface-raised);color:var(--text-primary);
  padding:2px 7px;border-radius:7px;font:600 11px/1.35 system-ui;box-shadow:var(--shadow-md)}
.ctp-croquis-etq b{font-weight:800}
.ctp-croquis-etq span{color:var(--text-secondary);font-weight:700}
.ctp-marca-cant{white-space:nowrap}
.ctp-croquis-atenuado{opacity:.22;filter:saturate(.3)}
.ctp-troza-suelta{width:44px;height:20px;display:flex;align-items:center;justify-content:center;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;border-radius:999px;border:2px solid var(--marca-color);
  background:var(--surface-raised);color:var(--text-primary);font:800 10px/1 ui-monospace,monospace;
  box-shadow:var(--shadow-sm);cursor:grab}
.ctp-maquina{width:30px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:6px;
  background:var(--text-primary);color:var(--surface-canvas);border:2px solid var(--data-warning-500);
  font:800 11px/1 system-ui;box-shadow:var(--shadow-md);cursor:grab}
.ctp-maquina-fuera{background:var(--surface-sunken);color:var(--text-tertiary);border:2px dashed var(--rule-strong)}
.ctp-croquis-sel{outline:3px solid var(--accent);outline-offset:2px}
.ctp-croquis-rotulo{transform:translate(-50%,-50%);white-space:nowrap;font:700 10px/1.2 system-ui;
  letter-spacing:.04em;text-transform:uppercase;color:var(--text-tertiary)}
.ctp-croquis-img{transition:filter .2s}
.dark .ctp-croquis-img{filter:brightness(.78) contrast(1.05)}
.ctp-flujo{stroke-dasharray:6 6;animation:ctp-flujo-corre 1.2s linear infinite}
@keyframes ctp-flujo-corre{to{stroke-dashoffset:-12}}
@media (prefers-reduced-motion: reduce){.ctp-flujo{animation:none}}
[data-dibujando="1"] .leaflet-marker-pane *{pointer-events:none!important}
[data-dibujando="1"] .leaflet-marker-pane{opacity:.45}
[data-lejos="1"] .ctp-marca-cant{display:none}
`;
