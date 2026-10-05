/**
 * La hoja del plan de aserrío para el operario de la sierra.
 *
 * Se imprime en una impresora de oficina y se lee con aserrín en las manos:
 * A4 vertical, letra grande, SIN fondos de color (blanco y negro siempre sale
 * igual) y una casilla grande por troza para tachar «cortada» con lapicero.
 *
 * Mismo camino que los reportes del libro (`openCtpReport`: ventana abierta en
 * el clic, CSP sin scripts y botón de imprimir); se pisa su CSS de color.
 */

import { fmtM3, fmtPct, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { esc, openCtpReport } from "@/lib/forestal/ctp-print-shared";
import { FUENTE_MEDIDA_META } from "@/lib/forestal/trozas-patio-medidas";
import { resumenDelPlan, type FilaPlan, type PlanAserrio } from "@/lib/forestal/plan-aserrio";
import { formatDateNumeric, formatWeekday } from "@/lib/format";

/** «lunes 05/10» — el día del plan, como se dice en la planta. */
export const diaDelPlan = (hoy: Date): string =>
  `${formatWeekday(hoy, { largo: true })} ${formatDateNumeric(hoy).slice(0, 5)}`;

/* Todo en negro y gris: el reporte base trae verdes de marca y fondos de fila. */
const CSS_BN = `
  @page{size:A4 portrait;margin:12mm}
  body{color:#000;border:0;border-radius:0;box-shadow:none;max-width:none;padding:0 4px;font-size:14px}
  @media screen{body{max-width:860px;padding:24px}}
  h1{color:#000;font-size:24px;margin:0}
  .fecha{font-size:15px;margin:2px 0 10px}
  .hoy{font-size:22px;font-weight:800;border:2px solid #000;padding:10px 14px;margin:10px 0 6px}
  .nota{font-size:12px;margin:2px 0}
  h2{color:#000;border-bottom:1.5px solid #000;margin:20px 0 6px}
  h2::before{display:none}
  table{margin-top:4px}
  th,td{border:1px solid #000;padding:7px 8px;font-size:13px}
  th{background:none;color:#000;border-bottom:2px solid #000;font-size:12px;text-transform:none;letter-spacing:0}
  tbody tr:nth-child(even) td{background:none}
  td.cod{font-weight:800;font-size:15px;white-space:nowrap}
  td.ok{width:64px;text-align:center}
  .caja{display:inline-block;width:22px;height:22px;border:2px solid #000;border-radius:3px;vertical-align:middle}
  td.obs{width:22%}
  tr.subtot td{font-weight:800;border-top:2px solid #000}
  .total{font-size:17px;font-weight:800;margin-top:14px}
  .firma{margin-top:56px} .firma div{border-top:1.5px solid #000;color:#000}
  .foot{color:#000;border-top:1px solid #000}
`;

const num = (v: number | null, dec: number) => (v == null ? "—" : v.toFixed(dec));
const medida = (f: FilaPlan, v: number | null) => {
  const marca = f.fuente ? FUENTE_MEDIDA_META[f.fuente].marca : "";
  return v == null ? "—" : `${num(v, 1)}${marca ? ` <sup>${esc(marca)}</sup>` : ""}`;
};

function filaHtml(f: FilaPlan, i: number, conPt: boolean): string {
  return `<tr>
    <td class="num">${i}</td>
    <td class="cod">${esc(f.codigo ?? "—")}${f.aMano ? " *" : ""}</td>
    <td class="num">${medida(f, f.d1)}</td>
    <td class="num">${medida(f, f.d2)}</td>
    <td class="num">${num(f.largoM, 2)}</td>
    <td class="num">${f.m3 == null ? "—" : fmtM3(f.m3)}</td>
    <td class="num">${f.dias == null ? "—" : f.dias}</td>
    <td>${esc(f.cancha ?? "—")}</td>
    ${conPt ? `<td class="num">${f.pt == null ? "—" : `≈${fmtPt(f.pt)}`}</td>` : ""}
    <td class="ok"><span class="caja" aria-label="cortada"></span></td>
    <td class="obs"></td>
  </tr>`;
}

export function imprimirPlanAserrio(plan: PlanAserrio, hoy: Date, ventana?: Window | null): void {
  const conPt = plan.total.pt != null;
  let n = 0;
  const secciones = plan.grupos
    .map((g) => {
      const filas = g.filas.map((f) => filaHtml(f, ++n, conPt)).join("");
      const ptG = g.pt == null ? "" : ` · ≈${fmtPt(g.pt)} pt`;
      return `<h2>${esc(g.especie)} · ${g.piezas} ${g.piezas === 1 ? "pieza" : "piezas"} · ${fmtM3(g.m3)} m³${ptG}</h2>
      <table><thead><tr>
        <th>N°</th><th>Código</th><th class="num">D1 cm</th><th class="num">D2 cm</th><th class="num">Largo m</th>
        <th class="num">m³</th><th class="num">Días</th><th>Cancha</th>${conPt ? `<th class="num">pt est.</th>` : ""}
        <th>Cortada</th><th>Observación</th>
      </tr></thead><tbody>${filas}
      <tr class="subtot"><td colspan="5">Subtotal ${esc(g.especie)}</td><td class="num">${fmtM3(g.m3)}</td><td colspan="2"></td>
        ${conPt ? `<td class="num">${g.pt == null ? "—" : `≈${fmtPt(g.pt)}`}</td>` : ""}<td></td><td></td></tr>
      </tbody></table>`;
    })
    .join("");

  const rend =
    plan.rendimientoPct == null
      ? "Sin rendimiento del libro: no se estiman pies tablares."
      : `pt est. = m³ de troza × ${fmtPct(plan.rendimientoPct)} % (rendimiento real del libro) × 424. Es una estimación.`;
  const aMano = plan.grupos.some((g) => g.filas.some((f) => f.aMano)) ? "<p class=\"nota\">* agregada a mano.</p>" : "";
  const body = `
    <h1>Plan de aserrío del día</h1>
    <p class="fecha">${esc(diaDelPlan(hoy))} · las más viejas primero</p>
    <div class="hoy">Hoy: ${esc(resumenDelPlan(plan))}</div>
    <p class="nota">${esc(rend)} Cancha = la de la troza o la de su carga en el Mapa de Planta.</p>
    ${aMano}
    ${secciones}
    <p class="total">Total del día: ${plan.total.piezas} ${plan.total.piezas === 1 ? "pieza" : "piezas"} · ${fmtM3(plan.total.m3)} m³${
      plan.total.pt == null ? "" : ` · ≈${fmtPt(plan.total.pt)} pt`
    }</p>
    <div class="firma"><div>Operario de sierra</div><div>Jefe de planta</div></div>
    <p class="foot">Al declarar la corrida, las trozas cortadas salen solas del patio. Las que no se cortaron siguen libres para mañana.</p>`;
  openCtpReport({ title: `Plan de aserrío ${diaDelPlan(hoy)}`, css: CSS_BN, body, ventana });
}
