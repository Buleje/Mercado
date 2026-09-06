/**
 * cubicacion-trozas-excel — plantilla .xlsx para cargar trozas fuera de
 * línea: Especie · D1 · D2 · Largo, con el volumen por FÓRMULA (Smalian) y,
 * al costado, un resumen por especie que también se calcula solo — mismo
 * patrón que `agregarResumenEnVivo` de la aserrada (`cubicador-export.ts`).
 *
 * ⚠️ El listado de especies NO usa `UNIQUE`/`FILTER`/`SORT`: esas funciones
 * son de Excel 365+ y en un Excel más viejo (o algún LibreOffice) devuelven
 * #NAME? y todo el panel queda en blanco — se probó en la práctica y no
 * anduvo. En su lugar, el listado se arma ACÁ, en JS, antes de escribir el
 * archivo: catálogo (`ESPECIES_MADERA`) unido con lo que ya haya cubicado el
 * patio (`especiesDelPatio`, opcional) — y de ahí en más son fórmulas
 * COUNTIF/SUMIF planas, compatibles con cualquier versión de Excel.
 *
 * Es sólo REFERENCIA — lo que de verdad entra al patio lo recubica
 * `cubicacion-trozas-import.ts` al importar, nunca se confía en la fórmula.
 */
import type { Worksheet } from "exceljs";
import { ESPECIES_MADERA } from "./cubicacion";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TEAL = "FF008060";
const GRIS = "FFF3F4F6";
/** Filas de datos que cubre la plantilla — un día grueso de carga en patio. */
const FIN = 1000;
/**
 * m³ a tres decimales — pero SÓLO de vista (`numFmt`), nunca en el valor. Un
 * `ROUND(...,3)` metido en la fórmula trunca el número real: si alguien usa
 * "Aumentar decimales" en Excel para mirar más precisión, ve ceros de relleno
 * en vez del cálculo verdadero. Mismo criterio que `cubicacion-formato.ts`:
 * "esto es PRESENTACIÓN, los números crudos no se tocan".
 */
const NUMFMT_M3 = "#,##0.000";

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const colLetra = (i: number) => String.fromCharCode(65 + i);

/** Catálogo + lo que ya esté en el patio, sin duplicados (case-insensitive, conserva la primera forma vista). */
function especiesParaResumen(especiesDelPatio: readonly string[]): string[] {
  const vistas = new Map<string, string>();
  for (const e of [...ESPECIES_MADERA, ...especiesDelPatio]) {
    const limpio = e.trim();
    if (!limpio) continue;
    const clave = limpio.toLowerCase();
    if (!vistas.has(clave)) vistas.set(clave, limpio);
  }
  return [...vistas.values()];
}

/**
 * Resumen al costado: "Sin especie" (fijo) + una fila por especie (catálogo +
 * lo que ya haya en el patio) + TOTAL. Trozas y m³ por COUNTIF/SUMIF plano —
 * anda igual en Excel viejo, Excel 365 o LibreOffice.
 */
function agregarResumenPorEspecie(ws: Worksheet, especies: string[]): void {
  const rEspecie = `$A$2:$A$${FIN}`;
  const rD1 = `$B$2:$B$${FIN}`;
  const rVol = `$E$2:$E$${FIN}`;

  const cGap = colLetra(5);
  const cLabel = colLetra(6);
  const cTrozas = colLetra(7);
  const cVol = colLetra(8);
  ws.getColumn(cGap).width = 3;
  ws.getColumn(cLabel).width = 18;
  ws.getColumn(cTrozas).width = 10;
  ws.getColumn(cVol).width = 13;

  ws.mergeCells(`${cLabel}1:${cVol}1`);
  const titulo = ws.getCell(`${cLabel}1`);
  titulo.value = "RESUMEN POR ESPECIE";
  titulo.font = { bold: true, color: { argb: "FFFFFFFF" } };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  titulo.alignment = { vertical: "middle", horizontal: "center" };

  const filaEnc = 2;
  ([["Especie", cLabel], ["Trozas", cTrozas], ["m³", cVol]] as const).forEach(([txt, col]) => {
    const c = ws.getCell(`${col}${filaEnc}`);
    c.value = txt;
    c.font = { bold: true, color: { argb: "FF374151" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
  });

  // "Sin especie": fila fija.
  const filaSinEspecie = filaEnc + 1;
  ws.getCell(`${cLabel}${filaSinEspecie}`).value = "Sin especie";
  ws.getCell(`${cLabel}${filaSinEspecie}`).font = { italic: true };
  ws.getCell(`${cTrozas}${filaSinEspecie}`).value = { formula: `COUNTIF(${rEspecie},"")`, result: 0 };
  const volSinEspecie = ws.getCell(`${cVol}${filaSinEspecie}`);
  volSinEspecie.value = { formula: `SUMIF(${rEspecie},"",${rVol})`, result: 0 };
  volSinEspecie.numFmt = NUMFMT_M3;

  // Una fila por especie conocida (catálogo + patio actual), con COUNTIF/SUMIF
  // simples — nada de funciones que un Excel viejo no entienda.
  especies.forEach((esp, i) => {
    const fila = filaSinEspecie + 1 + i;
    ws.getCell(`${cLabel}${fila}`).value = esp;
    ws.getCell(`${cTrozas}${fila}`).value = { formula: `COUNTIF(${rEspecie},${cLabel}${fila})`, result: 0 };
    const vCell = ws.getCell(`${cVol}${fila}`);
    vCell.value = { formula: `SUMIF(${rEspecie},${cLabel}${fila},${rVol})`, result: 0 };
    vCell.numFmt = NUMFMT_M3;
  });

  // "Otras" recoge cualquier especie tipeada que no esté en la lista de arriba
  // (típicamente escrita distinto — mayúscula, tilde, un nombre nuevo).
  const filaOtras = filaSinEspecie + 1 + especies.length;
  const filaTotal = filaOtras + 1;

  ws.getCell(`${cLabel}${filaTotal}`).value = "TOTAL";
  ws.getCell(`${cTrozas}${filaTotal}`).value = { formula: `SUMPRODUCT((${rD1}<>"")*1)`, result: 0 };
  const totVol = ws.getCell(`${cVol}${filaTotal}`);
  totVol.value = { formula: `SUM(${rVol})`, result: 0 };
  totVol.numFmt = NUMFMT_M3;
  [cLabel, cTrozas, cVol].forEach((col) => {
    const c = ws.getCell(`${col}${filaTotal}`);
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  });

  ws.getCell(`${cLabel}${filaOtras}`).value = "Otras / distinto a la lista";
  ws.getCell(`${cLabel}${filaOtras}`).font = { italic: true };
  ws.getCell(`${cTrozas}${filaOtras}`).value = {
    formula: `${cTrozas}${filaTotal}-${cTrozas}${filaSinEspecie}-SUM(${cTrozas}${filaSinEspecie + 1}:${cTrozas}${filaOtras - 1})`,
    result: 0,
  };
  const otrasVol = ws.getCell(`${cVol}${filaOtras}`);
  otrasVol.value = {
    formula: `${cVol}${filaTotal}-${cVol}${filaSinEspecie}-SUM(${cVol}${filaSinEspecie + 1}:${cVol}${filaOtras - 1})`,
    result: 0,
  };
  otrasVol.numFmt = NUMFMT_M3;

  const filaNota = filaTotal + 2;
  ws.mergeCells(`${cLabel}${filaNota}:${cVol}${filaNota}`);
  const nota = ws.getCell(`${cLabel}${filaNota}`);
  nota.value = "Referencia — se calcula sola mientras llenás. La Especie tiene que escribirse EXACTO como al costado para que sume ahí (si no, cae en \"Otras\").";
  nota.font = { italic: true, size: 8, color: { argb: "FF9CA3AF" } };
  nota.alignment = { wrapText: true, vertical: "top" };
}

/**
 * Plantilla .xlsx: Especie · D1 (cm) · D2 (cm) · Largo (m) · Volumen (m³, por
 * FÓRMULA Smalian — recalcula solo al tipear D1/D2/Largo). Se MUESTRA a tres
 * decimales pero el valor real no se trunca: "Aumentar decimales" en Excel
 * revela la precisión completa, no ceros de relleno. Sin D2, la fórmula
 * asume troza pareja (cilindro con D1), igual que `cubicarTroza`.
 * `especiesDelPatio` (opcional): las especies que ya tenga cargadas el
 * cubicador al momento de descargar — se suman al catálogo para que el
 * resumen al costado nazca con lo que YA se está cubicando.
 */
export async function descargarPlantillaTrozas(especiesDelPatio: readonly string[] = []): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Trozas");
  ws.columns = [
    { header: "Especie", key: "especie", width: 18 },
    { header: "D1 (cm)", key: "d1", width: 12 },
    { header: "D2 (cm)", key: "d2", width: 12 },
    { header: "Largo (m)", key: "largo", width: 12 },
    { header: "Volumen (m³)", key: "vol", width: 15 },
  ];
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  hdr.alignment = { vertical: "middle", horizontal: "center" };
  hdr.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (let r = 2; r <= FIN; r++) {
    const c = ws.getCell(`E${r}`);
    c.value = {
      formula: `IF(OR(B${r}="",D${r}=""),"",((PI()/4*(B${r}/100)^2)+(PI()/4*(IF(C${r}="",B${r},C${r})/100)^2))/2*D${r})`,
      result: "",
    };
    c.numFmt = NUMFMT_M3;
  }

  agregarResumenPorEspecie(ws, especiesParaResumen(especiesDelPatio));

  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: MIME_XLSX }), "plantilla-trozas.xlsx");
}
