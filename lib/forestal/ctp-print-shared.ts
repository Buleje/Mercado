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
  /** Jefe / representante legal del titular (comunidad, empresa) ante SERFOR. */
  representante?: string;
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

/**
 * CSS base compartido por todos los reportes (identidad, tablas, firma, pie).
 *
 * Rediseño 2026-08-20 (Brandon: "el formato de los documentos está feo... los
 * subtítulos con esas letras alargadas se ven feos"): los `h2` y `th` en
 * mayúscula + letter-spacing —el "eyebrow" típico de dashboard— se leen
 * estirados en un papel que se presenta ante una autoridad. Se sacó el
 * `text-transform:uppercase` de los títulos de sección (quedan en el case que
 * ya trae el HTML: "Anexos", "Base legal") y se subió el tamaño/peso para que
 * la jerarquía se note por PESO, no por mayúscula angosta. Las cabeceras de
 * TABLA sí quedan en mayúscula (es la convención universal de una columna,
 * no un subtítulo) pero más chicas y con más aire.
 *
 * Ronda 2 — "marco elegante" (mismo día, Brandon: "bordes elegantes y
 * personalizados de la empresa... que no se vea genérico o feo"): la hoja era
 * texto plano sin borde propio — cualquier carta de Word se le parecía. Ahora
 * el documento entero vive dentro de un marco propio (borde + esquinas suaves
 * en pantalla), cada `h2` lleva una marca de color al costado en vez de
 * apoyarse sólo en el peso, y el bloque de identidad (`.id`) gana un lomo de
 * color como una ficha, no una caja gris genérica. El marco es sólo `border`
 * (nunca `position:fixed`): es lo único que se comporta bien en los TRES
 * caminos de render —`window.print()`, el iframe de preview, y el recorte a
 * PNG de `tramites-documento-pdf.ts` (que fotografía el `<body>` entero y lo
 * corta por alto fijo)— así el lado izq/der se repite solo en cada página y
 * el cierre inferior cae justo donde el documento realmente termina.
 * `print-color-adjust:exact` fuerza que esos acentos de color salgan también
 * en el PDF/papel real, no sólo en la pantalla (por defecto Chrome los omite
 * al imprimir salvo que el usuario tilde "gráficos de fondo").
 */
export const CTP_REPORT_BASE_CSS = `
  *{box-sizing:border-box}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1f2421;max-width:900px;margin:0 auto;padding:44px 48px;font-size:13.5px;line-height:1.62;border:1px solid #dbe6df;border-radius:18px}
  @media screen{body{box-shadow:0 1px 2px rgba(15,35,25,.05),0 14px 32px rgba(15,35,25,.07)}}
  h1{font-size:23px;font-weight:800;margin:0 0 3px;color:#0f5132;letter-spacing:-.3px}
  h2{display:flex;align-items:center;gap:9px;font-size:15.5px;font-weight:800;color:#0f5132;margin:28px 0 11px;padding-bottom:7px;border-bottom:2px solid #dfeae4}
  h2::before{content:"";flex-shrink:0;width:4px;height:14px;border-radius:2px;background:#0f5132}
  .sub{color:#5c6864;font-size:12.5px;margin:0 0 16px}
  .id{display:grid;grid-template-columns:1fr 1fr;gap:5px 22px;background:#f5f8f6;border:1px solid #e2e9e5;border-left:4px solid #0f5132;border-radius:4px 10px 10px 4px;padding:15px 19px;font-size:12.5px}
  .id .k{color:#7a8580;display:inline-block;min-width:120px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:8px 10px;border:1px solid #e2e9e5;text-align:left;vertical-align:top}
  th{background:#eef4f0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.25px;color:#3d4a43;border-bottom:2px solid #cfe0d7}
  tbody tr:nth-child(even) td{background:#fafbfa}
  .num{text-align:right;font-variant-numeric:tabular-nums} .neg{color:#b91c1c;font-weight:700}
  .badge{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px;white-space:nowrap}
  .muted{color:#666;font-size:11.5px;margin-top:3px}
  .firma{display:flex;justify-content:space-between;margin-top:50px;font-size:12px} .firma div{border-top:1.5px solid #9aa39e;padding-top:7px;width:44%;text-align:center;color:#555}
  .foot{margin-top:26px;color:#94a19b;font-size:10.5px;border-top:1px solid #eef2f0;padding-top:11px}
  @media print{body{padding:22px 26px;border-radius:0} h2{page-break-after:avoid} tr{page-break-inside:avoid}}
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
