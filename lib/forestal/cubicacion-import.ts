/**
 * cubicacion-import — interpreta un Excel/CSV de piezas y lo convierte en
 * filas del lote cubicado. PURO y client-safe: recibe una matriz de celdas
 * (la lectura del archivo vive en `cubicacion-import-file.ts`) y no toca ni el
 * DOM ni exceljs, así se testea aislado.
 *
 * FILOSOFÍA: el operario arma su Excel como le sale — columnas en cualquier
 * orden, encabezados con o sin acento, "Grosor" en vez de "Espesor". El parser
 * se adapta a eso; lo que NO puede leer lo reporta con el número de fila, nunca
 * lo inventa. Cada pieza se RECUBICA acá (no se cree un pie tablar que venga en
 * el archivo).
 */

import { cubicarPieza, ESPECIES_MADERA, medidaSospechosa, type PiezaCubicada, type Unidad } from "./cubicacion";

/** Una celda del archivo tal como la devuelve la lectura (string o número). */
export type Celda = string | number | null | undefined;

export interface PiezaImportada extends PiezaCubicada {
  /** Fila del archivo de la que salió (1-based, para el mensaje). */
  filaOrigen: number;
  /** true si la medida quedó fuera de lo común (se importa igual, resaltada). */
  sospechosa: boolean;
}

export interface ResultadoImport {
  piezas: PiezaImportada[];
  /** Filas que no se pudieron leer, con el motivo. */
  errores: { fila: number; motivo: string }[];
  /** Encabezados detectados → índice de columna. */
  columnas: Record<Campo, number | null>;
}

type Campo = "cantidad" | "espesor" | "ancho" | "largo" | "especie" | "uEspesor" | "uAncho" | "uLargo";

export const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Sinónimos de cada encabezado, como los escribe un maderero. */
const ALIAS: Record<Campo, string[]> = {
  cantidad: ["cantidad", "cant", "cant.", "piezas", "pzas", "unidades", "und", "nro", "n"],
  espesor: ["espesor", "esp", "esp.", "grosor", "grueso", "e"],
  ancho: ["ancho", "anch", "anchura", "a"],
  largo: ["largo", "long", "longitud", "l", "lar"],
  especie: ["especie", "madera", "tipo", "variedad"],
  uEspesor: ["u.esp", "uesp", "unidad espesor", "und espesor"],
  uAncho: ["u.anc", "uanc", "unidad ancho", "und ancho"],
  uLargo: ["u.lar", "ular", "unidad largo", "und largo"],
};

const UNIDADES_VALIDAS: Unidad[] = ["pulg", "cm", "pies", "m"];
function normalizarUnidad(v: Celda, def: Unidad): Unidad {
  const s = sinAcentos(String(v ?? ""));
  if (s.startsWith("pulg") || s === '"' || s === "in" || s === "pu") return "pulg";
  if (s === "cm" || s.startsWith("centi")) return "cm";
  if (s.startsWith("pie") || s === "ft" || s === "'") return "pies";
  if (s === "m" || s.startsWith("metro") || s === "mt" || s === "mts") return "m";
  return def;
}

/** Un número tolerante: "1.234,5" (formato peruano), "2 1/2" y basura → null. */
export function aNumero(v: Celda): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (s === "") return null;
  s = s.replace(/(pulg|cm|pies|pie|mts?|metros?|["'])/gi, "").trim();
  // "2 1/2" → 2.5
  const mixto = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixto) return Number(mixto[1]) + Number(mixto[2]) / Number(mixto[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  // Formato peruano "1.234,5" → 1234.5; simple "2,5" → 2.5
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Especie del archivo → nombre canónico si se parece a uno conocido. */
export function normalizarEspecie(v: Celda): string | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const clave = sinAcentos(s);
  const exacta = ESPECIES_MADERA.find((e) => sinAcentos(e) === clave);
  if (exacta) return exacta;
  const prefijo = ESPECIES_MADERA.find((e) => sinAcentos(e).startsWith(clave) || clave.startsWith(sinAcentos(e)));
  if (prefijo) return prefijo;
  // Especie desconocida: se respeta lo que escribió el usuario (capitalizado).
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** ¿Esta fila es el encabezado? (nombra al menos 3 de las 4 columnas base) */
function esFilaEncabezado(fila: Celda[]): boolean {
  const textos = fila.map((c) => sinAcentos(String(c ?? "")));
  const base: Campo[] = ["espesor", "ancho", "largo", "especie"];
  const encontrados = base.filter((campo) => textos.some((t) => ALIAS[campo].includes(t)));
  return encontrados.length >= 3;
}

/** Mapea cada campo a su columna según los alias del encabezado. */
function mapearColumnas(header: Celda[]): Record<Campo, number | null> {
  const textos = header.map((c) => sinAcentos(String(c ?? "")));
  const cols = {} as Record<Campo, number | null>;
  for (const campo of Object.keys(ALIAS) as Campo[]) {
    cols[campo] = textos.findIndex((t) => ALIAS[campo].includes(t));
    if (cols[campo] === -1) cols[campo] = null;
  }
  return cols;
}

let contador = 0;

/**
 * Interpreta la matriz de celdas. Busca el encabezado, mapea columnas y
 * convierte cada fila con datos en una pieza cubicada. Espesor y ancho se
 * asumen en pulgadas y el largo en pies (convención peruana) salvo que el
 * archivo traiga columnas de unidad.
 */
export function parsearFilasImportadas(matriz: Celda[][]): ResultadoImport {
  const errores: { fila: number; motivo: string }[] = [];
  const piezas: PiezaImportada[] = [];

  const filas = matriz.filter((f) => Array.isArray(f));
  const idxHeader = filas.findIndex(esFilaEncabezado);
  if (idxHeader === -1) {
    return {
      piezas: [],
      errores: [{ fila: 1, motivo: "No encontré las columnas Especie, Espesor, Ancho y Largo. Revisá que la primera fila tenga esos títulos." }],
      columnas: { cantidad: null, espesor: null, ancho: null, largo: null, especie: null, uEspesor: null, uAncho: null, uLargo: null },
    };
  }

  const columnas = mapearColumnas(filas[idxHeader]);
  const faltan = (["espesor", "ancho", "largo"] as Campo[]).filter((c) => columnas[c] === null);
  if (faltan.length > 0) {
    return {
      piezas: [],
      errores: [{ fila: idxHeader + 1, motivo: `Faltan columnas obligatorias: ${faltan.join(", ")}.` }],
      columnas,
    };
  }

  const cel = (fila: Celda[], campo: Campo): Celda => {
    const i = columnas[campo];
    return i === null ? undefined : fila[i];
  };

  for (let r = idxHeader + 1; r < filas.length; r++) {
    const fila = filas[r];
    const filaNro = r + 1; // 1-based para el usuario
    // Fila vacía: se saltea sin ruido.
    if (fila.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;

    const espesor = aNumero(cel(fila, "espesor"));
    const ancho = aNumero(cel(fila, "ancho"));
    const largo = aNumero(cel(fila, "largo"));
    if (espesor === null || ancho === null || largo === null) {
      errores.push({ fila: filaNro, motivo: "Espesor, ancho o largo no es un número válido." });
      continue;
    }
    if (!(espesor > 0 && ancho > 0 && largo > 0)) {
      errores.push({ fila: filaNro, motivo: "Las medidas tienen que ser mayores que cero." });
      continue;
    }

    const cantRaw = aNumero(cel(fila, "cantidad"));
    const cantidad = cantRaw && cantRaw > 0 ? Math.round(cantRaw) : 1;
    const uEspesor = normalizarUnidad(cel(fila, "uEspesor"), "pulg");
    const uAncho = normalizarUnidad(cel(fila, "uAncho"), "pulg");
    const uLargo = normalizarUnidad(cel(fila, "uLargo"), "pies");
    const especie = normalizarEspecie(cel(fila, "especie"));

    const base = { cantidad, espesor, ancho, largo, uEspesor, uAncho, uLargo };
    const { pieTablar, m3 } = cubicarPieza(base);
    piezas.push({
      id: `imp-${Date.now()}-${contador++}`,
      ...base,
      especie,
      pieTablar,
      m3,
      filaOrigen: filaNro,
      // Sólo se avalúa lo raro cuando está en las unidades comerciales.
      sospechosa: uEspesor === "pulg" && uAncho === "pulg" && uLargo === "pies"
        ? medidaSospechosa(espesor, ancho, largo)
        : false,
    });
  }

  return { piezas, errores, columnas };
}

/** Encabezado + una fila de ejemplo para la plantilla descargable. */
export const PLANTILLA_IMPORT: { headers: string[]; ejemplo: (string | number)[][] } = {
  headers: ["Especie", "Cantidad", "Espesor", "Ancho", "Largo"],
  ejemplo: [
    ["Tornillo", 5, 2, 8, 10],
    ["Cedro", 3, 2, 6, 8],
    ["Capirona", 10, 1.5, 4, 12],
  ],
};

export const UNIDADES_IMPORT = UNIDADES_VALIDAS;
