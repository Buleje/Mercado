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

import { COMANDOS_DEFAULT, cubicarPieza, detectarComando, ESPECIES_MADERA, leerDictado, medidaSospechosa, partirConFijas, type ComandosCfg, type MedidasFijas, type PiezaCubicada, type Unidad } from "./cubicacion";

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

/** `columnas` no aplica cuando el origen no es una matriz de celdas (foto/audio). */
const COLUMNAS_SIN_MAPEO: Record<Campo, number | null> = {
  cantidad: null, espesor: null, ancho: null, largo: null, especie: null, uEspesor: null, uAncho: null, uLargo: null,
};

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

/** Una pieza tal como la devuelve el OCR de la foto (sin cubicar todavía). */
export interface PiezaOcrRaw {
  cantidad: number;
  /** Pulgadas. */
  espesor: number;
  /** Pulgadas. */
  ancho: number;
  /** Pies. */
  largo: number;
  especie: string;
  /** La IA marcó ese número como ambiguo/dudoso al leer la letra manuscrita. */
  incierto: boolean;
}

let contadorOcr = 0;

/**
 * Convierte lo que devolvió la foto (OCR con IA) al MISMO formato que el
 * import de Excel: se recubica acá (nunca se confía en un pie tablar que
 * "diga" la IA) y una fila `incierto` entra igual que una `sospechosa` por
 * medida rara — el operador la ve resaltada y decide, la IA nunca corrige
 * sola. El modelo ya devuelve espesor/ancho en pulgadas y largo en pies
 * (se lo pide el prompt), así que acá se trata igual que una fila de Excel
 * en unidades comerciales.
 */
export function interpretarOcrPiezas(piezas: PiezaOcrRaw[]): ResultadoImport {
  const errores: { fila: number; motivo: string }[] = [];
  const out: PiezaImportada[] = [];

  piezas.forEach((p, i) => {
    const filaNro = i + 1;
    if (!(p.espesor > 0 && p.ancho > 0 && p.largo > 0)) {
      errores.push({ fila: filaNro, motivo: "No se pudo leer el espesor, ancho o largo de esta fila en la foto." });
      return;
    }
    const cantidad = p.cantidad > 0 ? Math.round(p.cantidad) : 1;
    const especie = normalizarEspecie(p.especie);
    const base = { cantidad, espesor: p.espesor, ancho: p.ancho, largo: p.largo, uEspesor: "pulg" as Unidad, uAncho: "pulg" as Unidad, uLargo: "pies" as Unidad };
    const { pieTablar, m3 } = cubicarPieza(base);
    out.push({
      id: `ocr-p-${Date.now()}-${contadorOcr++}`,
      ...base,
      especie,
      pieTablar,
      m3,
      filaOrigen: filaNro,
      sospechosa: p.incierto || medidaSospechosa(p.espesor, p.ancho, p.largo),
    });
  });

  return { piezas: out, errores, columnas: COLUMNAS_SIN_MAPEO };
}

let contadorAudio = 0;

/**
 * Separa el transcript en oraciones por `.!?;` y saltos de línea — SALVO un
 * punto entre dos dígitos ("2.5"), que es un decimal, no un final de oración.
 */
function separarEnOraciones(texto: string): string[] {
  const DECIMAL = "․"; // "one dot leader" — no aparece en un transcript real
  const protegido = texto.replace(/(\d)\.(\d)/g, `$1${DECIMAL}$2`);
  return protegido.split(/[.!?;\n]+/).map((s) => s.trim().replace(new RegExp(DECIMAL, "g"), ".")).filter(Boolean);
}

/**
 * Interpreta el TEXTO transcrito de un audio dictado en continuo — tabla por
 * tabla, con los MISMOS comandos que el dictado por voz en vivo: cantidad
 * ("cinco tablas de dos por ocho por diez"), especie ("especie cedro"),
 * medidas fijas ("pon fijo el largo a diez" / "quitá el fijo") y corrección
 * ("eliminá el último"). Reusa `detectarComando`/`leerDictado`/
 * `partirConFijas` — el MISMO parser que usa el micrófono en vivo, una sola
 * fuente de verdad para "qué significa cada comando" y "cómo se separan los
 * números dictados". `cfg` es el vocabulario de frases-gatillo: pasale el que
 * el operario personalizó en Ajustes (`loadConfig().comandos`) para que
 * "graba" también reconozca sus propias frases, no sólo las DEFAULT.
 *
 * El transcript se recorre ORACIÓN por ORACIÓN — separadas por los puntos que
 * Whisper mete en cada pausa real del audio — en vez de como un bloque único
 * de números. Así una medida mal escuchada o un comando en el medio del
 * audio queda CONTENIDO en su propia oración: no corre (desalinea) todas las
 * piezas que vienen después, que es lo que pasaba tratando el archivo entero
 * como una sola tira de números. Lo que no cierra en una pieza completa se
 * reporta con la oración exacta de la que salió — nunca se inventa una
 * tercera medida ni se adivina a qué pieza pertenecía un número suelto.
 */
export function interpretarDictadoAudio(texto: string, cfg: ComandosCfg = COMANDOS_DEFAULT): ResultadoImport {
  const errores: { fila: number; motivo: string }[] = [];
  const out: PiezaImportada[] = [];

  const oraciones = separarEnOraciones(texto);
  if (oraciones.length === 0) {
    errores.push({ fila: 1, motivo: "No se reconoció ningún número en el audio. Dictá más despacio y separá bien cada medida." });
    return { piezas: out, errores, columnas: COLUMNAS_SIN_MAPEO };
  }

  let fijas: MedidasFijas = {};
  let especieActual: string | undefined;
  let duenoActual: string | undefined;
  let carry: number[] = [];

  const agregarPieza = (espesor: number, ancho: number, largo: number, cantidad: number) => {
    const base = { cantidad, espesor, ancho, largo, uEspesor: "pulg" as Unidad, uAncho: "pulg" as Unidad, uLargo: "pies" as Unidad };
    const { pieTablar, m3 } = cubicarPieza(base);
    out.push({
      id: `aud-p-${Date.now()}-${contadorAudio++}`,
      ...base,
      especie: especieActual,
      dueno: duenoActual,
      pieTablar,
      m3,
      filaOrigen: out.length + 1,
      sospechosa: medidaSospechosa(espesor, ancho, largo),
    });
  };

  oraciones.forEach((oracion, i) => {
    const filaNro = i + 1;
    const cmd = detectarComando(oracion, cfg);
    if (cmd) {
      // Fijar/desfijar cambia cuántos números trae cada pieza: lo que había
      // quedado a medio dictar con la regla anterior ya no cierra — mejor
      // avisar que perderlo en silencio.
      if (cmd.tipo === "fijar" || cmd.tipo === "desfijar") {
        if (carry.length > 0) {
          errores.push({ fila: filaNro, motivo: `Quedaron ${carry.length} número(s) sueltos sin formar pieza antes de "${oracion}": ${carry.join(", ")}.` });
        }
        carry = [];
        if (cmd.tipo === "fijar") fijas = { ...fijas, [cmd.dimension]: cmd.valor };
        else if (cmd.dimension) { const next = { ...fijas }; delete next[cmd.dimension]; fijas = next; }
        else fijas = {};
      } else if (cmd.tipo === "especie") {
        const encontrada = ESPECIES_MADERA.find((e) => sinAcentos(e).startsWith(cmd.palabra));
        if (encontrada) especieActual = encontrada;
        else errores.push({ fila: filaNro, motivo: `No reconocí la especie "${cmd.palabra}" dictada en "${oracion}" — lo que sigue se importa sin especie hasta que la corrijas.` });
      } else if (cmd.tipo === "dueno") {
        // Sin lista cerrada (el dueño no es un catálogo fijo como la especie):
        // lo que se dictó SE CREA, capitalizado, y se aplica a lo que sigue.
        duenoActual = cmd.palabra.charAt(0).toUpperCase() + cmd.palabra.slice(1);
      } else if (cmd.tipo === "borrar-ultimo") {
        if (out.length > 0) out.pop();
        else errores.push({ fila: filaNro, motivo: `Dijiste "${oracion}" pero todavía no había ninguna pieza para quitar.` });
      }
      // pausar/continuar/resumen/total no aplican a un archivo ya grabado.
      return;
    }

    const { cantidad, nums } = leerDictado(oracion, fijas, carry.length);
    const todos = [...carry, ...nums];
    if (todos.length === 0) return; // oración sin números ni comando: ruido de la transcripción, se ignora

    const { piezas: trios, resto } = partirConFijas(todos, fijas);
    trios.forEach((t) => agregarPieza(t.espesor, t.ancho, t.largo, cantidad));
    carry = resto;
  });

  if (carry.length > 0) {
    errores.push({
      fila: out.length + 1,
      motivo: `Quedaron ${carry.length} número${carry.length === 1 ? "" : "s"} suelto${carry.length === 1 ? "" : "s"} al final sin formar una pieza completa: ${carry.join(", ")}.`,
    });
  }

  if (out.length === 0 && errores.length === 0) {
    errores.push({ fila: 1, motivo: "No se reconoció ningún número en el audio. Dictá más despacio y separá bien cada medida." });
  }

  return { piezas: out, errores, columnas: COLUMNAS_SIN_MAPEO };
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
