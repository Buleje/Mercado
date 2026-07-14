/**
 * cacao-lecturas.ts — motor de análisis del mercado del cacao (ADR-128 v6).
 * PURO y client-safe: recibe la serie diaria (y FX) y devuelve estadísticas
 * precisas (horizontes, racha, RSI, volatilidad, medias, sensibilidad USD→S/)
 * más las "lecturas" en lenguaje de bodega. Single source para el Pulso del
 * mercado y la card "Lectura de mercado" del noticiero — mismos números en
 * ambos lados, sin duplicar fórmulas.
 */
import { CHACRA_CC_COMPRA_OFICIAL_FACTOR, COMPRA_LOCAL_PCT } from "./cacao-precio-regional";

export interface PricePointLike { t: number; c: number }

export interface HorizontePct { key: "1S" | "1M" | "3M" | "1A"; pct: number }

export interface MarketStats {
  last: number;
  /** Variación % del último cierre vs N ruedas atrás (5≈1S, 21≈1M, 63≈3M, todo≈1A). */
  horizontes: HorizontePct[];
  /** Racha actual: días consecutivos moviéndose en la misma dirección. */
  racha: { dias: number; dir: 1 | -1 | 0 };
  /** RSI de 14 ruedas (0-100): >70 sobrecomprado, <30 sobrevendido. */
  rsi14: number | null;
  /** Desviación estándar de retornos diarios (últimas 30 ruedas), en %. */
  vol30: number | null;
  mm7: number | null;
  mm30: number | null;
  /** Posición del último precio en el rango de la serie (0-100). */
  pos52: number | null;
  /** Cuántos S//kg de compra local mueve un cambio de 100 USD/t (con FX actual). */
  sensSolPor100Usd: number | null;
}

const HORIZONTES: { key: HorizontePct["key"]; ruedas: number }[] = [
  { key: "1S", ruedas: 5 },
  { key: "1M", ruedas: 21 },
  { key: "3M", ruedas: 63 },
  { key: "1A", ruedas: Infinity },
];

const sma = (closes: number[], w: number): number | null => {
  if (closes.length < w) return null;
  let s = 0;
  for (let i = closes.length - w; i < closes.length; i++) s += closes[i];
  return s / w;
};

export function computeMarketStats(series: PricePointLike[], usdPen: number | null): MarketStats | null {
  if (series.length < 3) return null;
  const closes = series.map((p) => p.c);
  const n = closes.length;
  const last = closes[n - 1];

  const horizontes: HorizontePct[] = [];
  for (const h of HORIZONTES) {
    const idx = h.ruedas === Infinity ? 0 : n - 1 - h.ruedas;
    if (idx < 0) continue;
    const base = closes[Math.max(0, idx)];
    if (base > 0) horizontes.push({ key: h.key, pct: ((last - base) / base) * 100 });
  }

  // Racha: cuenta hacia atrás mientras el signo del cambio diario se mantenga.
  let dias = 0;
  const dirNum = Math.sign(closes[n - 1] - closes[n - 2]);
  if (dirNum !== 0) {
    for (let i = n - 1; i > 0 && Math.sign(closes[i] - closes[i - 1]) === dirNum; i--) dias++;
  }
  const racha = { dias, dir: dirNum as 1 | -1 | 0 };

  // RSI(14) clásico: promedio simple de subas/bajas de las últimas 14 ruedas.
  let rsi14: number | null = null;
  if (n >= 15) {
    let g = 0, l = 0;
    for (let i = n - 14; i < n; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) g += d; else l -= d;
    }
    rsi14 = l === 0 ? 100 : Math.round((100 - 100 / (1 + g / 14 / (l / 14))) * 10) / 10;
  }

  // Volatilidad: desviación estándar de retornos diarios de las últimas 30 ruedas.
  let vol30: number | null = null;
  if (n >= 11) {
    const w = Math.min(30, n - 1);
    const rets: number[] = [];
    for (let i = n - w; i < n; i++) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    vol30 = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * 100;
  }

  const min = Math.min(...closes), max = Math.max(...closes);
  const pos52 = max > min ? Math.round(((last - min) / (max - min)) * 100) : null;

  const sensSolPor100Usd = usdPen ? (100 / 1000) * usdPen * CHACRA_CC_COMPRA_OFICIAL_FACTOR : null;

  return { last, horizontes, racha, rsi14, vol30, mm7: sma(closes, 7), mm30: sma(closes, 30), pos52, sensSolPor100Usd };
}

const pctStr = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;

/**
 * Lecturas en lenguaje de bodega, generadas de los stats. Descriptivas, no
 * consejo de inversión (para "¿vendo o aguanto?" está el Asesor).
 */
export function buildLecturas(s: MarketStats, pricePenPerKg: number | null): string[] {
  const out: string[] = [];

  const h = Object.fromEntries(s.horizontes.map((x) => [x.key, x.pct])) as Partial<Record<HorizontePct["key"], number>>;
  if (h["1S"] != null && h["1M"] != null && h["3M"] != null) {
    out.push(`Cómo viene el precio: ${pctStr(h["1S"])} en la semana, ${pctStr(h["1M"])} en el mes y ${pctStr(h["3M"])} en 3 meses.`);
  }

  if (s.mm7 != null && s.mm30 != null) {
    const gapPct = ((s.mm7 - s.mm30) / s.mm30) * 100;
    out.push(
      gapPct > 1
        ? `Tendencia de corto plazo ALCISTA: la media de 7 días va ${pctStr(gapPct)} arriba de la de 30.`
        : gapPct < -1
          ? `Tendencia de corto plazo BAJISTA: la media de 7 días va ${pctStr(gapPct)} debajo de la de 30.`
          : `Tendencia lateral: las medias de 7 y 30 días están casi pegadas (${pctStr(gapPct)}).`,
    );
  }

  if (s.racha.dias >= 3 && s.racha.dir !== 0) {
    out.push(`Racha: ${s.racha.dias} ruedas seguidas ${s.racha.dir > 0 ? "subiendo" : "bajando"}.`);
  }

  if (s.rsi14 != null) {
    if (s.rsi14 >= 70) out.push(`RSI 14 en ${s.rsi14} — SOBRECOMPRADO: subió muy rápido, no sería raro un respiro.`);
    else if (s.rsi14 <= 30) out.push(`RSI 14 en ${s.rsi14} — SOBREVENDIDO: cayó muy rápido, puede rebotar.`);
    else out.push(`RSI 14 en ${s.rsi14} — zona neutra, sin señal de exceso.`);
  }

  if (s.vol30 != null) {
    out.push(`Volatilidad (30 ruedas): ±${s.vol30.toFixed(1)}%/día — mercado ${s.vol30 >= 3 ? "NERVIOSO: los precios saltan fuerte" : s.vol30 >= 1.5 ? "movido" : "tranquilo"}.`);
  }

  if (s.pos52 != null) {
    out.push(
      s.pos52 >= 80
        ? `Está en el ${s.pos52}% de su rango anual — zona de precios ALTOS del año.`
        : s.pos52 <= 20
          ? `Está en el ${s.pos52}% de su rango anual — zona de precios BAJOS del año.`
          : `Está en el ${s.pos52}% de su rango anual (zona media).`,
    );
  }

  if (s.sensSolPor100Usd != null && pricePenPerKg != null) {
    out.push(`Regla rápida: cada ±100 USD/t mueve tu compra local ≈ ±S/ ${s.sensSolPor100Usd.toFixed(2)}/kg (pagás ${COMPRA_LOCAL_PCT}% del oficial).`);
  }

  return out;
}
