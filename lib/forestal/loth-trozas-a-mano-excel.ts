/**
 * loth-trozas-a-mano-excel — el formato .xlsx de la «Lista de trozas» del
 * despacho con guía (Brandon 16-10: «un botón para exportar un formato para
 * rellenar con nombre científico, nombre común, codificación, D1, D2, L,
 * cantidad y volumen Smalian de SERFOR, y que al importarlo se rellene la
 * lista de trozas»).
 *
 * - `descargarFormatoTrozas` arma la hoja «Trozas» con esas 8 columnas, en ese
 *   orden, y 150 filas (el tope de una guía) que ya traen la fórmula: el
 *   volumen sale solo al tipear D1, D2 y L, y el científico al elegir el común
 *   de la lista (hoja «Especies», el catálogo del aserradero).
 * - `trozasDelFormato` lee ese archivo (o uno parecido: reconoce también los
 *   encabezados de la lista SERFOR, «(6) d1», «(8) L»…) y devuelve las filas
 *   para «Anotar a mano». Cada fila pasa por `revisarTrozaAMano`, la misma
 *   revisión que el alta a mano; la que no pasa se informa con su N° de fila y
 *   no entra. El volumen del archivo NO manda: el de la lista es Smalian de las
 *   medidas (el servidor lo vuelve a calcular igual); si difieren se avisa.
 *
 * La codificación la pone la guía al registrar (1, 2, 3… o el código del
 * árbol): del archivo sólo se toma el primer N° para arrancar desde ahí.
 * Client-only en la descarga (exceljs por import dinámico); `trozasDelFormato`
 * es pura.
 */

import type { Celda } from "./cubicacion-import";
import { TROZAS_POR_GUIA_MAX, revisarTrozaAMano, volumenDeFila, type TrozaAMano } from "./loth-trozas-a-mano";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type CampoFormato = "cientifico" | "comun" | "codigo" | "d1" | "d2" | "largo" | "cantidad" | "volumen";

/** Las columnas del formato, en el orden que pidió Brandon. */
export const COLUMNAS_FORMATO: ReadonlyArray<{ campo: CampoFormato; titulo: string; ancho: number }> = [
  { campo: "cientifico", titulo: "Nombre científico", ancho: 28 },
  { campo: "comun", titulo: "Nombre común", ancho: 20 },
  { campo: "codigo", titulo: "Codificación", ancho: 14 },
  { campo: "d1", titulo: "D1 (cm)", ancho: 10 },
  { campo: "d2", titulo: "D2 (cm)", ancho: 10 },
  { campo: "largo", titulo: "L (m)", ancho: 10 },
  { campo: "cantidad", titulo: "Cantidad", ancho: 10 },
  { campo: "volumen", titulo: "Volumen m³ (Smalian SERFOR)", ancho: 16 },
];

const AYUDA: readonly [string, string][] = [
  ["Nombre científico", "Sale solo al elegir el nombre común (hoja «Especies»). Si escribes sólo el científico, se busca su nombre común."],
  ["Nombre común", "La especie, como en el plan de manejo. Elige de la lista o escríbela."],
  ["Codificación", "Puede ir vacía: la guía numera sola (1, 2, 3…). Si pones un número en la primera fila, arranca desde ahí."],
  ["D1 (cm)", "Diámetro mayor en centímetros (45 o 45,5)."],
  ["D2 (cm)", "Diámetro menor en centímetros. Vacío = igual a D1 (troza pareja), y queda marcada."],
  ["L (m)", "Largo en metros (3,20)."],
  ["Cantidad", "Cuántas trozas iguales. Vacía = 1."],
  ["Volumen", "Smalian de SERFOR: 0,7854 × ((D1 + D2) / 2)² × L, por troza, × cantidad. No se tipea: al importar se vuelve a calcular."],
];

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Arma y descarga `formato-lista-de-trozas.xlsx`, con el catálogo de especies para elegir el común. */
export async function descargarFormatoTrozas(especies: ReadonlyArray<{ comun: string; cientifico: string | null }>): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Trozas");
  ws.columns = COLUMNAS_FORMATO.map((c) => ({ header: c.titulo, key: c.campo, width: c.ancho }));
  const cabecera = ws.getRow(1);
  cabecera.font = { bold: true };
  cabecera.alignment = { vertical: "middle", wrapText: true };
  cabecera.height = 32;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getColumn("d1").numFmt = "0.0";
  ws.getColumn("d2").numFmt = "0.0";
  ws.getColumn("largo").numFmt = "0.00";
  ws.getColumn("cantidad").numFmt = "0";
  ws.getColumn("volumen").numFmt = "0.0000";

  const lista = wb.addWorksheet("Especies");
  lista.columns = [
    { header: "Nombre común", key: "comun", width: 24 },
    { header: "Nombre científico", key: "cientifico", width: 32 },
  ];
  lista.getRow(1).font = { bold: true };
  for (const e of especies) lista.addRow({ comun: e.comun, cientifico: e.cientifico ?? "" });
  const ultima = Math.max(2, especies.length + 1);

  /* A = científico, B = común, D = D1, E = D2, F = L, G = cantidad, H = volumen. */
  for (let r = 2; r <= TROZAS_POR_GUIA_MAX + 1; r++) {
    ws.getCell(`A${r}`).value = { formula: `IF(B${r}="","",IFERROR(VLOOKUP(B${r},Especies!$A$2:$B$${ultima},2,FALSE),""))`, result: "" };
    if (especies.length) {
      ws.getCell(`B${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`Especies!$A$2:$A$${ultima}`],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Especie",
        error: "No está en el catálogo del aserradero: revisa el nombre.",
      };
    }
    const d2 = `IF(N(E${r})>0,E${r},D${r})`;
    ws.getCell(`H${r}`).value = {
      formula: `IF(OR(N(D${r})<=0,N(F${r})<=0),"",ROUND(0.7854*((D${r}+${d2})/200)^2*F${r},4)*IF(N(G${r})>0,G${r},1))`,
      result: "",
    };
  }
  /* El total, fuera de las columnas que se leen al importar. */
  ws.getCell("J1").value = "Total m³";
  ws.getCell("J1").font = { bold: true };
  ws.getCell("J2").value = { formula: `SUM(H2:H${TROZAS_POR_GUIA_MAX + 1})`, result: 0 };
  ws.getCell("J2").numFmt = "0.0000";
  ws.getColumn(10).width = 12;

  const ayuda = wb.addWorksheet("Cómo llenarla");
  ayuda.columns = [
    { header: "Columna", key: "col", width: 20 },
    { header: "Qué va", key: "que", width: 100 },
  ];
  ayuda.getRow(1).font = { bold: true };
  for (const [col, que] of AYUDA) ayuda.addRow({ col, que });

  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: MIME_XLSX }), "formato-lista-de-trozas.xlsx");
}

// ── Leer ────────────────────────────────────────────────────────────────────

/** «(4) N. común o comercial» → ["4", "n", "comun", "o", "comercial"]. */
function palabras(c: Celda): string[] {
  return String(c ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function campoDe(c: Celda): CampoFormato | null {
  const p = palabras(c);
  const empieza = (pre: string) => p.some((x) => x.startsWith(pre));
  if (empieza("cientific")) return "cientifico";
  if (p.includes("comun") || p.includes("comercial") || p.includes("especie")) return "comun";
  if (empieza("codific") || p.includes("codigo") || p.includes("cod")) return "codigo";
  if (p.includes("d1") || (p.includes("diametro") && p.includes("mayor"))) return "d1";
  if (p.includes("d2") || (p.includes("diametro") && p.includes("menor"))) return "d2";
  if (p.includes("l") || p.includes("largo") || p.includes("longitud")) return "largo";
  if (empieza("cant")) return "cantidad";
  if (empieza("vol")) return "volumen";
  return null;
}

const texto = (c: Celda): string => (c == null ? "" : typeof c === "number" ? String(c) : String(c).trim());
const clave = (s: string) => palabras(s).join(" ");

export interface ResultadoFormato {
  trozas: TrozaAMano[];
  /** Cuántas trozas suman las filas (con su cantidad). */
  cuantas: number;
  /** «Fila 5: Falta D1» — las que no entraron. */
  errores: string[];
  /** Volumen del archivo distinto del Smalian de sus medidas (entraron con el de Smalian). */
  avisos: string[];
  /** El primer N° de la codificación, si la primera fila trae uno mayor que 1. */
  desde: number | null;
  /** No se encontró la fila de encabezados. */
  sinEncabezado: boolean;
}

/**
 * Las filas del archivo → trozas para «Anotar a mano». `cientificoDe` es el
 * del catálogo (común → científico): con él, una fila que trae sólo el
 * científico encuentra su común. `caben` = cuántas trozas entran todavía en
 * la guía (150 menos las elegidas): lo que pasa del tope queda afuera y se dice.
 */
export function trozasDelFormato(
  filas: readonly (readonly Celda[])[],
  o: { nombres: readonly string[]; cientificoDe: (comun: string) => string | null; caben?: number },
): ResultadoFormato {
  const r: ResultadoFormato = { trozas: [], cuantas: 0, errores: [], avisos: [], desde: null, sinEncabezado: false };
  let inicio = -1;
  let col: Partial<Record<CampoFormato, number>> = {};
  for (let i = 0; i < Math.min(filas.length, 15) && inicio < 0; i++) {
    const m: Partial<Record<CampoFormato, number>> = {};
    filas[i]!.forEach((c, j) => {
      const campo = campoDe(c);
      if (campo && m[campo] == null) m[campo] = j;
    });
    if (m.d1 != null && m.largo != null && (m.comun != null || m.cientifico != null)) [inicio, col] = [i, m];
  }
  if (inicio < 0) return { ...r, sinEncabezado: true };

  const comunDeCientifico = new Map<string, string>();
  for (const n of o.nombres) {
    const c = o.cientificoDe(n);
    if (c) comunDeCientifico.set(clave(c), n);
  }
  const caben = o.caben ?? TROZAS_POR_GUIA_MAX;
  let afuera = 0;
  for (let i = inicio + 1; i < filas.length; i++) {
    const f = filas[i]!;
    const v = (c: CampoFormato) => (col[c] == null ? "" : texto(f[col[c]!]));
    const [cientifico, comun, d1, d2, largo] = [v("cientifico"), v("comun"), v("d1"), v("d2"), v("largo")];
    /* Las filas del formato que no se llenaron traen sólo las fórmulas (el científico y el volumen vacíos). */
    if (!comun && !cientifico && !d1 && !d2 && !largo) continue;
    const n = i + 1;
    const especie = comun || comunDeCientifico.get(clave(cientifico)) || cientifico;
    const pareja = !d2 && Boolean(d1);
    const rev = revisarTrozaAMano({ especie, d1, d2: pareja ? d1 : d2, largo, cantidad: v("cantidad") });
    if (!rev.ok) {
      r.errores.push(`Fila ${n}: ${Object.values(rev.errores).join(", ")}`);
      continue;
    }
    if (r.cuantas + rev.troza.cantidad > caben) {
      afuera++;
      continue;
    }
    const troza: TrozaAMano = { ...rev.troza, ...(pareja ? { d2Supuesto: true } : {}) };
    if (r.trozas.length === 0) {
      const cod = v("codigo");
      if (/^\d+$/.test(cod) && Number(cod) > 1) r.desde = Number(cod);
    }
    const volArchivo = Number(v("volumen").replace(",", "."));
    const vol = volumenDeFila(troza);
    if (v("volumen") && Number.isFinite(volArchivo) && Math.abs(volArchivo - vol) >= 0.001) {
      r.avisos.push(`Fila ${n}: el archivo dice ${String(volArchivo).replace(".", ",")} m³ y Smalian da ${String(vol).replace(".", ",")} m³`);
    }
    r.trozas.push(troza);
    r.cuantas += troza.cantidad;
  }
  if (afuera) r.errores.push(`${afuera} fila${afuera === 1 ? "" : "s"} no entra${afuera === 1 ? "" : "n"}: la guía lleva hasta ${TROZAS_POR_GUIA_MAX} trozas`);
  return r;
}
