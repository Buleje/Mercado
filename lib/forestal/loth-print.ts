"use client";

/**
 * loth-print.ts — Export cliente del Libro LO-TH:
 *  - downloadLothExcel(): descarga el .xlsx del endpoint server (exceljs).
 *  - printLothLibro(): abre una ventana con el libro ENTERO en formato oficial
 *    SERFOR y un botón «Imprimir / Guardar como PDF». No se imprime sola: como
 *    en los reportes del Libro CTP (`openCtpReport`), el libro se ve primero y
 *    la persona decide.
 * Client-safe: sin imports de lib/db ni prisma.
 */
import {
  LOTH_SECTIONS,
  PLAZO_REGISTRO_DIAS,
  diasDeRegistro,
  estaFueraDePlazo,
  type LothSection,
} from "@/lib/forestal/loth-constants";
import { avisoLibroIncompleto, leerLibroEntero, type LibroEntero } from "@/lib/forestal/loth-libro-entero";

export async function downloadLothExcel(): Promise<void> {
  const res = await fetch("/api/admin/forestal/loth/export?format=xlsx", { credentials: "include" });
  if (!res.ok) throw new Error(`Export falló (HTTP ${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `libro-loth-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

type AnyEntry = Record<string, unknown>;
type AnyCaratula = Record<string, unknown> | null;

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: unknown, dp = 4) => (v == null || v === "" ? "—" : Number(v).toFixed(dp));
const fdate = (v: unknown) => {
  if (!v) return "—";
  try { return new Date(v as string).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }); }
  catch { return "—"; }
};
/** Días de registro / fuera de plazo — predicado ÚNICO (loth-constants). */
const lateDays = (e: AnyEntry): number =>
  diasDeRegistro(e.entryDate as string | null, e.createdAt as string | null) ?? 0;
const isLate = (e: AnyEntry): boolean =>
  estaFueraDePlazo(e.entryDate as string | null, e.createdAt as string | null);

const SECTION_TITLE: Record<LothSection, string> = {
  tala: "1 · Tala (volteo)",
  trozado: "2 · Trozado",
  despacho_troza: "3 · Despacho de trozas",
  consumo_troza: "4 · Consumo de trozas",
  producto_terminado: "5 · Producto terminado",
  despacho_producto: "6 · Despacho de producto terminado",
};

const unit = (u: unknown) => (u === "m3" ? "m³" : u === "kg" ? "Kg" : u === "unidad" ? "Unidad" : esc(u));
const sp = (e: AnyEntry) =>
  `${esc(e.speciesCommon ?? "—")}${e.speciesScientific ? `<br><i style="color:#6b7280">${esc(e.speciesScientific)}</i>` : ""}${e.cites ? ` <b style="color:#b91c1c">CITES</b>` : ""}`;

type PCol = { h: string; align?: "right"; cell: (e: AnyEntry) => string };
const SECTION_COLS: Record<LothSection, PCol[]> = {
  tala: [
    { h: "Cód. árbol", cell: (e) => `<b>${esc(e.treeCode ?? "—")}</b>${e.isRama ? " (R)" : ""}` },
    { h: "Especie", cell: sp },
    { h: "Ø may", align: "right", cell: (e) => n(e.diamMayorM, 2) },
    { h: "Ø men", align: "right", cell: (e) => n(e.diamMenorM, 2) },
    { h: "Long.", align: "right", cell: (e) => n(e.lengthM, 2) },
    { h: "Vol. m³", align: "right", cell: (e) => `<b>${n(e.volumeM3)}</b>` },
  ],
  trozado: [
    { h: "Cód. troza", cell: (e) => `<b>${esc(e.trozaCode ?? "—")}</b>${e.isRama ? " (R)" : ""}` },
    { h: "Especie", cell: sp },
    { h: "Ø may", align: "right", cell: (e) => n(e.diamMayorM, 2) },
    { h: "Ø men", align: "right", cell: (e) => n(e.diamMenorM, 2) },
    { h: "Long.", align: "right", cell: (e) => n(e.lengthM, 2) },
    { h: "Vol. m³", align: "right", cell: (e) => `<b>${n(e.volumeM3)}</b>` },
  ],
  despacho_troza: [
    { h: "Cód. troza", cell: (e) => `<b>${esc(e.trozaCode ?? "—")}</b>` },
    { h: "Cód. despacho", cell: (e) => esc(e.despachoCode ?? "—") },
    { h: "N° GTF", cell: (e) => `<b>${esc(e.gtfNumber ?? "—")}</b>` },
  ],
  consumo_troza: [
    { h: "Cód. troza", cell: (e) => `<b>${esc(e.trozaCode ?? "—")}</b>` },
    { h: "Especie", cell: sp },
    { h: "Vol. m³", align: "right", cell: (e) => `<b>${n(e.volumeM3)}</b>` },
    { h: "C. interno", cell: (e) => (e.consumoInterno ? "SÍ" : "") },
  ],
  producto_terminado: [
    { h: "Producto", cell: (e) => `<b>${esc(e.productType ?? "—")}</b>` },
    { h: "Especie", cell: sp },
    { h: "Cantidad", align: "right", cell: (e) => n(e.quantity) },
    { h: "Unidad", cell: (e) => unit(e.unit) },
  ],
  despacho_producto: [
    { h: "N° GTF", cell: (e) => `<b>${esc(e.gtfNumber ?? "—")}</b>` },
    { h: "Producto", cell: (e) => esc(e.productType ?? "—") },
    { h: "Especie", cell: sp },
    { h: "Piezas", align: "right", cell: (e) => esc(e.pieces ?? "—") },
    { h: "Cantidad", align: "right", cell: (e) => n(e.quantity) },
    { h: "Unidad", cell: (e) => unit(e.unit) },
  ],
};

const CARATULA_FIELDS: [string, string][] = [
  ["registroNumber", "N° Registro (ARFFS)"], ["tomo", "N° Tomo"], ["tituloHabilitante", "N° Título Habilitante"],
  ["ruc", "RUC"], ["dni", "DNI"], ["representanteLegal", "Rep. legal"],
  ["domicilio", "Domicilio"], ["departamento", "Departamento"], ["provincia", "Provincia"], ["distrito", "Distrito"],
  ["telefono", "Teléfono"], ["email", "Correo"], ["docGestionType", "Doc. gestión"], ["resolucionNumber", "N° Resolución"],
];

function sectionTable(section: LothSection, entries: AnyEntry[]): string {
  const cols = SECTION_COLS[section];
  const rows = entries.filter((e) => e.section === section);
  const body = rows.length === 0
    ? `<tr><td colspan="${cols.length + 4}" class="empty">Sin registros.</td></tr>`
    : rows.map((e) => {
        const annulled = e.status === "anulado";
        const late = isLate(e);
        const cls = annulled ? ' class="annul"' : late ? ' class="late"' : "";
        const obs = [
          e.discarded ? "descartado" : "",
          annulled ? `ANULADO — ${esc(e.annulledReason ?? "")}` : "",
          esc(e.observations ?? ""),
          late && !annulled ? `<b style="color:#b45309">registro +${lateDays(e)}d</b>` : "",
        ].filter(Boolean).join(" · ");
        return `<tr${cls}>
          <td class="r">${esc(e.lineNo)}</td>
          <td>${fdate(e.entryDate)}</td>
          <td>${fdate(e.createdAt)}</td>
          ${cols.map((c) => `<td class="${c.align === "right" ? "r" : ""}">${c.cell(e)}</td>`).join("")}
          <td class="obs">${obs}</td>
        </tr>`;
      }).join("");
  return `<h2>${SECTION_TITLE[section]} <span class="cnt">${rows.length} línea(s)</span></h2>
    <table>
      <thead><tr>
        <th class="r">N°</th><th>Fecha actividad</th><th>Fecha registro</th>
        ${cols.map((c) => `<th class="${c.align === "right" ? "r" : ""}">${c.h}</th>`).join("")}
        <th>Observaciones</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function caratulaBlock(c: AnyCaratula): string {
  const titular = esc(c?.titularName ?? "—");
  const cells = CARATULA_FIELDS
    .filter(([k]) => c?.[k])
    .map(([k, label]) => `<div><span>${label}</span><b>${esc(c?.[k])}</b></div>`)
    .join("");
  return `<div class="caratula">
    <div class="cara-title">${titular}</div>
    <div class="cara-grid">${cells || '<div class="muted">Carátula sin configurar — completa los datos del titular en el módulo.</div>'}</div>
  </div>`;
}

/** Una página del libro, por la misma ruta que usa la pantalla. */
async function leerPaginaDelLibro(offset: number, limit: number): Promise<{ entries: AnyEntry[]; total: number }> {
  const r = await fetch(`/api/admin/forestal/loth?limit=${limit}&offset=${offset}&includeAnnulled=1`, { credentials: "include" });
  if (!r.ok) throw new Error(`No se pudo cargar el libro (HTTP ${r.status})`);
  const j = (await r.json()) as { entries?: AnyEntry[]; total?: number };
  const entries = j.entries ?? [];
  return { entries, total: Number(j.total ?? entries.length) };
}

/**
 * Abre el Libro LO-TH ENTERO en una ventana, listo para imprimir.
 *
 * Antes pedía `limit=500` y un libro de 650 líneas se imprimía con 500 — el
 * papel que se declara ante SERFOR salía incompleto sin decirlo. Ahora lee
 * todas las páginas; si alguna vez choca con el tope de seguridad, el impreso
 * lo dice arriba («Se muestran N de M»).
 *
 * La ventana se abre en el MISMO clic, antes de esperar al servidor: después de
 * un `await` el navegador la trata como pop-up y la bloquea (ADR-436). Por eso
 * esto se llama sin `await` previo en el manejador del botón.
 */
export async function printLothLibro(opts: { ventana?: Window | null } = {}): Promise<void> {
  const w = opts.ventana ?? window.open("", "_blank", "width=1100,height=800");
  if (!w) throw new Error("El navegador bloqueó la ventana de impresión. Permite pop-ups para este sitio.");
  w.document.write(
    '<!doctype html><meta charset="utf-8"><title>Generando el libro…</title><p style="font:16px system-ui;padding:24px">Generando el libro…</p>',
  );

  let libro: LibroEntero<AnyEntry>;
  let caratula: AnyCaratula;
  try {
    const [l, caratulaRes] = await Promise.all([
      leerLibroEntero<AnyEntry>(leerPaginaDelLibro),
      fetch("/api/admin/forestal/loth/caratula", { credentials: "include" }),
    ]);
    libro = l;
    caratula = caratulaRes.ok ? (await caratulaRes.json()).active ?? null : null;
  } catch (err) {
    w.close();
    throw err;
  }
  const entries = libro.entries;
  const incompleto = avisoLibroIncompleto({ mostradas: entries.length, total: libro.total });
  const now = new Date().toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" });

  const sections = LOTH_SECTIONS.map((s) => sectionTable(s, entries)).join("");
  /* Sin script en el documento (defensa en profundidad, igual que
     `openCtpReport`): cada campo pasa por `esc()`, y con esta CSP un olvido no
     se vuelve XSS con la sesión del admin. El botón se ata desde afuera. */
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https:; font-src data:";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Libro LO-TH${caratula?.titularName ? ` — ${esc(caratula.titularName)}` : ""}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111827; margin: 0; font-size: 11px; }
    .doc-head { border-bottom: 3px solid #14532d; padding-bottom: 8px; margin-bottom: 12px; }
    .doc-head h1 { font-size: 18px; margin: 0 0 2px; color: #14532d; }
    .doc-head .sub { color: #6b7280; font-size: 10px; }
    .caratula { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
    .cara-title { font-weight: 800; font-size: 14px; margin-bottom: 6px; }
    .cara-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 16px; }
    .cara-grid div { font-size: 10px; }
    .cara-grid span { color: #6b7280; display: block; }
    .cara-grid b { color: #111827; }
    .muted { color: #9ca3af; grid-column: 1 / -1; }
    h2 { font-size: 13px; color: #14532d; margin: 16px 0 4px; page-break-after: avoid; }
    h2 .cnt { font-size: 10px; font-weight: 400; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; page-break-inside: auto; }
    th { background: #14532d; color: #fff; font-size: 10px; text-align: left; padding: 5px 6px; }
    td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; vertical-align: top; }
    .r { text-align: right; font-variant-numeric: tabular-nums; }
    .obs { color: #6b7280; font-size: 9px; }
    .empty { color: #9ca3af; font-style: italic; text-align: center; padding: 10px; }
    tr.annul td { color: #9ca3af; text-decoration: line-through; }
    tr.late td { background: #fffbeb; }
    .foot { margin-top: 24px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; page-break-inside: avoid; }
    .sign { border-top: 1px solid #111827; padding-top: 4px; text-align: center; font-size: 10px; }
    .legal { margin-top: 16px; font-size: 9px; color: #6b7280; border-top: 1px dashed #d1d5db; padding-top: 6px; }
    .incompleto { border: 2px solid #b91c1c; background: #fef2f2; color: #991b1b; font-weight: 700; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 12px; }
    .print-bar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: flex-end; gap: 8px; padding: 8px 0; margin: 0 0 6px; background: #fff; }
    .print-bar button { cursor: pointer; border: 0; border-radius: 8px; padding: 9px 16px; font: 700 13px system-ui, sans-serif; background: #14532d; color: #fff; }
    @media print { .noprint, .print-bar { display: none; } }
  </style></head><body>
    <div class="print-bar"><button type="button" id="loth-print">Imprimir / Guardar como PDF</button></div>
    <div class="doc-head">
      <h1>Libro de Operaciones — Títulos Habilitantes</h1>
      <div class="sub">RDE N° 264-2019-MINAGRI-SERFOR-DE · Generado ${esc(now)} · Sistema Buleje</div>
    </div>
    ${incompleto ? `<div class="incompleto" data-libro-incompleto>${esc(incompleto)}</div>` : ""}
    ${caratulaBlock(caratula)}
    ${sections}
    <div class="foot">
      <div class="sign">Titular / Representante legal</div>
      <div class="sign">Regente forestal</div>
      <div class="sign">ARFFS (visto)</div>
    </div>
    <div class="legal">
      Declaro bajo juramento que la información registrada en el presente libro es veraz y corresponde a las
      operaciones efectivamente realizadas. Las líneas tachadas corresponden a subsanaciones (no se eliminan registros).
      Las filas resaltadas en ámbar indican registro fuera del plazo de ${PLAZO_REGISTRO_DIAS} días.
    </div>
  </body></html>`;

  w.document.open(); // reemplaza el «Generando el libro…»
  w.document.write(html);
  w.document.close();
  w.document.getElementById("loth-print")?.addEventListener("click", () => w.print());
  w.focus();
}
