/**
 * loth-lineas-plantilla — la plantilla .xlsx que se descarga desde el
 * importador de líneas del LO-TH (`LothImportLineasModal`), una por sección
 * (Tala, Trozado, Despacho de trozas, Consumo, Producto terminado, Despacho
 * de producto). Los encabezados son EXACTAMENTE los que reconoce
 * `parseImportLineas`/`parseImportLineasCeldas` (`ALIAS` en
 * `loth-import-lineas.ts`): la plantilla que uno mismo genera tiene que
 * importarse sola, si no de qué sirve.
 *
 * Copia el patrón del censo (`loth-censo-plantilla.ts`, 28-09): encabezado en
 * negrita en la primera hoja —la que se lee al importar— y una segunda hoja
 * «Cómo llenarla» con la ayuda. Nunca una fila de ejemplo en la hoja que se
 * importa: esa fila se leería como una línea real, con datos inventados.
 *
 * Client-only: exceljs entra por import dinámico, como el resto de los Excel
 * del forestal.
 */

import type { LothSection } from "./loth-constants";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type CampoLinea =
  | "treeCode"
  | "trozaCode"
  | "speciesCommon"
  | "entryDate"
  | "diamMayorM"
  | "diamMenorM"
  | "lengthM"
  | "volumeM3"
  | "productType"
  | "quantity"
  | "unit"
  | "gtfNumber"
  | "observations";

/** Encabezado que reconoce el lector — el mismo texto que «Ver un ejemplo» del modal. */
const LABEL: Record<CampoLinea, string> = {
  treeCode: "Cód. árbol",
  trozaCode: "Cód. troza",
  speciesCommon: "Especie",
  entryDate: "Fecha",
  diamMayorM: "Ø mayor",
  diamMenorM: "Ø menor",
  lengthM: "Longitud",
  volumeM3: "Volumen",
  productType: "Producto",
  quantity: "Cantidad",
  unit: "Unidad",
  gtfNumber: "N° GTF",
  observations: "Observaciones",
};

const AYUDA: Record<CampoLinea, string> = {
  treeCode: "Código del árbol, el del censo/plan. No se puede repetir dentro del archivo.",
  trozaCode: "Código de la troza. No se puede repetir dentro del archivo.",
  speciesCommon: "Nombre común de la especie, como en el plan de manejo.",
  entryDate: "DD/MM/AAAA o AAAA-MM-DD.",
  diamMayorM: "Diámetro mayor de la troza, en metros (0,65).",
  diamMenorM: "Diámetro menor de la troza, en metros (0,60).",
  lengthM: "Longitud aprovechable, en metros.",
  volumeM3: "En m³. Si la dejas vacía y pusiste los dos diámetros y la longitud, se calcula sola (Smalian).",
  productType: "Madera aserrada, tablones, listones, durmientes…",
  quantity: "Cantidad del producto de esta línea.",
  unit: "Unidad de la cantidad: m3, pt, pza…",
  gtfNumber: "N° de la guía de transporte forestal (GTF) de esta salida.",
  observations: "Libre.",
};

const ANCHO: Record<CampoLinea, number> = {
  treeCode: 12,
  trozaCode: 12,
  speciesCommon: 16,
  entryDate: 12,
  diamMayorM: 10,
  diamMenorM: 10,
  lengthM: 10,
  volumeM3: 10,
  productType: 20,
  quantity: 10,
  unit: 8,
  gtfNumber: 14,
  observations: 30,
};

/** Nombre de la sección, para el título de la hoja y el nombre del archivo. */
const NOMBRE_SECCION: Record<LothSection, string> = {
  tala: "Tala",
  trozado: "Trozado",
  despacho_troza: "Despacho de trozas",
  consumo_troza: "Consumo de trozas",
  producto_terminado: "Producto terminado",
  despacho_producto: "Despacho de producto",
};

/** Columnas que pide cada sección, en el orden en que se ven mejor en la hoja. */
export const CAMPOS_POR_SECCION: Record<LothSection, CampoLinea[]> = {
  tala: ["treeCode", "speciesCommon", "entryDate", "diamMayorM", "diamMenorM", "lengthM", "volumeM3", "observations"],
  trozado: ["treeCode", "trozaCode", "speciesCommon", "diamMayorM", "diamMenorM", "lengthM", "volumeM3", "observations"],
  despacho_troza: ["trozaCode", "gtfNumber", "entryDate", "observations"],
  consumo_troza: ["trozaCode", "speciesCommon", "volumeM3", "observations"],
  producto_terminado: ["trozaCode", "productType", "speciesCommon", "quantity", "unit", "observations"],
  despacho_producto: ["gtfNumber", "productType", "quantity", "unit", "observations"],
};

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Arma y descarga `plantilla-<sección>.xlsx`, con la ayuda en una segunda hoja. */
export async function descargarPlantillaLineas(section: LothSection): Promise<void> {
  const campos = CAMPOS_POR_SECCION[section];
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(NOMBRE_SECCION[section]);
  ws.columns = campos.map((c) => ({ header: LABEL[c], key: c, width: ANCHO[c] }));
  const cabecera = ws.getRow(1);
  cabecera.font = { bold: true };
  cabecera.alignment = { vertical: "middle" };
  cabecera.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const ayuda = wb.addWorksheet("Cómo llenarla");
  ayuda.columns = [
    { header: "Columna", key: "col", width: 16 },
    { header: "Qué va", key: "que", width: 90 },
  ];
  ayuda.getRow(1).font = { bold: true };
  for (const c of campos) ayuda.addRow({ col: LABEL[c], que: AYUDA[c] });

  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: MIME_XLSX }), `plantilla-${section}.xlsx`);
}
