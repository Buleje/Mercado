/**
 * anexo04-excel.ts — el mismo ANEXO N° 04 pero en .xlsx, para que el regente lo
 * edite antes de imprimir. Una pestaña por hoja del anexo, con la maqueta
 * oficial (4 bloques × 6 columnas × 35 filas) y **fórmulas de verdad**: la
 * columna (10) V y los subtotales (11) se recalculan solos si alguien corrige
 * una medida — un Excel con números pegados sería una trampa.
 *
 * Client-only: exceljs entra por import dinámico.
 */
import type { Worksheet } from "exceljs";
import { PT_POR_M3, type PiezaCubicada } from "./cubicacion";
import type { AnexoEmitido } from "./anexo04-registro";
import {
  construirAnexo04, BLOQUES_POR_HOJA, TEXTO_LEGAL, ETIQUETAS_FIRMA,
  type Anexo04, type Anexo04Opts, type DatosAnexo04, type HojaAnexo04,
} from "./anexo04-serfor";

const VERDE = "FFE2EFD9";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const COLS_BLOQUE = 6;
const TOTAL_COLS = BLOQUES_POR_HOJA * COLS_BLOQUE; // 24 (A..X)
const HEAD = ["N°", "(6) Cant", "(7) E", "(8) A", "(9) L", "(10) V"];

/** Índice 1-based → letra de columna de Excel (1 → A, 27 → AA). */
function letra(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const borde = { style: "thin" as const, color: { argb: "FF000000" } };
const TODOS = { top: borde, left: borde, bottom: borde, right: borde };

/** Fila donde arranca cada tramo de la maqueta (1-based, igual en toda hoja). */
const R = { banner: 1, instr: 3, empresa: 4, numero: 4, gtf: 5, volumen: 6, especie: 8, tipo: 9, head: 10, datos: 11 } as const;

function centrar(ws: Worksheet, rango: string, texto: string, size: number, bold: boolean, fill?: string) {
  ws.mergeCells(rango);
  const c = ws.getCell(rango.split(":")[0]);
  c.value = texto;
  c.font = { bold, size };
  c.alignment = { horizontal: "center", vertical: "middle" };
  if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  c.border = TODOS;
}

/**
 * Fórmula de la columna V para la fila `r` del bloque que arranca después de la
 * columna `c0`: pie tablar comercial (E×A×L÷12×cant) o m³ real, según la unidad
 * elegida. Cero si no hay cantidad, así las filas de relleno no muestran basura.
 *
 * Exportada para poder testearla: una referencia corrida una sola columna hace
 * que TODO el anexo mienta en silencio (pasó — usaba A..D en vez de B..E).
 */
export function formulaV(c0: number, r: number, unidadV: DatosAnexo04["unidadV"]): string {
  // c0 es la columna ANTERIOR a la primera del bloque: c0+1 = N°, c0+2 = Cant…
  const [cant, e, a, l] = [2, 3, 4, 5].map((i) => `${letra(c0 + i)}${r}`);
  /* El m³ SALE del pie tablar (PT ÷ 424), igual que en la pantalla del
     cubicador: la conversión comercial de la plaza, no el volumen geométrico
     (0,0254 m × 0,0254 m × 0,3048 m daría 423,776 y el Excel diría un m³ que
     no cierra contra el que se imprimió en el papel). */
  const pt = `${cant}*${e}*${a}*${l}/12`;
  const cuerpo = unidadV === "m3" ? `${pt}/${PT_POR_M3}` : pt;
  return `IF(${cant}="",0,ROUND(${cuerpo},3))`;
}

/** Una pestaña = una hoja del anexo (misma maqueta que el PDF). */
function hojaExcel(ws: Worksheet, hoja: HojaAnexo04, datos: DatosAnexo04, anexo: Anexo04, nro: number, total: number) {
  const filas = hoja.filasPorBloque;
  const rSub = R.datos + filas;
  const ultima = letra(TOTAL_COLS);

  for (let c = 1; c <= TOTAL_COLS; c++) {
    const dentro = (c - 1) % COLS_BLOQUE;
    ws.getColumn(c).width = [5, 8, 6, 6, 6, 12][dentro];
  }

  centrar(ws, `A${R.banner}:${ultima}${R.banner}`, "ANEXO N° 04", 11, true, VERDE);
  centrar(ws, `A${R.banner + 1}:${ultima}${R.banner + 1}`, '"LISTA DE PRODUCTOS TRANSFORMADOS"', 12, true, VERDE);
  centrar(ws, `A${R.instr}:${ultima}${R.instr}`, "Para el llenado del presente Anexo se utilizarán las instrucciones adjuntas.", 8, false, VERDE);

  ws.getCell(`A${R.empresa}`).value = datos.empresa.toUpperCase();
  ws.getCell(`A${R.empresa}`).font = { bold: true, size: 12 };
  ws.mergeCells(`A${R.empresa}:H${R.empresa + 1}`);
  centrar(ws, `I${R.empresa}:P${R.empresa + 1}`, "LISTA DE PRODUCTOS TRANSFORMADOS", 11, true);

  const campo = (fila: number, label: string, valor: string | number | { formula: string }) => {
    ws.mergeCells(`Q${fila}:S${fila}`);
    const l = ws.getCell(`Q${fila}`);
    l.value = label; l.font = { bold: true, size: 9 }; l.alignment = { horizontal: "right" };
    ws.mergeCells(`T${fila}:${ultima}${fila}`);
    ws.getCell(`T${fila}`).value = valor;
  };
  campo(R.numero, "(1) N°:", datos.numero);
  campo(R.gtf, "(2) GTF N°:", datos.gtf);
  // El volumen total (3) sale de los subtotales: si V está en PT, se pasa a m³.
  const refsSub = Array.from({ length: BLOQUES_POR_HOJA }, (_, b) => `${letra(b * COLS_BLOQUE + COLS_BLOQUE)}${rSub}`).join(",");
  campo(R.volumen, "(3) VOLUMEN TOTAL (m³):", {
    formula: datos.unidadV === "m3" ? `ROUND(SUM(${refsSub}),3)` : `ROUND(SUM(${refsSub})/${PT_POR_M3},3)`,
  });

  for (let b = 0; b < BLOQUES_POR_HOJA; b++) {
    const bloque = hoja.bloques[b];
    if (!bloque && datos.modo === "compacto") continue;
    const c0 = b * COLS_BLOQUE;                       // 0-based: columna previa a la 1ª del bloque
    const desde = letra(c0 + 1), hasta = letra(c0 + COLS_BLOQUE);

    ws.mergeCells(`${desde}${R.especie}:${hasta}${R.especie}`);
    ws.getCell(`${desde}${R.especie}`).value = `(4) Especie:  ${bloque?.especie ?? ""}`;
    ws.getCell(`${desde}${R.especie}`).font = { bold: true, size: 9 };
    ws.mergeCells(`${desde}${R.tipo}:${hasta}${R.tipo}`);
    ws.getCell(`${desde}${R.tipo}`).value = `(5) Tipo de producto: ${bloque ? `${bloque.tipo}${bloque.continuacion ? " (cont.)" : ""}` : ""}`;
    ws.getCell(`${desde}${R.tipo}`).font = { size: 9 };

    HEAD.forEach((h, j) => {
      const c = ws.getRow(R.head).getCell(c0 + 1 + j);
      c.value = h;
      c.font = { bold: true, size: 8 };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = TODOS;
    });

    for (let f = 0; f < filas; f++) {
      const r = R.datos + f;
      const fila = bloque?.filas[f];
      const valores: (number | string | null)[] = [f + 1, fila?.cantidad ?? null, fila?.e ?? null, fila?.a ?? null, fila?.l ?? null];
      valores.forEach((v, j) => {
        const c = ws.getRow(r).getCell(c0 + 1 + j);
        if (v !== null) c.value = v;
        c.border = TODOS;
        c.alignment = { horizontal: j === 0 ? "center" : "center" };
        c.font = { size: 9 };
      });
      const cv = ws.getRow(r).getCell(c0 + COLS_BLOQUE);
      cv.value = { formula: formulaV(c0, r, datos.unidadV) };
      cv.numFmt = "0.000";
      cv.border = TODOS;
      cv.font = { size: 9 };
      cv.alignment = { horizontal: "right" };
    }

    ws.mergeCells(`${desde}${rSub}:${letra(c0 + COLS_BLOQUE - 1)}${rSub}`);
    const lbl = ws.getCell(`${desde}${rSub}`);
    lbl.value = "(11) SUB TOTAL";
    lbl.font = { bold: true, size: 9 };
    lbl.alignment = { horizontal: "right" };
    const tot = ws.getRow(rSub).getCell(c0 + COLS_BLOQUE);
    tot.value = { formula: `ROUND(SUM(${hasta}${R.datos}:${hasta}${rSub - 1}),3)` };
    tot.numFmt = "0.000";
    tot.font = { bold: true, size: 9 };
    tot.border = TODOS;
    tot.alignment = { horizontal: "right" };
  }

  // (12) Observaciones + firmas (13)-(16) + legal
  const rObs = rSub + 2;
  ws.mergeCells(`A${rObs}:${ultima}${rObs}`);
  ws.getCell(`A${rObs}`).value = "(12) OBSERVACIONES:";
  ws.getCell(`A${rObs}`).font = { bold: true, size: 9 };
  ws.mergeCells(`A${rObs + 1}:N${rObs + 5}`);
  ws.getCell(`A${rObs + 1}`).value = datos.observaciones;
  ws.getCell(`A${rObs + 1}`).alignment = { vertical: "top", wrapText: true };

  const valores = ["", datos.firmante, datos.documento, datos.cargo];
  ETIQUETAS_FIRMA.forEach((etiqueta, i) => {
    const r = rObs + 1 + i * 2;
    ws.mergeCells(`P${r}:${ultima}${r}`);
    const v = ws.getCell(`P${r}`);
    v.value = valores[i];
    v.alignment = { horizontal: "right" };
    v.border = { bottom: { style: "dotted", color: { argb: "FF000000" } } };
    ws.mergeCells(`P${r + 1}:${ultima}${r + 1}`);
    const l = ws.getCell(`P${r + 1}`);
    l.value = etiqueta;
    l.font = { bold: true, size: 8 };
    l.alignment = { horizontal: "right" };
  });

  const rLegal = rObs + 10;
  TEXTO_LEGAL.forEach((t, i) => {
    ws.mergeCells(`A${rLegal + i}:${ultima}${rLegal + i}`);
    const c = ws.getCell(`A${rLegal + i}`);
    c.value = t;
    c.font = { size: 8, color: { argb: "FF3C3C3C" } };
  });
  ws.mergeCells(`A${rLegal + 2}:${ultima}${rLegal + 2}`);
  ws.getCell(`A${rLegal + 2}`).value = `Hoja ${nro} de ${total} · ${anexo.totalPiezas} piezas · generado por el cubicador de Buleje.`;
  ws.getCell(`A${rLegal + 2}`).font = { size: 8, color: { argb: "FF787878" } };

  ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0, footer: 0 } };
}

/** Descarga el ANEXO N° 04 como .xlsx editable (una pestaña por hoja). */
export async function exportarAnexo04Excel(rows: PiezaCubicada[], datos: DatosAnexo04, opts: Anexo04Opts = {}): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cubicador de Buleje";
  const anexo = construirAnexo04(rows, datos, opts);
  anexo.hojas.forEach((hoja, i) => {
    hojaExcel(wb.addWorksheet(`Anexo 04 (${i + 1})`), hoja, datos, anexo, i + 1, anexo.hojas.length);
  });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: MIME_XLSX }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `anexo04-productos-transformados${datos.gtf ? `-${datos.gtf.replace(/[^\w-]+/g, "")}` : ""}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Bandeja de emitidos a .xlsx — el "libro de anexos" que el regente archiva y
 * que en una fiscalización responde "¿qué anexos emitiste este mes?" sin abrir
 * uno por uno. Una fila por emisión, con totales al pie.
 */
export async function exportarBandejaAnexos(lista: AnexoEmitido[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cubicador de Buleje";
  const ws = wb.addWorksheet("Anexos emitidos");
  ws.columns = [
    { header: "(1) N°", key: "numero", width: 18 },
    { header: "(2) GTF N°", key: "gtf", width: 18 },
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Hojas", key: "hojas", width: 7 },
    { header: "Piezas", key: "piezas", width: 9 },
    { header: "Pie tablar", key: "pt", width: 13 },
    { header: "m³", key: "m3", width: 11 },
    { header: "Emisor (14)", key: "firmante", width: 24 },
    { header: "Documento (15)", key: "documento", width: 14 },
    { header: "Cargo (16)", key: "cargo", width: 20 },
    { header: "Empresa", key: "empresa", width: 26 },
    { header: "Despacho del Libro", key: "ctp", width: 26 },
    { header: "Observaciones", key: "obs", width: 40 },
  ];
  estilarCabecera(ws);
  for (const a of lista) {
    ws.addRow({
      numero: a.numero, gtf: a.gtf, fecha: a.fecha, hojas: a.hojas,
      piezas: a.totalPiezas, pt: a.totalPt, m3: a.totalM3,
      firmante: a.firmante, documento: a.documento, cargo: a.cargo,
      empresa: a.empresa, ctp: a.ctpEntryId ?? "", obs: a.observaciones,
    });
  }
  const total = ws.addRow({
    numero: "TOTAL", hojas: lista.reduce((s, a) => s + a.hojas, 0),
    piezas: lista.reduce((s, a) => s + a.totalPiezas, 0),
    pt: Math.round(lista.reduce((s, a) => s + a.totalPt, 0) * 100) / 100,
    m3: Math.round(lista.reduce((s, a) => s + a.totalM3, 0) * 1000) / 1000,
  });
  total.font = { bold: true };
  ws.getColumn("pt").numFmt = "#,##0.00";
  ws.getColumn("m3").numFmt = "#,##0.000";
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: `M1` };

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: MIME_XLSX }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `anexos-emitidos-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Fila 1 en verde del formato, congelada. */
function estilarCabecera(ws: Worksheet): void {
  const head = ws.getRow(1);
  head.height = 20;
  head.eachCell((c) => {
    c.font = { bold: true, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
}
