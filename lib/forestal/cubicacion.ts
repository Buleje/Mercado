/**
 * cubicacion.ts — cubicación de madera aserrada (pie tablar + m³) y parser de
 * dictado por voz en español. PURO y client-safe (sin prisma, sin fetch): se
 * importa en el componente y es testeable de forma aislada.
 *
 * Convención peruana de comercio de madera aserrada:
 *   - Espesor y ancho se miden en PULGADAS, el largo en PIES.
 *   - Unidad de venta = PIE TABLAR (PT): PT = (espesor" × ancho" × largo_pies) / 12.
 *   - 1 m³ ≈ 423.78 PT.
 */

export type Unidad = "pulg" | "cm" | "pies" | "m";

export interface PiezaCubicada {
  id: string;
  cantidad: number;
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
  especie?: string;
  /** Pie tablar total (ya multiplicado por cantidad). */
  pieTablar: number;
  /** m³ total (ya multiplicado por cantidad). */
  m3: number;
}

export const PT_POR_M3 = 423.78;

/** Especies comerciales de la Selva Central — single-source para todas las
 *  herramientas forestales (cubicadores, calculadoras). */
export const ESPECIES_MADERA = [
  "Tornillo", "Cedro", "Capirona", "Shihuahuaco", "Cumala", "Moena",
  "Estoraque", "Lupuna", "Bolaina", "Catahua", "Copaiba", "Ishpingo", "Caoba", "Marupá",
] as const;

// ─── Conversiones de longitud ───────────────────────────────────────────────
const toInches = (v: number, u: Unidad): number =>
  u === "pulg" ? v : u === "cm" ? v / 2.54 : u === "m" ? v * 39.3700787 : v * 12;
const toFeet = (v: number, u: Unidad): number =>
  u === "pies" ? v : u === "pulg" ? v / 12 : u === "m" ? v * 3.2808399 : v / 30.48;
const toMeters = (v: number, u: Unidad): number =>
  u === "m" ? v : u === "pulg" ? v * 0.0254 : u === "cm" ? v / 100 : v * 0.3048;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Cubica una pieza: pie tablar y m³ TOTALES (× cantidad). El PT usa la fórmula
 * comercial (espesor" × ancho" × largo_pies ÷ 12); el m³ es el volumen real.
 */
export function cubicarPieza(p: {
  cantidad: number;
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
}): { pieTablar: number; m3: number } {
  const espPulg = toInches(p.espesor, p.uEspesor);
  const anchoPulg = toInches(p.ancho, p.uAncho);
  const largoPies = toFeet(p.largo, p.uLargo);
  const ptUnit = (espPulg * anchoPulg * largoPies) / 12;
  const m3Unit = toMeters(p.espesor, p.uEspesor) * toMeters(p.ancho, p.uAncho) * toMeters(p.largo, p.uLargo);
  const cant = p.cantidad > 0 ? p.cantidad : 1;
  return { pieTablar: r2(ptUnit * cant), m3: r4(m3Unit * cant) };
}

// ─── Parser de dictado por voz ──────────────────────────────────────────────

const ONES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
  ochenta: 80, noventa: 90,
};

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Convierte palabras-número a dígitos, resolviendo compuestos "treinta y cinco". */
function wordsToDigits(text: string): string {
  const tokens = text.split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in TENS) {
      // "treinta y cinco" → 35 (consume 3 tokens); "treinta" solo → 30.
      if (tokens[i + 1] === "y" && tokens[i + 2] in ONES && ONES[tokens[i + 2]] < 10) {
        out.push(String(TENS[t] + ONES[tokens[i + 2]]));
        i += 2;
      } else {
        out.push(String(TENS[t]));
      }
    } else if (t in ONES) {
      out.push(String(ONES[t]));
    } else {
      out.push(t);
    }
  }
  return out.join(" ");
}

export interface DictadoParse {
  ok: boolean;
  cantidad: number;
  espesor: number | null;
  ancho: number | null;
  largo: number | null;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
  especie?: string;
  raw: string;
}

/**
 * Interpreta un dictado como "cinco piezas de dos por ocho por diez" o
 * "espesor 2 ancho 8 largo 3 metros". Default de unidades: espesor y ancho en
 * pulgadas, largo en pies (convención peruana). Devuelve ok=false si no logra
 * extraer las 3 dimensiones — el UI cae al ingreso manual.
 */
/**
 * Normaliza un dictado a texto con dígitos: acentos fuera, separadores a "por",
 * palabras-número a dígitos y decimales hablados ("dos punto cinco" → 2.5).
 * Base compartida por parseDictado / mejoresNumeros / parseVozLote.
 */
function normalizeText(input: string): string {
  let s = " " + stripAccents(input.toLowerCase()) + " ";
  s = s.replace(/\s[x×*]\s/g, " por ");
  s = wordsToDigits(s);
  s = s.replace(/(\d+)\s+(?:punto|coma)\s+(\d+)/g, "$1.$2");
  s = s.replace(/(\d+)\s+y\s+3\s+cuartos?/g, "$1.75");
  s = s.replace(/(\d+)\s+y\s+cuarto/g, "$1.25");
  s = s.replace(/(\d+)\s+y\s+medi[oa]/g, "$1.5");
  s = s.replace(/\bmedi[oa]\b/g, "0.5");
  return s;
}

export function parseDictado(input: string): DictadoParse {
  const s = normalizeText(input);

  const num = (re: RegExp): number | null => {
    const m = s.match(re);
    return m ? parseFloat(m[1]) : null;
  };

  // Cantidad explícita: "5 piezas / tablas / tablones / listones / unidades".
  const cantMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:piezas?|tablas?|tablones?|listones?|unidades?|pzas?|pz)\b/);
  const cantidad = cantMatch ? Math.max(1, Math.round(parseFloat(cantMatch[1]))) : 1;

  // Dimensiones con etiqueta explícita.
  let espesor = num(/(?:espesor|grueso|grosor)\s+(?:de\s+)?(\d+(?:\.\d+)?)/);
  let ancho = num(/\bancho\s+(?:de\s+)?(\d+(?:\.\d+)?)/);
  let largo = num(/(?:largo|longitud|long)\s+(?:de\s+)?(\d+(?:\.\d+)?)/);

  // Sin etiquetas: tomar la secuencia de números (excluyendo la cantidad).
  if (espesor == null || ancho == null || largo == null) {
    let pool = s;
    if (cantMatch) pool = pool.replace(cantMatch[0], " ");
    const nums = (pool.match(/\d+(?:\.\d+)?/g) ?? []).map(parseFloat);
    if (nums.length >= 3) {
      const dims = nums.slice(-3); // las últimas 3 = E × A × L
      espesor = espesor ?? dims[0];
      ancho = ancho ?? dims[1];
      largo = largo ?? dims[2];
    }
  }

  // Unidades: default pulg/pulg/pies; overrides por palabra clave.
  let uEspesor: Unidad = "pulg", uAncho: Unidad = "pulg", uLargo: Unidad = "pies";
  if (/\bcent[i]metros?\b|\bcm\b/.test(s)) { uEspesor = "cm"; uAncho = "cm"; }
  if (/\bmetros?\b|\bmts?\b/.test(s)) uLargo = "m";
  if (/\bpies?\b/.test(s)) uLargo = "pies";

  const especieMatch = s.match(/especie\s+([a-z]+)/);
  const especie = especieMatch ? especieMatch[1] : undefined;

  const ok = espesor != null && ancho != null && largo != null && espesor > 0 && ancho > 0 && largo > 0;
  return { ok, cantidad, espesor, ancho, largo, uEspesor, uAncho, uLargo, especie, raw: input };
}

/**
 * Modo "3 números seguidos" para el dictado continuo (espesor · ancho · largo).
 * Recibe las N alternativas que devuelve el reconocedor y elige la que mejor
 * parsea. Si el reconocedor pegó tres dígitos ("dos seis ocho" → "268"), lo
 * separa como fallback. Pensado para dictar solo los números, sin "por".
 */
export function parseVozDims(alternativas: string[]): DictadoParse {
  const alts = alternativas.filter(Boolean);
  // 1) La primera alternativa que dé 3 dimensiones válidas gana.
  for (const a of alts) {
    const p = parseDictado(a);
    if (p.ok) return p;
  }
  // 2) Fallback: un único token de 3 dígitos 1-9 pegados (dos seis ocho → 268).
  for (const a of alts) {
    const nums = a.match(/\d+/g);
    if (nums && nums.length === 1 && /^[1-9]{3}$/.test(nums[0])) {
      const d = nums[0].split("").map(Number);
      return { ok: true, cantidad: 1, espesor: d[0], ancho: d[1], largo: d[2], uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", raw: a };
    }
  }
  return parseDictado(alts[0] ?? "");
}

/**
 * Extrae los números del dictado RESPETANDO EL ORDEN. Confía en la hipótesis
 * #1 del reconocedor (alt[0], la más probable — nunca reordena los dígitos que
 * dictaste); solo cae a otras alternativas si la #1 no trae ningún número. Así
 * evita el bug de "dos seis nueve" → 9,6,2 (elegir una alternativa peor y
 * reordenada solo por tener más números). Si la #1 pegó 3 dígitos ("269"), los
 * separa a 2,6,9 manteniendo el orden dictado.
 */
/**
 * Rangos reales del comercio de madera aserrada peruana. Sirven para dos cosas:
 * separar dígitos pegados eligiendo la lectura POSIBLE, y avisar cuando una
 * medida dictada quedó rara (nunca se corrige sola: se marca).
 */
export const RANGOS_MEDIDA = {
  espesor: { min: 1, max: 12 },   // pulgadas
  ancho: { min: 1, max: 30 },     // pulgadas
  largo: { min: 2, max: 30 },     // pies
} as const;

/** ¿Esta medida cae fuera de lo que se ve en un aserradero? */
export function medidaSospechosa(espesor: number, ancho: number, largo: number): boolean {
  const fuera = (v: number, r: { min: number; max: number }) => !(v >= r.min && v <= r.max);
  return (
    fuera(espesor, RANGOS_MEDIDA.espesor) ||
    fuera(ancho, RANGOS_MEDIDA.ancho) ||
    fuera(largo, RANGOS_MEDIDA.largo) ||
    // Una tabla más gruesa que ancha casi siempre es un dictado dado vuelta.
    espesor > ancho
  );
}

/**
 * Separa un token de dígitos PEGADOS por dictar rápido ("2810" = 2·8·10).
 *
 * POR QUÉ NO ALCANZA UNA REGLA FIJA: la versión anterior sólo unía "X0"
 * (10/20/30/40), así que "2812" —un 2×8×12 de manual— salía 2,8,1,2: una
 * pieza de 1 pie de largo y un 2 huérfano que corría TODO el dictado
 * siguiente. Acá se prueban las particiones posibles y gana la que da tres
 * medidas creíbles (espesor ≤ ancho, largo de verdad). Si ninguna cierra, se
 * cae a dígitos sueltos, que es lo que hacía antes.
 */
function separarPegados(s: string): number[] {
  // 1) ¿Alguna partición en 3 números da una medida válida? Se prueban cortes
  //    de 1-2 dígitos por número (no hay medidas de 3 cifras en madera).
  const candidatas: number[][] = [];
  for (const a of [1, 2]) {
    for (const b of [1, 2]) {
      for (const c of [1, 2]) {
        if (a + b + c !== s.length) continue;
        const e = Number(s.slice(0, a));
        const an = Number(s.slice(a, a + b));
        const l = Number(s.slice(a + b));
        if (e > 0 && an > 0 && l > 0) candidatas.push([e, an, l]);
      }
    }
  }
  const buena = candidatas.find(([e, a, l]) => !medidaSospechosa(e, a, l));
  if (buena) return buena;

  // 2) Sin lectura válida: la regla vieja (X0 junto, el resto suelto). Ante la
  //    duda no se inventa una medida — se devuelven los dígitos como vinieron.
  const out: number[] = [];
  let i = 0;
  while (i < s.length) {
    if (i + 1 < s.length && s[i] >= "1" && s[i] <= "4" && s[i + 1] === "0") {
      out.push(Number(s.slice(i, i + 2))); i += 2; // 10/20/30/40
    } else {
      out.push(Number(s[i])); i += 1;
    }
  }
  return out.filter((n) => n > 0);
}

export function mejoresNumeros(alternativas: string[]): number[] {
  const alts = alternativas.filter(Boolean);
  // Tokens de 3+ dígitos = números pegados por hablar rápido → separar; los de
  // 1-2 cifras (y decimales) se respetan tal cual.
  const expandir = (a: string) =>
    (normalizeText(a).match(/\d+(?:\.\d+)?/g) ?? []).flatMap((t) =>
      /^\d{3,}$/.test(t) ? separarPegados(t) : [parseFloat(t)]);
  const primary = alts.length ? expandir(alts[0]) : [];
  if (primary.length) return primary; // confía en la hipótesis #1
  // alt[0] sin números → primera alternativa que traiga algo.
  for (const a of alts.slice(1)) { const n = expandir(a); if (n.length) return n; }
  return [];
}

// ─── Comandos de voz ────────────────────────────────────────────────────────

/** Las tres dimensiones de una pieza, en el orden en que se dictan. */
export const DIMENSIONES = ["espesor", "ancho", "largo"] as const;
export type Dimension = (typeof DIMENSIONES)[number];

/** Medidas que quedan FIJAS: lo fijo no se dicta, se repite en cada pieza. */
export type MedidasFijas = Partial<Record<Dimension, number>>;

export type Comando =
  | { tipo: "pausar" }
  | { tipo: "continuar" }
  | { tipo: "borrar-ultimo" }
  | { tipo: "especie"; palabra: string }
  /** "pon fijo el largo a cuatro" → el largo deja de dictarse. */
  | { tipo: "fijar"; dimension: Dimension; valor: number }
  /** "quita el fijo" (todo) o "desfijá el largo" (una sola). */
  | { tipo: "desfijar"; dimension?: Dimension }
  | null;

/** Frases-gatillo por comando (editables desde Ajustes). especie = prefijos. */
export interface ComandosCfg {
  pausar: string[];
  continuar: string[];
  borrarUltimo: string[];
  especie: string[];
  fijar: string[];
  desfijar: string[];
}
export const COMANDOS_DEFAULT: ComandosCfg = {
  pausar: ["pausa", "pausar", "para", "pare", "deten", "alto"],
  continuar: ["continua", "continuar", "reanuda", "sigue", "seguir", "dale", "adelante"],
  borrarUltimo: ["elimina el ultimo", "borra el ultimo", "quita el ultimo", "ultimo", "deshacer", "deshace", "borra eso"],
  especie: ["especie", "madera"],
  fijar: ["fijo", "fija", "fijar", "fijalo", "deja fijo"],
  desfijar: ["quita el fijo", "quitar fijo", "saca el fijo", "desfija", "desfijar", "libera", "liberar", "sin fijo", "todo libre"],
};

/** Sinónimos de cada dimensión, como los dice un maderero. */
const PALABRAS_DIMENSION: Record<Dimension, string[]> = {
  espesor: ["espesor", "grueso", "grosor"],
  ancho: ["ancho", "anchura"],
  largo: ["largo", "longitud", "long", "medida"],
};

/** Qué dimensión nombra la frase (la primera que aparezca). */
function dimensionEn(s: string): Dimension | undefined {
  let mejor: { dim: Dimension; pos: number } | undefined;
  for (const dim of DIMENSIONES) {
    for (const w of PALABRAS_DIMENSION[dim]) {
      const pos = s.indexOf(` ${w}`);
      if (pos >= 0 && (!mejor || pos < mejor.pos)) mejor = { dim, pos };
    }
  }
  return mejor?.dim;
}

const escRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Detecta un comando de voz en el dictado (pausar/continuar/borrar último/fijar
 * especie) según las frases configuradas. Si no hay comando, devuelve null y el
 * texto se trata como números.
 *
 * ⚠️ GUARD DE MEDIDAS (bug real de campo): el reconocedor confunde el "por" de
 * "dos POR ocho" con "para", que es gatillo de pausar — dictar una medida
 * frenaba el trabajo sin motivo. Y "alto" aparece hablando de madera. Regla:
 * una frase con DOS O MÁS números es un dictado de medidas, no un comando; los
 * comandos de verdad se dicen solos ("pausa", "continuá", "borrá el último").
 */
export function detectarComando(input: string, cfg: ComandosCfg = COMANDOS_DEFAULT): Comando {
  // `normalizeText` deja las palabras-número como dígitos: "pon fijo el largo
  // a cuatro" → "… largo a 4". Se usa para leer el valor a fijar.
  const conNumeros = " " + normalizeText(input) + " ";
  const s = " " + stripAccents(input.toLowerCase()) + " ";
  const numeros = (conNumeros.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

  const hitEn = (texto: string, list: string[]) =>
    list.some((w) => {
      const t = stripAccents(w.toLowerCase()).trim();
      return !!t && new RegExp(`(^|\\s)${escRe(t)}(\\s|$)`).test(texto);
    });

  // ── FIJAR / DESFIJAR ── (antes del guard de números: llevan uno propio)
  // Desfijar primero: "quita el fijo" contiene "fijo", que es gatillo de fijar.
  if (hitEn(conNumeros, cfg.desfijar)) {
    return { tipo: "desfijar", dimension: dimensionEn(conNumeros) };
  }
  if (hitEn(conNumeros, cfg.fijar) && numeros.length === 1) {
    const dimension = dimensionEn(conNumeros);
    const valor = numeros[0];
    if (dimension && valor > 0) return { tipo: "fijar", dimension, valor };
  }

  // Una frase con dos o más números es un dictado de medidas, no un comando.
  if (numeros.length >= 2) return null;
  const hit = (list: string[]) =>
    list.some((w) => { const t = stripAccents(w.toLowerCase()).trim(); return !!t && new RegExp(`(^|\\s)${escRe(t)}(\\s|$)`).test(s); });
  // Borrar primero (más específico), luego especie, luego pausar/continuar.
  if (hit(cfg.borrarUltimo)) return { tipo: "borrar-ultimo" };
  for (const pre of cfg.especie) {
    const t = stripAccents(pre.toLowerCase()).trim();
    if (!t) continue;
    const m = s.match(new RegExp(`${escRe(t)}\\s+(?:de\\s+|es\\s+)?([a-z]+)`));
    if (m) return { tipo: "especie", palabra: m[1] };
  }
  if (hit(cfg.pausar)) return { tipo: "pausar" };
  if (hit(cfg.continuar)) return { tipo: "continuar" };
  return null;
}

/**
 * ¿Lo que acaba de escuchar el micrófono es SU PROPIA VOZ?
 *
 * En el patio se trabaja con el parlante del celular: el cubicador repite
 * "2, 6, 8" y el reconocedor lo escucha y lo vuelve a guardar — la pieza
 * entraba DOS veces. Se compara por los números (el reconocedor puntúa
 * distinto cada vez): misma secuencia = eco, no dictado nuevo.
 *
 * Sólo se usa dentro de la ventana en que el TTS estuvo hablando; fuera de
 * ella, repetir la misma medida a propósito sigue siendo válido.
 */
export function esEco(textoEscuchado: string, textoDicho: string): boolean {
  const nums = (t: string) => (normalizeText(t).match(/\d+(?:\.\d+)?/g) ?? []).join(",");
  const a = nums(textoEscuchado);
  return a !== "" && a === nums(textoDicho);
}

/**
 * Lee una frase del dictado continuo separando la CANTIDAD de las medidas.
 *
 * Antes, "cinco piezas de dos por ocho por diez" entraba como [5,2,8,10]: se
 * guardaba una pieza 5×2×8 y el 10 quedaba huérfano contaminando la frase
 * siguiente. Ahora el número pegado a "piezas/tablas/tablones/unidades" se
 * saca del pool y viaja como cantidad; sin esa palabra, todo son medidas.
 */
export function leerDictado(input: string): { cantidad: number; nums: number[] } {
  const s = normalizeText(input);
  const m = s.match(/(\d+)\s*(?:piezas?|tablas?|tablones?|listones?|unidades?|pzas?|pz)\b/);
  if (!m) return { cantidad: 1, nums: mejoresNumeros([input]) };
  const cantidad = Math.max(1, Math.min(999, Math.round(Number(m[1]))));
  // Se quita SOLO esa aparición; el resto de la frase sigue siendo medidas.
  const resto = s.replace(m[0], " ");
  return { cantidad, nums: mejoresNumeros([resto]) };
}

/**
 * Dictado rápido: parte una lista de números en tríos (espesor·ancho·largo).
 * Devuelve todas las piezas completas y cuántos números quedaron sueltos (para
 * arrastrarlos a la siguiente frase). Ej.: [2,6,8, 2,8,10, 1] → 2 piezas, resto 1.
 */
export function partirEnPiezas(nums: number[]): { piezas: Array<{ espesor: number; ancho: number; largo: number }>; resto: number[] } {
  return partirConFijas(nums, {});
}

/** Cuántos números hay que dictar por pieza con estas medidas fijas. */
export function numerosPorPieza(fijas: MedidasFijas): number {
  return DIMENSIONES.filter((d) => !(typeof fijas[d] === "number" && fijas[d]! > 0)).length;
}

/**
 * Parte el dictado en piezas RESPETANDO las medidas fijas.
 *
 * Con el largo fijo en 4, un lote entero se dicta de a dos números: "dos ocho,
 * dos seis, dos diez" son tres tablas de 4 pies. Los números libres siguen el
 * orden natural espesor → ancho → largo, salteando lo que está fijo; el
 * sobrante se arrastra a la frase siguiente, como sin fijas.
 *
 * Con las tres fijas no queda nada que dictar: se devuelve todo como resto (el
 * operador tiene que soltar alguna) en vez de inventar piezas por cada número.
 */
export function partirConFijas(
  nums: number[],
  fijas: MedidasFijas,
): { piezas: Array<{ espesor: number; ancho: number; largo: number }>; resto: number[] } {
  const libres = DIMENSIONES.filter((d) => !(typeof fijas[d] === "number" && fijas[d]! > 0));
  const paso = libres.length;
  if (paso === 0) return { piezas: [], resto: nums };

  const piezas: Array<{ espesor: number; ancho: number; largo: number }> = [];
  let i = 0;
  for (; i + paso <= nums.length; i += paso) {
    const grupo = nums.slice(i, i + paso);
    if (grupo.some((n) => !(n > 0))) continue;
    const medidas: Record<Dimension, number> = {
      espesor: fijas.espesor ?? 0,
      ancho: fijas.ancho ?? 0,
      largo: fijas.largo ?? 0,
    };
    libres.forEach((d, k) => { medidas[d] = grupo[k]; });
    piezas.push({ espesor: medidas.espesor, ancho: medidas.ancho, largo: medidas.largo });
  }
  return { piezas, resto: nums.slice(i) };
}
