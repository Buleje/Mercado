/**
 * Lógica de calidad y liquidación de cacao (ADR-128), client-safe y testeable.
 * NO importar prisma ni lib/db acá.
 *
 * Referencias normativas (Perú):
 *  - NTP 208.040:2017 — buenas prácticas cosecha/beneficio (humedad meta ≤ 7%).
 *  - NTP-ISO 2451 — clasificación de granos por defectos (Grado I / II).
 *  - NTP-ISO 1114 — prueba de corte (cut test).
 *  - NTP-ISO 2291 — determinación de humedad.
 */

export const CACAO_VARIEDADES = ["CCN-51", "criollo", "trinitario", "forastero", "nacional"] as const;
export const CACAO_CERTIFICACIONES = ["organico", "comercio_justo", "convencional"] as const;
export const CACAO_TIPO_GRANO = ["humedo", "seco"] as const;

export const HUMEDAD_META_PCT = 7; // NTP 208.040 — grano seco

export type CacaoGrado = "I" | "II" | "fuera_norma";

export interface CutTest {
  pctBienFermentado?: number | null; // marrón (fermentación completa)
  pctVioleta?: number | null; // parcialmente fermentado
  pctPizarroso?: number | null; // slaty (sin fermentar)
  pctMohoso?: number | null; // moldy
  humedadPct?: number | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: number | null | undefined) => (v == null ? 0 : Number(v));

/**
 * Índice de fermentación (%): granos con fermentación iniciada
 * (bien fermentado + violeta) sobre el total evaluado. El "fino de aroma"
 * se asocia a alto % bien fermentado (marrón).
 */
export function cacaoFermentationIndex(cut: CutTest): number {
  return r1(num(cut.pctBienFermentado) + num(cut.pctVioleta));
}

/**
 * Grado según defectos (NTP-ISO 2451) + humedad (NTP-ISO 2291).
 *  - Grado I:  mohoso ≤ 3% · pizarroso ≤ 3% · humedad ≤ 7.5%
 *  - Grado II: mohoso ≤ 4% · pizarroso ≤ 8% · humedad ≤ 8%
 *  - fuera_norma: excede alguno de los límites del Grado II.
 * Si no hay datos de corte ni humedad, retorna null (sin clasificar).
 */
export function cacaoGrade(cut: CutTest): CacaoGrado | null {
  const moh = cut.pctMohoso, piz = cut.pctPizarroso, hum = cut.humedadPct;
  if (moh == null && piz == null && hum == null) return null;
  const m = num(moh), p = num(piz), h = hum == null ? 0 : Number(hum);
  if (m <= 3 && p <= 3 && h <= 7.5) return "I";
  if (m <= 4 && p <= 8 && h <= 8) return "II";
  return "fuera_norma";
}

export const GRADO_LABEL: Record<CacaoGrado, string> = {
  I: "Grado I",
  II: "Grado II",
  fuera_norma: "Fuera de norma",
};

/** Liquidación al productor: (precio + premio) × peso. Redondea a 2 decimales. */
export function cacaoLiquidacion(
  pesoKg: number | null | undefined,
  precioPorKg: number | null | undefined,
  premioPorKg: number | null | undefined = 0,
): number {
  const peso = num(pesoKg), precio = num(precioPorKg), premio = num(premioPorKg);
  return Math.round(peso * (precio + premio) * 100) / 100;
}

/** ¿Cumple humedad de norma para grano seco (≤ 7%)? */
export function cumpleHumedad(humedadPct: number | null | undefined): boolean {
  return humedadPct != null && Number(humedadPct) <= HUMEDAD_META_PCT;
}
