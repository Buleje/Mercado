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

// ─── Beneficio (post-cosecha): fermentación + secado (ADR-128 v2) ──────────

export const CACAO_FERMENTADORES = ["cajon", "saco", "monton", "tina"] as const;
export const CACAO_SECADO = ["solar", "tunel", "mecanico"] as const;
export const CACAO_BENEFICIO_ESTADOS = ["fermentando", "secando", "terminado"] as const;

/**
 * Merma del beneficio húmedo→seco (%): cuánto peso se pierde al fermentar+secar.
 * Típico en cacao ~58-62% (de 100 kg baba → ~38-42 kg seco). Retorna null si
 * faltan datos o el seco supera al húmedo (dato inválido).
 */
export function cacaoMerma(pesoHumedoKg: number | null | undefined, pesoSecoKg: number | null | undefined): number | null {
  const h = num(pesoHumedoKg), s = num(pesoSecoKg);
  if (h <= 0 || s <= 0 || s > h) return null;
  return Math.round((1 - s / h) * 1000) / 10; // 1 decimal
}

/** Merma típica de referencia (húmedo→seco). De 100 kg baba salen ~40 kg seco. */
export const MERMA_TIPICA_PCT = 60;

/**
 * Proyección de kg seco esperado a partir de kg húmedo en proceso, dada una
 * merma % (default típica). Útil para estimar inventario seco "en camino".
 */
export function cacaoProyeccionSeco(
  pesoHumedoKg: number | null | undefined,
  mermaPct: number = MERMA_TIPICA_PCT,
): number {
  const h = num(pesoHumedoKg);
  if (h <= 0) return 0;
  const m = Math.min(Math.max(num(mermaPct), 0), 99);
  return Math.round(h * (1 - m / 100) * 100) / 100;
}

/** Rendimiento del beneficio (kg seco / kg húmedo) en %. Inverso de la merma. */
export function cacaoRendimiento(pesoHumedoKg: number | null | undefined, pesoSecoKg: number | null | undefined): number | null {
  const h = num(pesoHumedoKg), s = num(pesoSecoKg);
  if (h <= 0 || s <= 0 || s > h) return null;
  return Math.round((s / h) * 1000) / 10;
}

// ─── Ventas de cacao seco (ADR-128 v3) ──────────────────────────────────────

export const CACAO_VENTA_CANALES = ["cooperativa", "exportador", "mercado_local", "otro"] as const;
export const CACAO_MONEDAS = ["PEN", "USD"] as const;

/**
 * Total de una venta convertido a SOLES. Si la moneda es USD, multiplica por el
 * tipo de cambio. Retorna 0 si faltan datos válidos.
 */
export function cacaoVentaTotalPen(
  pesoKg: number | null | undefined,
  precioPorKg: number | null | undefined,
  moneda: string = "PEN",
  tipoCambio: number | null | undefined = null,
): number {
  const peso = num(pesoKg), precio = num(precioPorKg);
  if (peso <= 0 || precio <= 0) return 0;
  const enMoneda = peso * precio;
  if (moneda === "USD") {
    const fx = num(tipoCambio);
    return fx > 0 ? Math.round(enMoneda * fx * 100) / 100 : 0;
  }
  return Math.round(enMoneda * 100) / 100;
}

/** Margen bruto de la venta vs. costo de acopio: (ingreso − costo) / costo (%). */
export function cacaoVentaMargen(totalPen: number | null | undefined, pesoKg: number | null | undefined, costoPorKg: number | null | undefined): number | null {
  const total = num(totalPen), peso = num(pesoKg), costoKg = num(costoPorKg);
  if (total <= 0 || peso <= 0 || costoKg <= 0) return null;
  const costo = peso * costoKg;
  return Math.round(((total - costo) / costo) * 1000) / 10;
}

