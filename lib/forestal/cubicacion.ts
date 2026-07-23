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
 * Separa un token de dígitos PEGADOS por dictar rápido ("2810" = "2 8 10") en
 * números de madera válidos. Regla: un dígito 1-4 seguido de 0 forma una medida
 * de 2 cifras (10/20/30/40, de "diez/veinte/treinta/cuarenta"); el resto son
 * dígitos sueltos. No hay medidas de madera de 3+ cifras, así que un token largo
 * SIEMPRE está pegado. Los de 1-2 cifras (10, 12, 14, 28) se respetan y no entran acá.
 */
function separarPegados(s: string): number[] {
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

export type Comando =
  | { tipo: "pausar" }
  | { tipo: "continuar" }
  | { tipo: "borrar-ultimo" }
  | { tipo: "especie"; palabra: string }
  | null;

/** Frases-gatillo por comando (editables desde Ajustes). especie = prefijos. */
export interface ComandosCfg {
  pausar: string[];
  continuar: string[];
  borrarUltimo: string[];
  especie: string[];
}
export const COMANDOS_DEFAULT: ComandosCfg = {
  pausar: ["pausa", "pausar", "para", "pare", "deten", "alto"],
  continuar: ["continua", "continuar", "reanuda", "sigue", "seguir", "dale", "adelante"],
  borrarUltimo: ["elimina el ultimo", "borra el ultimo", "quita el ultimo", "ultimo", "deshacer", "deshace", "borra eso"],
  especie: ["especie", "madera"],
};

const escRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Detecta un comando de voz en el dictado (pausar/continuar/borrar último/fijar
 * especie) según las frases configuradas. Si no hay comando, devuelve null y el
 * texto se trata como números.
 */
export function detectarComando(input: string, cfg: ComandosCfg = COMANDOS_DEFAULT): Comando {
  const s = " " + stripAccents(input.toLowerCase()) + " ";
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
 * Dictado rápido: parte una lista de números en tríos (espesor·ancho·largo).
 * Devuelve todas las piezas completas y cuántos números quedaron sueltos (para
 * arrastrarlos a la siguiente frase). Ej.: [2,6,8, 2,8,10, 1] → 2 piezas, resto 1.
 */
export function partirEnPiezas(nums: number[]): { piezas: Array<{ espesor: number; ancho: number; largo: number }>; resto: number[] } {
  const piezas: Array<{ espesor: number; ancho: number; largo: number }> = [];
  let i = 0;
  for (; i + 3 <= nums.length; i += 3) {
    const [e, a, l] = nums.slice(i, i + 3);
    if (e > 0 && a > 0 && l > 0) piezas.push({ espesor: e, ancho: a, largo: l });
  }
  return { piezas, resto: nums.slice(i) };
}
