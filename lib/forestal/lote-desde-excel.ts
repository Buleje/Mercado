/**
 * Un lote de aserrío pegado desde el Excel del SNIFFS (Brandon 27-10: «importar
 * en Excel… esos datos importados se pondrán directamente al lote y se pondrán
 * ya como consumido»).
 *
 * El pegado es la lista de trozas del SNIFFS: Contrato · Número Resolución ·
 * Documento de Ingreso (GTF + su N°) · Troza Padre · código de la troza ·
 * Código Planta · Especie · Lote · D1 · D2 · Largo · Volumen · Tipo de Producto
 * · Estado Actual · Fecha del Estado. Las columnas se reconocen por su título
 * con el MISMO formato que ya lee el import del inventario
 * (`detectarColumnas("inventarioTrozas")`); sin títulos, se asume el orden de
 * esa lista.
 *
 * Acá sólo se LEE: cuál troza del libro es cada fila lo decide el servidor
 * (`lote-desde-excel-cruce.ts`), que es el que ve el patio.
 *
 * PURO y client-safe.
 */

import { partirPegado } from "./cubicacion-pegar";
import {
  convencionDeColumna,
  detectarColumnas,
  leerFecha,
  leerNumero,
  leerTexto,
  type ConvencionDecimal,
} from "./ctp-formatos-serfor";

/** Una fila del pegado, ya leída. */
export interface FilaLoteExcel {
  /** El N° de fila de la grilla (1-based), el que se ve a la izquierda. */
  fila: number;
  /** «Contrato» del SNIFFS: el código del permiso (título habilitante). */
  contrato: string | null;
  resolucion: string | null;
  /** «Documento de Ingreso»: el tipo («GTF»); su N° va en `gtf`. */
  tipoDocumento: string | null;
  gtf: string | null;
  codigoPlanta: string | null;
  /** El código con el que salió del bosque (`codificacion` en el libro). */
  codigoTroza: string | null;
  trozaPadre: string | null;
  especie: string | null;
  lote: string | null;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  volumenM3: number | null;
  tipoProducto: string | null;
  estado: string | null;
  /** «Fecha del Estado», `AAAA-MM-DD`: el día que el SNIFFS la pasó a consumo. */
  fecha: string | null;
}

type Clave = Exclude<keyof FilaLoteExcel, "fila">;

/** El orden de la lista de trozas del SNIFFS, para cuando se copian sólo los datos. */
const POR_POSICION: Partial<Record<Clave, number>> = {
  contrato: 0,
  resolucion: 1,
  tipoDocumento: 2,
  gtf: 3,
  trozaPadre: 4,
  codigoTroza: 5,
  codigoPlanta: 6,
  especie: 7,
  lote: 8,
  d1Cm: 9,
  d2Cm: 10,
  largoM: 11,
  volumenM3: 12,
  tipoProducto: 13,
  estado: 14,
  fecha: 15,
};

const NUMEROS = ["d1Cm", "d2Cm", "largoM", "volumenM3"] as const satisfies readonly Clave[];

/** El N° de una GTF: `019-001-0000012`. */
export const PATRON_GTF = /^\d{2,4}-\d{2,4}-\d{4,10}$/;

const normalizar = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Las columnas que pide el lote, desde la fila de títulos. Lo que el formato
 * del inventario no trae se completa acá:
 *  · «Lote»: el inventario no lo lee, el lote sí lo necesita;
 *  · el código de la troza: en la lista del SNIFFS va en una columna SIN
 *    título propio, pegada a «Troza Padre» (igual que el N° de GTF bajo
 *    «Documento de Ingreso», que ya resuelve `detectarColumnas`).
 */
function columnasDeTitulos(titulos: readonly string[]): Partial<Record<Clave, number>> | null {
  const m = detectarColumnas("inventarioTrozas", titulos);
  if (m.codigoPlanta == null || (m.volumenM3 == null && m.especie == null)) return null;
  const norm = titulos.map(normalizar);
  const col: Partial<Record<Clave, number>> = {};
  const poner = (clave: Clave, i: number | null | undefined) => {
    if (i != null) col[clave] = i;
  };
  poner("contrato", m.contrato);
  poner("resolucion", m.resolucion);
  poner("tipoDocumento", m.tipoDocumento);
  poner("gtf", m.numeroDocumento);
  poner("codigoPlanta", m.codigoPlanta);
  poner("codigoTroza", m.codigoTroza);
  poner("trozaPadre", m.trozaPadre);
  poner("especie", m.especie);
  poner("d1Cm", m.d1Cm);
  poner("d2Cm", m.d2Cm);
  poner("largoM", m.largoM);
  poner("volumenM3", m.volumenM3);
  poner("tipoProducto", m.tipoProducto);
  poner("estado", m.estado);
  poner("fecha", m.fechaEstado);
  const usadas = new Set(Object.values(m).filter((v): v is number => v != null));
  const lote = norm.findIndex(
    (t, i) => !usadas.has(i) && (t === "lote" || t.startsWith("lote ") || t === "n lote"),
  );
  if (lote >= 0) {
    col.lote = lote;
    usadas.add(lote);
  }
  if (col.codigoTroza == null && m.trozaPadre != null) {
    const sig = m.trozaPadre + 1;
    if (sig < norm.length && !norm[sig] && !usadas.has(sig)) col.codigoTroza = sig;
  }
  return col;
}

/** ¿La fila trae datos de una troza y no de la cabecera? Sin títulos se reconoce por el N° de GTF. */
const esFilaDeDatosSinTitulos = (celdas: readonly string[]) =>
  celdas.length >= 13 && PATRON_GTF.test((celdas[POR_POSICION.gtf!] ?? "").trim());

/**
 * La coma decimal se decide con TODO el pegado a la vista: «1,911» solo es
 * ambiguo (¿1911?), pero si el largo trae «7,9» o el volumen «2,16», esa hoja
 * escribe con coma decimal en todas sus columnas de medida. Leerlo como 1911 m³
 * sería poner mil veces la madera en el aviso.
 */
function convencionDelPegado(
  filas: readonly (readonly string[])[],
  col: Partial<Record<Clave, number>>,
): ConvencionDecimal {
  for (const c of NUMEROS) {
    const i = col[c];
    if (i != null && convencionDeColumna(filas, i) === "coma-decimal") return "coma-decimal";
  }
  return "auto";
}

// ── La grilla: «Pegar desde Excel» como la del cubicador ─────────────────────

/**
 * Las columnas de la grilla, en el MISMO orden que la lista de trozas del
 * SNIFFS (Brandon 28-10: «tal como la imagen, para simplemente copiar del
 * Excel todas las columnas y pegarlo ahí»): se copia desde la columna A y cada
 * dato cae en la suya, con o sin la fila de títulos.
 */
export const COLUMNAS_LOTE = [
  "contrato",
  "resolucion",
  "tipoDocumento",
  "gtf",
  "trozaPadre",
  "codigoTroza",
  "codigoPlanta",
  "especie",
  "lote",
  "d1Cm",
  "d2Cm",
  "largoM",
  "volumenM3",
  "tipoProducto",
  "estado",
  "fecha",
] as const satisfies readonly Clave[];
export type ColumnaLote = (typeof COLUMNAS_LOTE)[number];
/** Una fila de la grilla tal como se escribió o pegó: texto, sin leer todavía. */
export type FilaGrilla = Record<ColumnaLote, string>;

export const TITULO_COLUMNA_LOTE: Record<ColumnaLote, string> = {
  contrato: "Contrato (permiso)",
  resolucion: "N° resolución",
  tipoDocumento: "Documento",
  gtf: "N° de guía",
  trozaPadre: "Troza padre",
  codigoTroza: "Cód. troza",
  codigoPlanta: "Cód. planta",
  especie: "Especie",
  lote: "Lote",
  d1Cm: "D1 (cm)",
  d2Cm: "D2 (cm)",
  largoM: "Largo (m)",
  volumenM3: "Volumen (m³)",
  tipoProducto: "Tipo de producto",
  estado: "Estado actual",
  fecha: "Fecha del estado",
};

export const NUMERICAS_LOTE: ReadonlySet<ColumnaLote> = new Set<ColumnaLote>(["d1Cm", "d2Cm", "largoM", "volumenM3"]);

const FILAS_DE_ARRANQUE = 12;
const FILAS_DE_SOBRA = 3;

export const filaGrillaVacia = (): FilaGrilla =>
  Object.fromEntries(COLUMNAS_LOTE.map((c) => [c, ""])) as FilaGrilla;
export const esFilaGrillaVacia = (f: FilaGrilla): boolean => COLUMNAS_LOTE.every((c) => !f[c].trim());

/** Siempre quedan filas vacías al final para seguir escribiendo o pegando. */
export function conSobra(filas: readonly FilaGrilla[]): FilaGrilla[] {
  let ultima = -1;
  filas.forEach((f, i) => {
    if (!esFilaGrillaVacia(f)) ultima = i;
  });
  const largo = Math.max(FILAS_DE_ARRANQUE, ultima + 1 + FILAS_DE_SOBRA);
  const out = filas.slice(0, Math.max(largo, ultima + 1));
  while (out.length < largo) out.push(filaGrillaVacia());
  return out;
}

export interface PegadoEnGrilla {
  filas: FilaGrilla[];
  /** Vino la fila de títulos: cada columna cayó en la suya. */
  conTitulos: boolean;
  /** La lista entera del SNIFFS sin títulos: se leyó en su orden. */
  porPosicion: boolean;
  /** Cuántas filas entraron. */
  pegadas: number;
}

/**
 * Pega el portapapeles en la grilla desde una celda, como el cubicador:
 *  · con la fila de títulos del SNIFFS, cada columna cae en la suya, hizo clic
 *    donde haya hecho clic (sólo cuenta la fila);
 *  · con la lista entera sin títulos, en el orden de la lista del SNIFFS;
 *  · con columnas sueltas, desde la celda hacia la derecha y hacia abajo.
 * Con columnas reconocidas, la fila de TOTAL y las separadoras no entran.
 */
export function pegarEnGrilla(
  filas: readonly FilaGrilla[],
  texto: string,
  desde: { fila: number; col: number },
): PegadoEnGrilla {
  const celdas = partirPegado(texto).map((f) => f.map((c) => c.trim()));
  let col: Partial<Record<Clave, number>> | null = null;
  let cuerpo = celdas;
  let conTitulos = false;
  let porPosicion = false;
  /* Los títulos pueden no estar en la primera fila (copió también el título
     de la hoja): se buscan en las primeras cinco. */
  for (let i = 0; i < Math.min(5, celdas.length) && !col; i++) {
    col = columnasDeTitulos(celdas[i]);
    if (col) {
      cuerpo = celdas.slice(i + 1);
      conTitulos = true;
    }
  }
  if (!col && celdas.some(esFilaDeDatosSinTitulos)) {
    col = POR_POSICION;
    porPosicion = true;
    cuerpo = celdas.filter(esFilaDeDatosSinTitulos);
  }
  if (col) {
    const { codigoPlanta: p, codigoTroza: t } = col;
    cuerpo = cuerpo.filter((c) => Boolean((p != null && c[p]) || (t != null && c[t])));
  }
  const out = filas.map((f) => ({ ...f }));
  while (out.length < desde.fila + cuerpo.length) out.push(filaGrillaVacia());
  cuerpo.forEach((c, k) => {
    const d = out[desde.fila + k];
    if (col) {
      for (const clave of COLUMNAS_LOTE) {
        const i = col[clave];
        if (i != null) d[clave] = c[i] ?? "";
      }
      return;
    }
    c.forEach((v, j) => {
      const clave = COLUMNAS_LOTE[desde.col + j];
      if (clave) d[clave] = v;
    });
  });
  return { filas: conSobra(out), conTitulos, porPosicion, pegadas: cuerpo.length };
}

const INDICE_LOTE = Object.fromEntries(COLUMNAS_LOTE.map((c, i) => [c, i])) as Record<ColumnaLote, number>;

/**
 * La grilla → lo que cruza el servidor. `fila` es el N° de fila de la grilla
 * (1-based), el que se ve a la izquierda. Una fila sin código no es una troza.
 */
export function filasDeGrilla(filas: readonly FilaGrilla[]): FilaLoteExcel[] {
  const conv = convencionDelPegado(
    filas.map((f) => COLUMNAS_LOTE.map((c) => f[c])),
    INDICE_LOTE,
  );
  return filas.flatMap((f, i) => {
    if (!f.codigoPlanta.trim() && !f.codigoTroza.trim()) return [];
    return [
      {
        fila: i + 1,
        contrato: leerTexto(f.contrato),
        resolucion: leerTexto(f.resolucion),
        tipoDocumento: leerTexto(f.tipoDocumento),
        gtf: leerTexto(f.gtf),
        codigoPlanta: leerTexto(f.codigoPlanta),
        codigoTroza: leerTexto(f.codigoTroza),
        trozaPadre: leerTexto(f.trozaPadre),
        especie: leerTexto(f.especie),
        lote: leerTexto(f.lote),
        d1Cm: leerNumero(f.d1Cm, conv),
        d2Cm: leerNumero(f.d2Cm, conv),
        largoM: leerNumero(f.largoM, conv),
        volumenM3: leerNumero(f.volumenM3, conv),
        tipoProducto: leerTexto(f.tipoProducto),
        estado: leerTexto(f.estado),
        fecha: leerFecha(f.fecha),
      },
    ];
  });
}

/** Las filas de UN lote del pegado. */
export interface GrupoDeLote {
  /** El N° de lote del SNIFFS (`28-2026`); `null` si la columna no vino. */
  lote: string | null;
  filas: FilaLoteExcel[];
  /** El día que entró a consumo según el SNIFFS: el más repetido del grupo. */
  fecha: string | null;
}

/**
 * Un pegado puede traer varios lotes (la lista entera del SNIFFS): cada uno es
 * un lote del libro. En el orden en que aparecen.
 */
export function agruparPorLote(filas: readonly FilaLoteExcel[]): GrupoDeLote[] {
  const grupos = new Map<string, FilaLoteExcel[]>();
  for (const f of filas) {
    const k = (f.lote ?? "").trim();
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return [...grupos.entries()].map(([lote, fs]) => ({
    lote: lote || null,
    filas: fs,
    fecha: masRepetida(fs.map((f) => f.fecha)),
  }));
}

function masRepetida(xs: readonly (string | null)[]): string | null {
  const cuenta = new Map<string, number>();
  for (const x of xs) if (x) cuenta.set(x, (cuenta.get(x) ?? 0) + 1);
  let mejor: string | null = null;
  for (const [x, n] of cuenta) if (mejor == null || n > (cuenta.get(mejor) ?? 0)) mejor = x;
  return mejor;
}
