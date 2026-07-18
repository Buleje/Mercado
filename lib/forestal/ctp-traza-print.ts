/**
 * ctp-traza-print — documento imprimible de la cadena de custodia del período.
 *
 * El radar la muestra en pantalla; esto la vuelca a un documento (window.open +
 * print → PDF) para adjuntar a un informe ARFFS o mostrarla en una inspección
 * sin depender de la pantalla. Reconstruye cada cadena despacho ← corrida ← GTF
 * y marca las que tienen huecos (las que una fiscalización observa).
 *
 * Print doc = ventana aparte con estilos propios (hex directos, no tokens del DS
 * — el documento no es UI de la app).
 */

import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export function printCadenaCustodia(g: TrazaGrafo, periodLabel: string): void {
  const ingresoById = new Map(g.ingresos.map((w) => [w.id, w]));
  const corridaById = new Map(g.corridas.map((c) => [c.id, c]));
  const corridaSurtida = new Set(g.consumos.map((c) => c.to));
  const gtfsDeCorrida = (corridaId: string) =>
    g.consumos.filter((c) => c.to === corridaId).map((c) => ingresoById.get(c.from)).filter(Boolean);

  let completos = 0;
  let conHueco = 0;

  const filasDespacho = g.despachos.map((d) => {
    const corridas = g.origenes.filter((o) => o.to === d.id).map((o) => corridaById.get(o.from)).filter(Boolean);
    const completa = corridas.length > 0 && corridas.every((c) => corridaSurtida.has(c!.id));
    if (completa) completos++; else conHueco++;

    const trazas = corridas.length
      ? corridas.map((c) => {
          const gtfs = gtfsDeCorrida(c!.id);
          const gtfTxt = gtfs.length
            ? gtfs.map((w) => `GTF ${esc(w!.gtf)} (${esc(w!.species ?? "—")}, ${w!.volumeM3.toFixed(2)} m³)`).join("; ")
            : `<span class="bad">sin GTF atribuida</span>`;
          return `Corrida #${c!.lineNo} ← ${gtfTxt}`;
        }).join("<br>")
      : `<span class="bad">sin corrida de origen</span>`;

    return `<tr class="${completa ? "" : "row-bad"}">
      <td class="mono">#${d.lineNo}</td>
      <td>${esc(d.label)}</td>
      <td>${esc(d.destino ?? "—")}</td>
      <td class="mono right">${d.quantity || "—"}</td>
      <td>${trazas}</td>
      <td class="right">${completa ? '<span class="ok">Completa</span>' : '<span class="bad">Con hueco</span>'}</td>
    </tr>`;
  }).join("");

  const huerfanas = g.corridas.filter((c) => !corridaSurtida.has(c.id));
  const seccionHuerfanas = huerfanas.length
    ? `<h2>Corridas sin materia prima atribuida (${huerfanas.length})</h2>
       <table><thead><tr><th>#</th><th>Producto</th><th class="right">Cantidad</th></tr></thead>
       <tbody>${huerfanas.map((c) => `<tr class="row-bad"><td class="mono">#${c.lineNo}</td><td>${esc(c.label)}</td><td class="mono right">${c.quantity || "—"} ${esc(c.unit ?? "")}</td></tr>`).join("")}</tbody></table>`
    : "";

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cadena de custodia — ${esc(periodLabel)}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; color: #1f2937; font-size: 12px; line-height: 1.5; }
    h1 { text-align: center; font-size: 18px; letter-spacing: 1.5px; color: #14532d; margin: 0 0 2px; }
    .sub { text-align: center; font-size: 10px; color: #6b7280; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 1px; }
    .cards { display: flex; gap: 10px; margin-bottom: 16px; }
    .card { flex: 1; border: 1.5px solid #d1d5db; border-radius: 8px; padding: 8px 12px; text-align: center; }
    .card .n { font-size: 20px; font-weight: 700; font-family: monospace; }
    .card .l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
    .card.ok { border-color: #14532d; } .card.ok .n { color: #14532d; }
    .card.warn { border-color: #b45309; } .card.warn .n { color: #b45309; }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #14532d; border-bottom: 1.5px solid #14532d; padding-bottom: 4px; margin: 18px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #14532d; border-bottom: 1.5px solid #14532d; padding: 5px 6px; }
    td { padding: 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .mono { font-family: monospace; font-variant-numeric: tabular-nums; }
    .right { text-align: right; }
    .ok { color: #14532d; font-weight: 700; }
    .bad { color: #b91c1c; font-weight: 700; }
    .row-bad { background: #fef2f2; }
    .foot { margin-top: 20px; font-size: 9px; color: #9ca3af; text-align: center; }
  </style></head><body>
    <h1>Cadena de custodia — Centro de Transformación Primaria</h1>
    <p class="sub">Período: ${esc(periodLabel)} · Documento interno de trazabilidad (no reemplaza al LO-CTP oficial SERFOR)</p>
    <div class="cards">
      <div class="card ok"><div class="n">${completos}</div><div class="l">Despachos con cadena completa</div></div>
      <div class="card ${conHueco ? "warn" : ""}"><div class="n">${conHueco}</div><div class="l">Despachos con hueco</div></div>
      <div class="card ${huerfanas.length ? "warn" : ""}"><div class="n">${huerfanas.length}</div><div class="l">Corridas sin materia prima</div></div>
      <div class="card"><div class="n">${g.ingresos.filter((w) => w.cites).length}</div><div class="l">Ingresos CITES</div></div>
    </div>
    <h2>Trazabilidad por despacho (${g.despachos.length})</h2>
    <table>
      <thead><tr><th>#</th><th>Producto</th><th>Destino</th><th class="right">Cant.</th><th>Cadena (corrida ← GTF de origen)</th><th class="right">Estado</th></tr></thead>
      <tbody>${filasDespacho || '<tr><td colspan="6">Sin despachos en el período.</td></tr>'}</tbody>
    </table>
    ${seccionHuerfanas}
    <p class="foot">Generado desde el Libro de Operaciones CTP · Buleje</p>
    <script>setTimeout(function(){ window.print(); }, 400);</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
