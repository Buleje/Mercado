/**
 * cotizacion-print — PDF profesional de una cotización (presupuesto) para el
 * cliente. Reemplaza el `window.print()` que imprimía TODO el panel admin por
 * un documento limpio, branded y auto-contenido (ventana nueva, sin auto-print
 * para no colgar en automatización — misma lección que los reportes forestales).
 */

export interface CotizacionPrintItem {
  descripcion: string;
  cantidad: number;
  precioUnit: number;
  descuento: number;
  subtotal: number;
}
export interface CotizacionPrintData {
  // El backend serializa `numero` (string ya formateado, ej. "Buleje-COT-0001");
  // el tipo del módulo declara `número` (legacy). Aceptamos ambos y derivamos.
  numero?: string | number;
  número?: string | number;
  clienteNombre: string;
  clienteRuc?: string;
  subtotal: number;
  igv: number;
  total: number;
  validoHasta: string;
  notas?: string;
  items: CotizacionPrintItem[];
  createdAt: string;
}
export interface EmpresaEmisor {
  razonSocial: string;
  ruc: string;
  direccionFiscal: string | null;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const money = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
};

export function printCotizacion(cot: CotizacionPrintData, empresa: EmpresaEmisor | null): void {
  // `numero` del backend ya viene formateado (string); un número legacy se
  // formatea como COT-NNNN. Sin dato → "COTIZACIÓN".
  const raw = cot.numero ?? cot.número;
  const num =
    typeof raw === "string" && raw.trim()
      ? raw.trim()
      : typeof raw === "number"
        ? `COT-${String(raw).padStart(4, "0")}`
        : "COTIZACIÓN";
  const rows = cot.items
    .map(
      (it) => `<tr>
      <td>${esc(it.descripcion)}</td>
      <td class="r">${it.cantidad}</td>
      <td class="r">S/ ${money(it.precioUnit)}</td>
      <td class="r">${it.descuento > 0 ? `S/ ${money(it.descuento)}` : "—"}</td>
      <td class="r"><b>S/ ${money(it.subtotal)}</b></td>
    </tr>`,
    )
    .join("");
  const empresaBlock = empresa
    ? `<div><div class="empname">${esc(empresa.razonSocial)}</div><div class="empmeta">RUC ${esc(empresa.ruc)}${empresa.direccionFiscal ? ` · ${esc(empresa.direccionFiscal)}` : ""}</div></div>`
    : `<div><div class="empname">Presupuesto</div></div>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${num}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:32px;font-size:12px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #00A0A0;padding-bottom:14px}
    .empname{font-size:18px;font-weight:800;color:#007F7F} .empmeta{color:#555;font-size:11px;margin-top:2px}
    .doc{text-align:right} .doctitle{font-size:20px;font-weight:800;letter-spacing:1px;color:#111}
    .docnum{font-family:monospace;color:#007F7F;font-weight:700} .docmeta{color:#555;font-size:11px;margin-top:4px}
    .cli{margin-top:16px;background:#f6fafa;border:1px solid #d6eaea;border-radius:8px;padding:12px}
    .cli .k{color:#666;font-size:10px;text-transform:uppercase;letter-spacing:.5px} .cli .v{font-weight:700;font-size:14px}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:11px}
    th,td{border:1px solid #ddd;padding:7px 9px} th{background:#eef7f7;text-align:left;color:#007F7F} td.r,th.r{text-align:right}
    .tot{margin-top:12px;margin-left:auto;width:280px} .tot td{border:none;padding:3px 9px}
    .tot .totrow td{font-size:15px;font-weight:800;border-top:2px solid #00A0A0;padding-top:8px}
    .notas{margin-top:16px;font-size:11px;color:#444;background:#fafafa;border-left:3px solid #00A0A0;padding:8px 12px}
    .firma{margin-top:44px;display:flex;justify-content:space-between}
    .firma div{border-top:1px solid #999;padding-top:4px;width:210px;text-align:center;font-size:10px;color:#555}
    .foot{margin-top:24px;color:#888;font-size:10px;border-top:1px solid #eee;padding-top:10px}
    .btn{position:fixed;top:12px;right:12px;background:#00A0A0;color:#fff;border:0;padding:8px 14px;border-radius:6px;font-weight:700;cursor:pointer}
    @media print{.btn{display:none}}
  </style></head><body>
  <button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button>
  <div class="top">
    ${empresaBlock}
    <div class="doc"><div class="doctitle">COTIZACIÓN</div><div class="docnum">${num}</div>
      <div class="docmeta">Emitida: ${fecha(cot.createdAt)}<br>Válida hasta: <b>${fecha(cot.validoHasta)}</b></div>
    </div>
  </div>
  <div class="cli"><div class="k">Cliente</div><div class="v">${esc(cot.clienteNombre)}</div>${cot.clienteRuc ? `<div class="empmeta">RUC ${esc(cot.clienteRuc)}</div>` : ""}</div>
  <table><thead><tr><th>Descripción</th><th class="r">Cant.</th><th class="r">P. Unit.</th><th class="r">Desc.</th><th class="r">Subtotal</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#999">Sin ítems</td></tr>'}</tbody></table>
  <table class="tot"><tbody>
    <tr><td>Subtotal</td><td class="r">S/ ${money(cot.subtotal)}</td></tr>
    <tr><td>IGV (18%)</td><td class="r">S/ ${money(cot.igv)}</td></tr>
    <tr class="totrow"><td>TOTAL</td><td class="r">S/ ${money(cot.total)}</td></tr>
  </tbody></table>
  ${cot.notas ? `<div class="notas"><b>Notas:</b> ${esc(cot.notas)}</div>` : ""}
  <div class="firma"><div>Aceptación del cliente</div><div>${empresa ? esc(empresa.razonSocial) : "Emisor"}</div></div>
  <div class="foot">Documento de cotización — no es comprobante de pago. Precios en soles (S/), IGV incluido. Válida hasta la fecha indicada.</div>
  </body></html>`;

  const w = window.open("", "_blank", "width=880,height=1000");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
