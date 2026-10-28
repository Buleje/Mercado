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
  /** La fila como la ve en su hoja (1-based; con títulos, la primera de datos es la 2). */
  fila: number;
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

export interface PegadoLote {
  filas: FilaLoteExcel[];
  /** `false` = no vino la fila de títulos y se leyó por posición. */
  conTitulos: boolean;
  /** Por qué no se pudo leer, cuando no salió ninguna fila. */
  error: string | null;
}

type Clave = Exclude<keyof FilaLoteExcel, "fila">;

/** El orden de la lista de trozas del SNIFFS, para cuando se copian sólo los datos. */
const POR_POSICION: Partial<Record<Clave, number>> = {
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

/** El texto del portapapeles → las filas del lote. */
export function leerPegadoLote(texto: string): PegadoLote {
  const celdas = partirPegado(texto).map((f) => f.map((c) => c.trim()));
  if (celdas.length === 0 || celdas.every((f) => f.every((c) => !c))) {
    return { filas: [], conTitulos: false, error: "No hay nada pegado." };
  }
  /* Los títulos pueden no estar en la primera fila (copió también el título
     de la hoja): se buscan en las primeras cinco. */
  let inicio = 0;
  let col: Partial<Record<Clave, number>> | null = null;
  for (let i = 0; i < Math.min(5, celdas.length) && !col; i++) {
    col = columnasDeTitulos(celdas[i]);
    if (col) inicio = i + 1;
  }
  const conTitulos = col != null;
  if (!col) {
    if (!celdas.some(esFilaDeDatosSinTitulos)) {
      return {
        filas: [],
        conTitulos: false,
        error:
          "No reconozco las columnas. Copia también la fila de títulos (Contrato, Documento de Ingreso, Código Planta, Volumen…).",
      };
    }
    col = POR_POSICION;
  }
  const datos = celdas.slice(inicio);
  const conv = convencionDelPegado(datos, col);
  const filas: FilaLoteExcel[] = [];
  datos.forEach((c, k) => {
    const txt = (clave: Clave) => {
      const i = col![clave];
      return i == null ? null : leerTexto(c[i]);
    };
    const num = (clave: Clave) => {
      const i = col![clave];
      return i == null ? null : leerNumero(c[i], conv);
    };
    const fila: FilaLoteExcel = {
      fila: inicio + k + 1,
      gtf: txt("gtf"),
      codigoPlanta: txt("codigoPlanta"),
      codigoTroza: txt("codigoTroza"),
      trozaPadre: txt("trozaPadre"),
      especie: txt("especie"),
      lote: txt("lote"),
      d1Cm: num("d1Cm"),
      d2Cm: num("d2Cm"),
      largoM: num("largoM"),
      volumenM3: num("volumenM3"),
      tipoProducto: txt("tipoProducto"),
      estado: txt("estado"),
      fecha: col!.fecha == null ? null : leerFecha(c[col!.fecha]),
    };
    /* Sin código ni especie no es una troza: la fila de TOTAL o una separadora. */
    if (!fila.codigoPlanta && !fila.codigoTroza) return;
    if (!conTitulos && !esFilaDeDatosSinTitulos(c)) return;
    filas.push(fila);
  });
  return {
    filas,
    conTitulos,
    error:
      filas.length === 0
        ? "No encontré trozas en lo que pegaste: cada fila necesita su Código Planta."
        : null,
  };
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
