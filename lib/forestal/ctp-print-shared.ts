"use client";

/**
 * ctp-print-shared — primitivos comunes de los REPORTES imprimibles del CTP
 * (Cumplimiento, Existencias, …). Single source para no re-tipear el escape, la
 * ventana de print, el bloque de identidad y el CSS base en cada reporte.
 *
 * Los tokens `--data-*` del DS NO resuelven en la ventana de print → los colores
 * de los reportes van en HEX. El patrón de ventana (open + document.write +
 * window.print) es el mismo que `planta-plano-print.ts`.
 */

import { GEO_PLACENAME } from "@/lib/geo";

/** Identidad del CTP (subconjunto de `CtpFicha`) para el encabezado del reporte. */
export interface CtpReportFicha {
  razonSocial?: string;
  ruc?: string;
  nombreCtp?: string;
  codigoCtp?: string;
  registroArffs?: string;
  direccion?: string;
  region?: string;
  provincia?: string;
  distrito?: string;
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Fila "etiqueta: valor" del bloque de identidad; se omite si el valor está vacío. */
export function idRow(label: string, value?: string): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  return `<div><span class="k">${esc(label)}</span> ${esc(v)}</div>`;
}

/**
 * Bloque de identidad del CTP (razón social, RUC, código, registro, ubicación) +
 * las filas extra que cada reporte quiera anexar (ej. "Ingresos evaluados").
 */
export function ctpIdentityBlock(ficha: CtpReportFicha | null | undefined, extraRows: string[] = []): string {
  const f = ficha ?? {};
  const ubic = [f.distrito, f.provincia, f.region].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
  const rows = [
    idRow("Razón social:", f.razonSocial) || idRow("Establecimiento:", GEO_PLACENAME),
    idRow("RUC:", f.ruc),
    idRow("Nombre del CTP:", f.nombreCtp),
    idRow("Código de CTP:", f.codigoCtp),
    idRow("Registro ARFFS:", f.registroArffs),
    idRow("Ubicación:", ubic),
    idRow("Dirección:", f.direccion),
    ...extraRows,
  ].filter(Boolean);
  return `<div class="id">${rows.join("")}</div>`;
}

/** Firma (Responsable CTP / Sello ARFFS) + nota legal al pie del reporte. */
export function ctpReportFooter(note: string): string {
  return `<div class="firma"><div>Responsable del CTP</div><div>Sello y recepción ARFFS</div></div>
  <p class="foot">${esc(note)}</p>`;
}

/** CSS base compartido por todos los reportes (identidad, tablas, firma, pie). */
export const CTP_REPORT_BASE_CSS = `
  *{box-sizing:border-box} body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a1a;max-width:900px;margin:0 auto;padding:32px;font-size:13px;line-height:1.5}
  h1{font-size:20px;margin:0 0 2px;color:#0f5132} h2{font-size:13px;text-transform:uppercase;letter-spacing:.4px;color:#555;margin:22px 0 8px;border-bottom:1px solid #eee;padding-bottom:4px}
  .sub{color:#666;font-size:12px;margin:0 0 14px}
  .id{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px;background:#f6f8f7;border:1px solid #e4e8e6;border-radius:8px;padding:12px 14px;font-size:12px}
  .id .k{color:#888;display:inline-block;min-width:118px}
  table{width:100%;border-collapse:collapse;margin-top:6px} th,td{padding:7px 9px;border:1px solid #e0e0e0;text-align:left;vertical-align:top}
  th{background:#f6f8f7;font-size:11px;text-transform:uppercase;letter-spacing:.3px;color:#444}
  .num{text-align:right;font-variant-numeric:tabular-nums} .neg{color:#b91c1c;font-weight:700}
  .badge{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px;white-space:nowrap}
  .muted{color:#666;font-size:11.5px;margin-top:3px}
  .firma{display:flex;justify-content:space-between;margin-top:44px;font-size:12px} .firma div{border-top:1px solid #999;padding-top:6px;width:44%;text-align:center;color:#555}
  .foot{margin-top:22px;color:#999;font-size:10.5px;border-top:1px solid #eee;padding-top:10px}
  @media print{body{padding:12px} h2{page-break-after:avoid} tr{page-break-inside:avoid}}
`;

/**
 * Abre el reporte en una ventana imprimible (guardar como PDF). Inyecta el CSS
 * base + el CSS específico del reporte y dispara `window.print()`.
 */
export function openCtpReport(opts: { title: string; css?: string; body: string }): void {
  // Barra con botón de impresión en vez de auto-disparar `window.print()`: el
  // auto-print bloqueaba la ventana en entornos sin manejador de diálogo (headless/
  // automatización) y sorprendía al usuario. Ahora el reporte se ve primero y el
  // usuario decide imprimir/guardar PDF. La barra se oculta al imprimir.
  const barCss = `
    .print-bar{position:sticky;top:0;z-index:10;display:flex;justify-content:flex-end;gap:8px;padding:8px 0;margin:-8px 0 6px;background:#fff}
    .print-bar button{cursor:pointer;border:0;border-radius:8px;padding:9px 16px;font:700 13px system-ui;background:#0f5132;color:#fff}
    @media print{.print-bar{display:none}}
  `;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>${CTP_REPORT_BASE_CSS}${barCss}${opts.css ?? ""}</style></head><body>
<div class="print-bar"><button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button></div>
${opts.body}
</body></html>`;
  const w = window.open("", "_blank", "width=980,height=760");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para descargar el reporte.");
  w.document.write(html);
  w.document.close();
  w.focus();
}
