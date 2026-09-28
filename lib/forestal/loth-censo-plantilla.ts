/**
 * loth-censo-plantilla — la hoja vacía del censo para descargar, con el
 * encabezado de la hoja real del regente (`ENCABEZADO_PLANTILLA_CENSO`) en su
 * orden. Client-only: exceljs entra por import dinámico, como el resto de los
 * Excel del forestal.
 *
 * La columna «vol» trae la fórmula del censo (0,7854 × DAP² × altura × 0,65)
 * para que la hoja se vea como la del regente mientras se llena. Si el DAP se
 * escribe en centímetros (> 5), la fórmula lo pasa a metros igual que el
 * importador: sin eso, un 90 tecleado daba un volumen de diez mil veces y
 * entraba como el declarado.
 *
 * La primera hoja es la que se importa (`leerArchivoAFilas` lee sólo esa): la
 * ayuda va en una segunda hoja, nunca en filas de la primera — una fila de
 * ayuda se leería como un árbol con error.
 */

import { ENCABEZADO_PLANTILLA_CENSO } from "./loth-censo-import";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Filas con la fórmula del volumen ya puesta. */
const FILAS_CON_FORMULA = 500;

/** Ancho de cada columna, en el orden del encabezado. */
const ANCHOS: Record<(typeof ENCABEZADO_PLANTILLA_CENSO)[number], number> = {
  "N°": 6,
  Cod: 10,
  "N. Comun": 18,
  "N. Cientifico": 30,
  "Nombre en idioma nativo": 24,
  DAP: 8,
  altura: 8,
  vol: 10,
  Este: 11,
  Norte: 11,
  condicion: 15,
  observaciones: 30,
};

const AYUDA: readonly [string, string][] = [
  ["Cod", "Código del árbol en el censo (el que va en la placa). No se puede repetir."],
  ["N. Comun", "Nombre común de la especie, como en el plan de manejo."],
  ["DAP", "Diámetro a la altura del pecho, en metros (0,90). Si lo escribes en centímetros (90) se convierte solo."],
  ["altura", "Altura comercial, en metros."],
  ["vol", "Volumen en m³. Trae la fórmula 0,7854 × DAP² × altura × 0,65; si lo escribes a mano, manda lo que escribas."],
  ["Este / Norte", "Coordenadas UTM en metros (zona 18L). Sin ellas el árbol no se ve en el croquis."],
  ["condicion", "La que anota el regente: Aprovechable, Semillero, Remanente…"],
  ["N°", "El correlativo de la hoja: se puede dejar vacío, no se guarda."],
];

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Arma y descarga `plantilla-censo.xlsx`. */
export async function descargarPlantillaCenso(): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Censo");
  ws.columns = ENCABEZADO_PLANTILLA_CENSO.map((h) => ({ header: h, key: h, width: ANCHOS[h] }));
  const cabecera = ws.getRow(1);
  cabecera.font = { bold: true };
  cabecera.alignment = { vertical: "middle" };
  cabecera.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Columnas por letra: F = DAP, G = altura, H = vol, I = Este, J = Norte.
  const col = (h: (typeof ENCABEZADO_PLANTILLA_CENSO)[number]) => ws.getColumn(ENCABEZADO_PLANTILLA_CENSO.indexOf(h) + 1);
  col("DAP").numFmt = "0.00";
  col("altura").numFmt = "0.0";
  col("vol").numFmt = "0.000";
  col("Este").numFmt = "0";
  col("Norte").numFmt = "0";
  for (let r = 2; r <= FILAS_CON_FORMULA + 1; r++) {
    ws.getCell(`H${r}`).value = {
      formula: `IF(OR(F${r}="",G${r}=""),"",ROUND(0.7854*IF(F${r}>5,F${r}/100,F${r})^2*G${r}*0.65,3))`,
      result: "",
    };
  }

  const ayuda = wb.addWorksheet("Cómo llenarla");
  ayuda.columns = [
    { header: "Columna", key: "col", width: 16 },
    { header: "Qué va", key: "que", width: 96 },
  ];
  ayuda.getRow(1).font = { bold: true };
  for (const [c, que] of AYUDA) ayuda.addRow({ col: c, que });

  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: MIME_XLSX }), "plantilla-censo.xlsx");
}
