/**
 * cubicador-export.ts — exporta el lote cubicado a PDF (jsPDF + autotable) y
 * Excel (.xlsx, exceljs). Client-only con imports dinámicos (fuera del bundle
 * inicial). PURO respecto a UI: recibe filas + opciones, devuelve/descarga.
 */
import type { Workbook, Worksheet } from "exceljs";
import type { PiezaCubicada } from "./cubicacion";
import { PT_POR_M3, toInches, toFeet } from "./cubicacion";
import type { TipoComercial } from "./cubicacion-tipo";
import { tipoDePieza, ordenTipo } from "./cubicacion-tipo";
import type { PrecioPt, ResumenLote } from "./cubicacion-resumen";
import { agruparPor } from "./cubicacion-resumen";
import type { DatosLiquidacion, Liquidacion } from "./cubicacion-liquidacion";
import { fechaLarga } from "./cubicacion-liquidacion";
import type { ApartadosAsignados, NombresApartado } from "./cubicacion-apartados";
import { resumenApartados, etiquetaApartado } from "./cubicacion-apartados";
import { fmtM3 } from "./cubicacion-formato";

export interface ExportOpts {
  precioPt: number;      // S/ por pie tablar (0 = sin precio)
  especieGlobal?: string;
  /** Precio por pieza (para precio por especie). Si falta, se usa precioPt. */
  precioDe?: (r: PiezaCubicada) => number;
  /**
   * Apartados asignados (función EXTRA, ver `cubicacion-apartados.ts`). Si
   * viene con algo adentro, el PDF y el Excel suman una columna "Apartado" y
   * el Excel agrega una hoja "Por apartado". Ausente o vacío = el lote no
   * usa apartados; no se inventa una columna vacía.
   */
  asignados?: ApartadosAsignados;
  /** Nombres puestos a mano por apartado ("Camión A"). Sin esto, la columna
   *  y la hoja igual salen — sólo con "Apartado N" pelado. */
  nombresApartado?: NombresApartado;
}

/** Precio por PT de una pieza: resolver por especie si existe, si no el global. */
const precioPieza = (r: PiezaCubicada, opts: ExportOpts) => opts.precioDe?.(r) ?? opts.precioPt;
/** Hay valores que mostrar si el global > 0 o algún resolver da > 0. */
const tieneValor = (rows: PiezaCubicada[], opts: ExportOpts) =>
  opts.precioPt > 0 || rows.some((r) => precioPieza(r, opts) > 0);
/** Etiqueta del apartado de una pieza, o "—" si está pendiente. */
const apartadoTxt = (r: PiezaCubicada, opts: ExportOpts) => {
  const n = opts.asignados?.[r.id];
  return n != null ? etiquetaApartado(n, opts.nombresApartado ?? {}) : "—";
};
const conApartados = (opts: ExportOpts) => Object.keys(opts.asignados ?? {}).length > 0;
/** El lote asignó dueño a algo — igual criterio que apartados: sin uso, sin columna/hoja de más. */
const conDueno = (rows: PiezaCubicada[]) => rows.some((r) => r.dueno?.trim());

const fecha = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

function totales(rows: PiezaCubicada[]) {
  return {
    piezas: rows.reduce((a, r) => a + r.cantidad, 0),
    pt: r2(rows.reduce((a, r) => a + r.pieTablar, 0)),
    m3: Math.round(rows.reduce((a, r) => a + r.m3, 0) * 10000) / 10000,
  };
}

// ─── Agrupación por tipo (single source para el detalle de PDF y Excel) ──────
interface SubTot { piezas: number; pt: number; m3: number; valor: number; }
interface GrupoDetalle { tipo: TipoComercial; piezas: PiezaCubicada[]; sub: SubTot; }

/** Precio como resolver único (por especie si existe, si no el global). */
const precioResolver = (opts: ExportOpts): PrecioPt => opts.precioDe ?? opts.precioPt;

/**
 * Ordena las piezas por tipo comercial (comercial primero, orden canónico) y las
 * agrupa con su subtotal, conservando el orden de carga dentro de cada tipo.
 */
function agruparDetallePorTipo(rows: PiezaCubicada[], opts: ExportOpts): { grupos: GrupoDetalle[]; total: SubTot } {
  const orden = rows
    .map((r, i) => ({ r, tipo: tipoDePieza(r), i }))
    .sort((a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo) || a.i - b.i);
  const grupos: GrupoDetalle[] = [];
  const total: SubTot = { piezas: 0, pt: 0, m3: 0, valor: 0 };
  for (const { r, tipo } of orden) {
    let g = grupos[grupos.length - 1];
    if (!g || g.tipo !== tipo) { g = { tipo, piezas: [], sub: { piezas: 0, pt: 0, m3: 0, valor: 0 } }; grupos.push(g); }
    const valor = r.pieTablar * precioPieza(r, opts);
    g.piezas.push(r);
    g.sub.piezas += r.cantidad; g.sub.pt += r.pieTablar; g.sub.m3 += r.m3; g.sub.valor += valor;
    total.piezas += r.cantidad; total.pt += r.pieTablar; total.m3 += r.m3; total.valor += valor;
  }
  return { grupos, total };
}

/** Medidas en unidad de comercio: espesor/ancho en pulgadas, largo en pies. */
const espPulg = (v: number, u: PiezaCubicada["uEspesor"]) => r2(toInches(v, u));
const larPies = (v: number, u: PiezaCubicada["uLargo"]) => r2(toFeet(v, u));

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * PDF: título + tabla del lote ORDENADA por tipo (N° · medidas · tipo · especie ·
 * PT · m³ · valor) con subtotal por tipo y total general.
 */
export async function exportarPDF(rows: PiezaCubicada[], opts: ExportOpts): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const t = totales(rows);
  const conPrecio = tieneValor(rows, opts);
  const totalValor = rows.reduce((a, r) => a + r.pieTablar * precioPieza(r, opts), 0);
  const precioTxt = opts.precioDe ? "por especie" : `S/ ${opts.precioPt.toFixed(2)}/PT`;
  const { grupos } = agruparDetallePorTipo(rows, opts);

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Cubicación de madera", 40, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110);
  doc.text(`Fecha: ${fecha()}${opts.especieGlobal ? ` · Especie: ${opts.especieGlobal}` : ""}${conPrecio ? ` · Precio: ${precioTxt}` : ""}`, 40, 62);

  const val = (v: number) => (conPrecio ? [v.toFixed(2)] : []);
  // Apartado (función EXTRA): sólo aparece la columna si el lote tiene algo
  // asignado — un lote que nunca separó en bloques no gana una columna de "—".
  const conAp = conApartados(opts);
  const apCol = (r: PiezaCubicada) => (conAp ? [apartadoTxt(r, opts)] : []);
  const apColVacia = () => (conAp ? [""] : []);
  const iNum = conAp ? 8 : 7; // dónde caen PT/m³/Valor según haya o no columna Apartado
  const head = [['N°', 'Cant.', 'Esp. "', 'Anc. "', "Largo '", "Tipo", "Especie", ...(conAp ? ["Apartado"] : []), "Pie tablar", "m³", ...(conPrecio ? ["Valor S/"] : [])]];
  const body: (string | number)[][] = [];
  const subtotalRows = new Set<number>();
  let n = 0;
  for (const g of grupos) {
    for (const r of g.piezas) {
      body.push([
        String(++n), String(r.cantidad),
        String(espPulg(r.espesor, r.uEspesor)), String(espPulg(r.ancho, r.uAncho)), String(larPies(r.largo, r.uLargo)),
        g.tipo, r.especie ?? "—", ...apCol(r),
        r.pieTablar.toFixed(2), fmtM3(r.m3), ...val(r.pieTablar * precioPieza(r, opts)),
      ]);
    }
    subtotalRows.add(body.length);
    body.push(["", String(g.sub.piezas), "", "", "", `Subtotal ${g.tipo}`, "", ...apColVacia(), r2(g.sub.pt).toFixed(2), fmtM3(r4(g.sub.m3)), ...val(r2(g.sub.valor))]);
  }
  const foot = [["", String(t.piezas), "", "", "", "TOTAL GENERAL", "", ...apColVacia(), `${t.pt.toFixed(2)} PT`, fmtM3(t.m3), ...val(r2(totalValor))]];

  autoTable(doc, {
    head, body, foot,
    startY: 78,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [0, 128, 96], textColor: 255 },
    footStyles: { fillColor: [0, 128, 96], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center" }, 1: { halign: "center" },
      2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
      [iNum]: { halign: "right" }, [iNum + 1]: { halign: "right" }, [iNum + 2]: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && subtotalRows.has(data.row.index)) {
        data.cell.styles.fillColor = [230, 244, 240];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`1 m³ = ${PT_POR_M3} pie tablar · medidas en pulgadas y pies · generado por el cubicador de Buleje.`, 40, y + 20);

  doc.save(`cubicacion-${fecha()}.pdf`);
}

/** Letra de columna por índice (0→A, 1→B…) — alcanza para esta plantilla (< 26). */
const colLetra = (i: number) => String.fromCharCode(65 + i);

/**
 * Resumen en vivo, un par de columnas al lado de los datos: piezas, pie
 * tablar, m³ y especies distintas, todo por FÓRMULA — se actualiza solo
 * mientras se llenan las filas, sin abrir la app. Es una referencia de lo
 * que se va a importar, no lo que se importa (eso lo recalcula el parser).
 * Asume espesor/ancho en pulgadas y largo en pies — el default de la
 * plantilla; si se agregan columnas de unidad, el resumen no las contempla.
 */
function agregarResumenEnVivo(ws: Worksheet, headers: string[]) {
  const buscar = (patron: RegExp) => headers.findIndex((h) => patron.test(h));
  const idxEspesor = buscar(/espesor/i);
  const idxAncho = buscar(/ancho/i);
  const idxLargo = buscar(/largo/i);
  if (idxEspesor < 0 || idxAncho < 0 || idxLargo < 0) return; // headers no trae las columnas base: no se arma el resumen
  const idxCantidad = buscar(/cantidad/i);
  const idxEspecie = buscar(/especie/i);

  const FIN = 1000; // cubre un día grueso de carga (ver `celdas-excel.tsx`: "cientos de piezas por día")
  const rango = (i: number) => `${colLetra(i)}2:${colLetra(i)}${FIN}`;
  const rEsp = rango(idxEspesor), rAnc = rango(idxAncho), rLar = rango(idxLargo);
  const filaValida = `(${rEsp}<>"")*(${rAnc}<>"")*(${rLar}<>"")`;
  // Cantidad vacía cuenta como 1 pieza — mismo criterio que `parsearFilasImportadas`.
  const cantExpr = idxCantidad >= 0 ? `IF(${rango(idxCantidad)}="",1,${rango(idxCantidad)})` : "1";

  const cGap = colLetra(headers.length);
  const cLabel = colLetra(headers.length + 1);
  const cValor = colLetra(headers.length + 2);
  ws.getColumn(cGap).width = 3;
  ws.getColumn(cLabel).width = 20;
  ws.getColumn(cValor).width = 14;

  ws.mergeCells(`${cLabel}1:${cValor}1`);
  const titulo = ws.getCell(`${cLabel}1`);
  titulo.value = "RESUMEN EN VIVO";
  titulo.font = { bold: true, color: { argb: "FFFFFFFF" } };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF008060" } };
  titulo.alignment = { vertical: "middle", horizontal: "center" };

  const filas: { label: string; formula: string; fmt: string }[] = [
    { label: "Piezas totales", formula: `SUMPRODUCT(${filaValida}*(${cantExpr}))`, fmt: "#,##0" },
    { label: "Pie tablar total", formula: `ROUND(SUMPRODUCT(${filaValida}*${rEsp}*${rAnc}*${rLar}/12*(${cantExpr})),2)`, fmt: "#,##0.00" },
    // m³ = PT ÷ 424 (la misma cuenta que la columna de la pantalla), no el
    // volumen geométrico: si no, el Excel y la tabla no cierran entre sí.
    { label: "Volumen total (m³)", formula: `ROUND(SUMPRODUCT(${filaValida}*${rEsp}*${rAnc}*${rLar}/12*(${cantExpr}))/${PT_POR_M3},4)`, fmt: "#,##0.0000" },
  ];
  if (idxEspecie >= 0) {
    const rEspecie = rango(idxEspecie);
    filas.push({ label: "Especies distintas", formula: `SUMPRODUCT((${rEspecie}<>"")/COUNTIF(${rEspecie},${rEspecie}&""))`, fmt: "#,##0" });
  }
  filas.forEach(({ label, formula, fmt }, i) => {
    const fila = i + 2;
    const cLbl = ws.getCell(`${cLabel}${fila}`);
    cLbl.value = label;
    cLbl.font = { bold: true, color: { argb: "FF374151" } };
    const cVal = ws.getCell(`${cValor}${fila}`);
    cVal.value = { formula, result: 0 };
    cVal.font = { bold: true, color: { argb: "FF111827" } };
    cVal.alignment = { horizontal: "right" };
    cVal.numFmt = fmt;
    [cLbl, cVal].forEach((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } }; });
  });

  const filaNota = filas.length + 2;
  ws.mergeCells(`${cLabel}${filaNota}:${cValor}${filaNota}`);
  const nota = ws.getCell(`${cLabel}${filaNota}`);
  nota.value = "Referencia — se calcula solo. Asume pulgadas/pulgadas/pies.";
  nota.font = { italic: true, size: 8, color: { argb: "FF9CA3AF" } };
  nota.alignment = { wrapText: true, vertical: "top" };
}

/**
 * Plantilla de importación como .xlsx REAL — cada columna en su propia celda.
 * Un CSV se abre en una sola celda cuando el Excel del usuario usa ";" de
 * separador (locale es-PE); el .xlsx no depende del separador. Sin filas de
 * datos: solo los encabezados, listos para llenar.
 */
export async function descargarPlantillaImport(headers: string[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cubicación");
  ws.columns = headers.map((h) => ({ header: h, key: h.toLowerCase(), width: Math.max(12, h.length + 6) }));
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF008060" } };
  hdr.alignment = { vertical: "middle", horizontal: "center" };
  hdr.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  agregarResumenEnVivo(ws, headers);
  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: MIME_XLSX }), "plantilla-cubicacion.xlsx");
}

/** PDF de la liquidación por especie (comprobante para el comprador). */
export async function exportarLiquidacionPDF(datos: DatosLiquidacion, liq: Liquidacion): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const conValor = liq.total > 0;
  const s = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("Liquidación de madera", 40, 46);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110);
  if (datos.emisor) doc.text(datos.emisor, 40, 62);
  doc.text(`Cliente: ${datos.cliente || "—"}${datos.documento ? ` · ${datos.documento}` : ""}`, 40, datos.emisor ? 78 : 62);
  doc.text(`Fecha: ${fechaLarga(datos.fecha)}`, 400, datos.emisor ? 78 : 62);

  const head = [["Especie", "Piezas", "Pie tablar", ...(conValor ? ["S/ / PT", "Subtotal"] : [])]];
  const body = liq.lineas.map((l) => [
    l.especie, String(l.piezas), s(l.pieTablar),
    ...(conValor ? [`S/ ${s(l.precioPt)}`, `S/ ${s(l.subtotal)}`] : []),
  ]);
  const foot = [[`Total · ${liq.totalPiezas} pzas`, String(liq.totalPiezas), `${s(liq.totalPt)} PT`, ...(conValor ? ["", `S/ ${s(liq.total)}`] : [])]];

  autoTable(doc, {
    head, body, foot,
    startY: datos.emisor ? 92 : 78,
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [0, 128, 96], textColor: 255 },
    footStyles: { fillColor: [230, 244, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
  });
  let y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  if (datos.nota) {
    doc.setFontSize(10); doc.setTextColor(80);
    doc.text(doc.splitTextToSize(datos.nota, 515), 40, y + 22); y += 22 + datos.nota.split("\n").length * 12;
  }
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`${s(liq.totalM3)} m³ · documento generado por el cubicador de Buleje.`, 40, y + 24);
  doc.save(`liquidacion-${datos.cliente ? datos.cliente.toLowerCase().replace(/\s+/g, "-").slice(0, 24) : fecha()}.pdf`);
}

// ─── Excel ──────────────────────────────────────────────────────────────────
const TEAL = "FF008060";        // header / total general
const TEAL_SOFT = "FFE6F4F0";   // subtotal por tipo
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Encabezado (fila 1) teal con texto blanco centrado + congelado. */
function estilarHeader(ws: Worksheet): void {
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

/** Pinta una fila completa con un fondo sólido (subtotal/total). */
function pintarFila(ws: Worksheet, row: ReturnType<Worksheet["addRow"]>, argb: string, blanco: boolean): void {
  row.font = { bold: true, ...(blanco ? { color: { argb: "FFFFFFFF" } } : {}) };
  const nCols = ws.columnCount;
  for (let i = 1; i <= nCols; i++) {
    row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  }
}

/**
 * Hoja de resumen: una fila por grupo (label · piezas · PT · m³ · % del PT · valor)
 * ordenada como venga `resumen.grupos`, con fila TOTAL al pie.
 */
function hojaResumen(wb: Workbook, nombre: string, etiqueta: string, resumen: ResumenLote, conPrecio: boolean): void {
  const ws = wb.addWorksheet(nombre);
  ws.columns = [
    { header: etiqueta, key: "g", width: 22 },
    { header: "Piezas", key: "cant", width: 10 },
    { header: "Pie tablar", key: "pt", width: 13 },
    { header: "m³", key: "m3", width: 11 },
    { header: "% PT", key: "pct", width: 9 },
    ...(conPrecio ? [{ header: "Valor S/", key: "val", width: 14 }] : []),
  ];
  estilarHeader(ws);
  for (const g of resumen.grupos) {
    ws.addRow({ g: g.label, cant: g.cantidad, pt: g.pieTablar, m3: g.m3, pct: g.pctPt / 100, ...(conPrecio ? { val: g.valor } : {}) });
  }
  const tot = ws.addRow({
    g: "TOTAL", cant: resumen.total.cantidad, pt: resumen.total.pieTablar, m3: resumen.total.m3, pct: 1,
    ...(conPrecio ? { val: resumen.total.valor } : {}),
  });
  pintarFila(ws, tot, TEAL, true);
  ws.getColumn("pt").numFmt = "#,##0.00";
  ws.getColumn("m3").numFmt = "#,##0.0000";
  ws.getColumn("pct").numFmt = "0.0%";
  if (conPrecio) ws.getColumn("val").numFmt = "#,##0.00";
}

/**
 * Hoja "Por apartado": una fila por bloque cerrado (Apartado N · Especie ·
 * Piezas · Pie tablar · m³), con fila TOTAL al pie. Sólo se llama cuando hay
 * algo asignado — ver `conApartados`.
 */
function hojaApartados(wb: Workbook, rows: PiezaCubicada[], asignados: ApartadosAsignados, nombres: NombresApartado): void {
  const resumen = resumenApartados(rows, asignados);
  if (resumen.length === 0) return;
  const ws = wb.addWorksheet("Por apartado");
  ws.columns = [
    { header: "Apartado", key: "ap", width: 28 },
    { header: "Especie", key: "especie", width: 24 },
    { header: "Piezas", key: "piezas", width: 10 },
    { header: "Pie tablar", key: "pt", width: 13 },
    { header: "m³", key: "m3", width: 11 },
  ];
  estilarHeader(ws);
  for (const a of resumen) {
    ws.addRow({ ap: etiquetaApartado(a.numero, nombres), especie: a.especies.join(" · "), piezas: a.piezas, pt: a.pieTablar, m3: a.m3 });
  }
  const tot = ws.addRow({
    ap: "TOTAL", especie: "",
    piezas: resumen.reduce((s, a) => s + a.piezas, 0),
    pt: r2(resumen.reduce((s, a) => s + a.pieTablar, 0)),
    m3: r4(resumen.reduce((s, a) => s + a.m3, 0)),
  });
  pintarFila(ws, tot, TEAL, true);
  ws.getColumn("pt").numFmt = "#,##0.00";
  ws.getColumn("m3").numFmt = "#,##0.0000";
}

/**
 * Excel (.xlsx) con 3 hojas fijas: "Detalle" (piezas numeradas, ORDENADAS por
 * tipo — comercial primero — con subtotal por tipo y total general), "Resumen
 * por tipo" y "Por especie". Espesor/ancho en pulgadas y largo en pies (unidad
 * de comercio). Con dueño asignado, suma una hoja "Por dueño" y una columna
 * "Dueño" en el Detalle; con apartados asignados, suma "Por apartado" y una
 * columna "Apartado" — cada una sólo si el lote realmente la usa.
 */
export async function exportarExcel(rows: PiezaCubicada[], opts: ExportOpts): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cubicador de Buleje";
  const conPrecio = tieneValor(rows, opts);
  const conAp = conApartados(opts);
  const conDue = conDueno(rows);
  const { grupos, total } = agruparDetallePorTipo(rows, opts);
  const precio = precioResolver(opts);

  // ── Hoja 1: Detalle por tipo ──
  const ws = wb.addWorksheet("Detalle");
  ws.columns = [
    { header: "N°", key: "n", width: 6 },
    { header: "Cantidad", key: "cant", width: 10 },
    { header: "Espesor (pulg)", key: "esp", width: 14 },
    { header: "Ancho (pulg)", key: "anc", width: 13 },
    { header: "Largo (pies)", key: "lar", width: 13 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Especie", key: "especie", width: 16 },
    ...(conDue ? [{ header: "Dueño", key: "dueno", width: 18 }] : []),
    ...(conAp ? [{ header: "Apartado", key: "apartado", width: 14 }] : []),
    { header: "Pie tablar", key: "pt", width: 12 },
    { header: "m³", key: "m3", width: 11 },
    ...(conPrecio ? [{ header: "Valor S/", key: "val", width: 14 }] : []),
  ];
  estilarHeader(ws);

  let n = 0;
  for (const g of grupos) {
    for (const r of g.piezas) {
      ws.addRow({
        n: ++n, cant: r.cantidad,
        esp: espPulg(r.espesor, r.uEspesor), anc: espPulg(r.ancho, r.uAncho), lar: larPies(r.largo, r.uLargo),
        tipo: g.tipo, especie: r.especie ?? "",
        ...(conDue ? { dueno: r.dueno ?? "" } : {}),
        ...(conAp ? { apartado: apartadoTxt(r, opts) } : {}),
        pt: r.pieTablar, m3: r.m3,
        ...(conPrecio ? { val: r.pieTablar * precioPieza(r, opts) } : {}),
      });
    }
    const sub = ws.addRow({
      cant: g.sub.piezas, tipo: `Subtotal ${g.tipo}`, pt: r2(g.sub.pt), m3: r4(g.sub.m3),
      ...(conPrecio ? { val: r2(g.sub.valor) } : {}),
    });
    pintarFila(ws, sub, TEAL_SOFT, false);
  }
  const totalRow = ws.addRow({
    cant: total.piezas, tipo: "TOTAL GENERAL", pt: r2(total.pt), m3: r4(total.m3),
    ...(conPrecio ? { val: r2(total.valor) } : {}),
  });
  pintarFila(ws, totalRow, TEAL, true);

  ws.getColumn("esp").numFmt = "0.##";
  ws.getColumn("anc").numFmt = "0.##";
  ws.getColumn("lar").numFmt = "0.##";
  ws.getColumn("pt").numFmt = "#,##0.00";
  ws.getColumn("m3").numFmt = "#,##0.0000";
  if (conPrecio) ws.getColumn("val").numFmt = "#,##0.00";

  // ── Hoja 2: Resumen por tipo (mismo orden canónico que el detalle) ──
  const porTipo = agruparPor(rows, "tipo", precio);
  porTipo.grupos.sort((a, b) => ordenTipo(a.clave as TipoComercial) - ordenTipo(b.clave as TipoComercial));
  hojaResumen(wb, "Resumen por tipo", "Tipo", porTipo, conPrecio);

  // ── Hoja 3: Por especie (ordenada por pie tablar, la que más pesa arriba) ──
  hojaResumen(wb, "Por especie", "Especie", agruparPor(rows, "especie", precio), conPrecio);

  // ── Hoja 4: Por dueño (sólo si el lote tiene algo asignado) ──
  if (conDue) hojaResumen(wb, "Por dueño", "Dueño", agruparPor(rows, "dueno", precio), conPrecio);

  // ── Hoja 5: Por apartado (sólo si el lote separó en bloques) ──
  if (conAp) hojaApartados(wb, rows, opts.asignados ?? {}, opts.nombresApartado ?? {});

  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: MIME_XLSX }), `cubicacion-${fecha()}.xlsx`);
}
