/**
 * conteo-patio-acta.ts — el acta imprimible de un conteo del patio (ADR-436).
 *
 * Arma el HTML que `openCtpReport` muestra: cuándo y quién contó, los totales
 * y las tres listas (Faltan agrupadas por especie, Sorpresas con su motivo,
 * Encontradas). Todo campo pasa por `esc()`: el reporte es HTML armado a mano.
 *
 * Es un acta del equipo, no del libro: esta ronda no escribe nada en la base.
 */

import { esc } from "./ctp-print-shared";
import { fmtM3 } from "./cubicacion-formato";
import { formatDateNumeric, formatTime, formatWeekday } from "@/lib/format";
import {
  agruparFaltan,
  codigoDeTroza,
  motivoDeSorpresa,
  resumirConteo,
  type ConteoPatio,
} from "./conteo-patio";
import { diasEnElPatio, textoDias } from "./conteo-patio-pasos";

/** «jueves 26/09/2026, 10:32» — el formato de fecha del panel, con hora. */
export function fechaHoraDelConteo(iso: string): string {
  return `${formatWeekday(iso, { largo: true })} ${formatDateNumeric(iso)}, ${formatTime(iso)}`;
}

/** «sábado 26/09, 10:32» — en pantalla el año sobra (es el conteo de hoy). */
export function fechaHoraCorta(iso: string): string {
  return `${formatWeekday(iso, { largo: true })} ${formatDateNumeric(iso).slice(0, 5)}, ${formatTime(iso)}`;
}

const m3 = (v: number) => `${fmtM3(v)} m³`;

const ACTA_CSS = `
  .tot{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 4px}
  .tot div{border:1px solid #e2e9e5;border-radius:10px;padding:10px 12px}
  .tot b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
  .tot span{color:#5c6864;font-size:12px}
  h3{font-size:13.5px;margin:16px 0 4px}
  .vacio{color:#5c6864;font-style:italic}
`;

export function actaDelConteo(
  c: ConteoPatio,
  negocio?: string | null,
): { title: string; css: string; body: string } {
  const r = resumirConteo(c);
  const fin = c.terminadoEn ?? new Date().toISOString();
  /* Una celda `{ num }` va alineada a la derecha, con cifras tabulares. */
  const fila = (celdas: (string | { num: string })[]) =>
    `<tr>${celdas.map((x) => (typeof x === "string" ? `<td>${x}</td>` : `<td class="num">${x.num}</td>`)).join("")}</tr>`;
  const numero = (v: number | null) => ({ num: v == null ? "—" : esc(fmtM3(v)) });

  const faltan = agruparFaltan(r.faltan, "especie")
    .map(
      (g) => `<h3>${esc(g.clave)} · ${g.trozas.length} pieza${g.trozas.length === 1 ? "" : "s"} · ${esc(m3(g.m3))}</h3>
<table><thead><tr><th>Código</th><th>Guía</th><th>Cancha</th><th>En el patio</th><th class="num">m³</th></tr></thead><tbody>
${g.trozas
  .map((t) =>
    fila([
      esc(codigoDeTroza(t)),
      esc(t.gtfNumber ?? "—"),
      esc(t.cancha ?? "—"),
      esc(textoDias(diasEnElPatio(t, c.fecha)) ?? "—"),
      numero(t.volumenM3),
    ]),
  )
  .join("")}
</tbody></table>`,
    )
    .join("");

  const sorpresas = r.sorpresas.length
    ? `<table><thead><tr><th>Código</th><th>Especie</th><th>Guía</th><th>Por qué no se esperaba</th></tr></thead><tbody>
${r.sorpresas
  .map((s) =>
    fila([
      esc(s.troza ? codigoDeTroza(s.troza) : s.codigo),
      esc(s.troza?.especieComun ?? "—"),
      esc(s.troza?.gtfNumber ?? "—"),
      esc(motivoDeSorpresa(s)),
    ]),
  )
  .join("")}
</tbody></table>`
    : `<p class="vacio">Ninguna.</p>`;

  const encontradas = r.encontradas.length
    ? `<table><thead><tr><th>Código</th><th>Especie</th><th>Guía</th><th class="num">m³</th><th>Hora</th></tr></thead><tbody>
${r.encontradas
  .map((t) =>
    fila([
      esc(codigoDeTroza(t)),
      esc(t.especieComun ?? "—"),
      esc(t.gtfNumber ?? "—"),
      numero(t.volumenM3),
      esc(formatTime(t.en)),
    ]),
  )
  .join("")}
</tbody></table>`
    : `<p class="vacio">Ninguna.</p>`;

  const body = `
<h1>Acta de conteo del patio</h1>
<p class="sub">${negocio ? `${esc(negocio)} · ` : ""}Conteo físico de trozas con el escáner. No cambia los saldos del libro.</p>
<div class="id">
  <div><span class="k">Empezó:</span> ${esc(fechaHoraDelConteo(c.iniciadoEn))}</div>
  <div><span class="k">Terminó:</span> ${esc(fechaHoraDelConteo(fin))}</div>
  <div><span class="k">Contó:</span> ${esc(c.quien || "—")}</div>
  <div><span class="k">Lo esperado es de:</span> ${esc(fechaHoraDelConteo(c.fotoEn))}</div>
</div>
<div class="tot">
  <div><b>${r.total}</b><span>Esperadas · ${esc(m3(r.m3.esperado))}</span></div>
  <div><b>${r.contadas}</b><span>Encontradas · ${esc(m3(r.m3.encontrado))}</span></div>
  <div><b>${r.faltan.length}</b><span>Faltan · ${esc(m3(r.m3.faltan))}</span></div>
  <div><b>${r.sorpresas.length}</b><span>Sobran</span></div>
</div>
${c.truncado ? `<p class="muted">El patio era más grande de lo que se trajo: algún sobrante puede ser una troza que sí estaba.</p>` : ""}
<h2>Faltan (${r.faltan.length})</h2>
${faltan || `<p class="vacio">No falta ninguna.</p>`}
<h2>Sobran: el libro dice que no están (${r.sorpresas.length})</h2>
${sorpresas}
<h2>Encontradas (${r.contadas})</h2>
${encontradas}
<div class="firma"><div>Contó</div><div>Revisó</div></div>
<p class="foot">Acta generada desde el modo patio. Queda guardada en el libro (pestaña Trozas, «Conteos del patio»); no mueve saldos.</p>`;

  return { title: `Conteo del patio · ${formatDateNumeric(c.iniciadoEn)}`, css: ACTA_CSS, body };
}
