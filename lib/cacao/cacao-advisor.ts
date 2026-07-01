/**
 * cacao-advisor.ts — asesor determinístico de "¿cuándo vender / aguantar?" (ADR-128).
 * Client-safe y puro: NO importar prisma ni llm. Traduce las métricas reales del
 * mercado (precio, tendencia, posición 52sem, volatilidad) en una recomendación
 * para un acopiador de cacao en Pucallpa. NUNCA inventa cifras — solo razona
 * sobre los números dados. El "fino de aroma" peruano cotiza con premio.
 */

export interface AdvisorPriceInput {
  value: number;
  changePct: number | null; // diario
  weekHigh52: number | null;
  weekLow52: number | null;
  series?: { c: number; t?: number }[]; // cierres diarios (1 año); t (epoch ms) opcional → estacionalidad
  news?: { title: string }[]; // titulares para la señal de sentimiento
  // Contexto del acopiador: personaliza la señal según SU stock y margen, no solo
  // el mercado. Sin esto la recomendación es genérica de mercado.
  local?: {
    stockKg: number; // kg seco DISPONIBLE ahora
    miPrecioKg: number | null; // costo promedio de compra (S//kg seco)
    refKg: number | null; // referencia internacional (S//kg seco)
    spreadPct: number | null; // (ref − costo)/costo × 100 = margen bruto sobre tu costo
  };
}

export type AdvisorAction = "vender" | "aguantar" | "neutral";

/** Proyección de precio a un horizonte (USD/t). Extrapolación lineal, NO ML. */
export interface AdvisorForecast {
  dias: number;
  mid: number;
  low: number;
  high: number;
  pct: number; // variación proyectada vs hoy
}
export type NewsBias = "alcista" | "bajista" | "mixto" | "neutral";
export interface AdvisorNews {
  total: number;
  alcista: number;
  bajista: number;
  senal: NewsBias;
  destacados: string[]; // titulares que movieron la señal
}

export interface AdvisorDonde { canal: string; nota: string }

/** Indicadores técnicos (análisis de trading estándar). */
export interface AdvisorTecnico {
  rsi: number | null; // 0-100 (momentum). >70 sobrecompra, <30 sobreventa
  rsiZona: "sobrecompra" | "sobreventa" | "neutral" | null;
  bollingerPctB: number | null; // 0-100: posición del precio dentro de las bandas
  bollingerUpper: number | null;
  bollingerLower: number | null;
  soporte: number | null; // piso reciente (USD/t)
  resistencia: number | null; // techo reciente (USD/t)
  drawdownPct: number | null; // % por debajo del máximo de 52 sem (0 = en el máximo)
  trendR2: number | null; // 0-1: qué tan limpia/lineal es la tendencia
  macdHist: number | null; // histograma MACD (>0 alcista, <0 bajista)
  macdCruce: "alcista" | "bajista" | null; // cruce reciente de MACD
  emaCruce: "golden" | "death" | null; // EMA 12 vs 26
  divergencia: "alcista" | "bajista" | null; // divergencia RSI/precio
}
/** Un factor del veredicto direccional compuesto. */
export interface AdvisorFactor {
  nombre: string;
  voto: "suba" | "baja" | "neutral";
  peso: number;
  detalle: string;
}
/** Veredicto direccional: probabilidad de suba integrando todos los factores. */
export interface AdvisorDireccion {
  probabilidadSuba: number; // 0-100
  sesgo: "suba" | "baja" | "lateral";
  factores: AdvisorFactor[];
}
/** Estacionalidad mensual (según los últimos 12 meses de la serie). */
export interface AdvisorEstacional {
  mesActual: number; // 0-11
  desviacionPct: number | null; // este mes vs. promedio anual
  mejorMes: number; // mes con precio promedio más alto del año
  peorMes: number; // mes con precio promedio más bajo
  porMes: { mes: number; idxPct: number }[]; // índice de cada mes vs promedio
}
export interface AdvisorResult {
  signal: AdvisorAction;
  fuerza: "fuerte" | "moderada" | "leve";
  confianza: number; // 0-100, qué tan alineadas están las señales
  titulo: string;
  resumen: string;
  motivos: string[];
  cuando: string;
  donde: AdvisorDonde[];
  riesgos: string[];
  compra: string;
  metrics: {
    pos52: number | null;
    trend7: number | null;
    trend30: number | null;
    trend90: number | null;
    velocidadDia: number | null; // %/día reciente (últimos ~5 días)
    volatilidad: number | null;
  };
  forecast: AdvisorForecast[]; // horizontes 7 y 30 días (vacío si faltan datos)
  news: AdvisorNews | null;
  tecnico: AdvisorTecnico; // indicadores técnicos
  estacionalidad: AdvisorEstacional | null; // patrón mensual (si hay datos con fecha)
  direccion: AdvisorDireccion; // veredicto direccional compuesto (suba/baja)
}

function pctChange(arr: number[], n: number): number | null {
  if (arr.length < n + 1) return arr.length >= 2 ? round1(((arr[arr.length - 1] - arr[0]) / arr[0]) * 100) : null;
  const a = arr[arr.length - 1 - n], b = arr[arr.length - 1];
  return a > 0 ? round1(((b - a) / a) * 100) : null;
}
function volatility(arr: number[], n = 30): number | null {
  const s = arr.slice(-n);
  if (s.length < 5) return null;
  const rets: number[] = [];
  for (let i = 1; i < s.length; i++) rets.push((s[i] - s[i - 1]) / s[i - 1]);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  return round1(Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * 100);
}
const round1 = (n: number) => Math.round(n * 10) / 10;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const mesNombre = (m: number) => MESES[m] ?? String(m);

/** RSI (Relative Strength Index) — momentum 0-100. >70 sobrecompra, <30 sobreventa. */
function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const s = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < s.length; i++) {
    const d = s[i] - s[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  const avgL = losses / period;
  if (avgL === 0) return gains === 0 ? 50 : 100; // plano = neutral; solo subas = 100
  return Math.round(100 - 100 / (1 + gains / period / avgL));
}

/** Bandas de Bollinger: media ± k·σ (period). %B = posición del precio en la banda (0-100). */
function bollinger(closes: number[], value: number, period = 20, k = 2) {
  if (closes.length < period) return null;
  const s = closes.slice(-period);
  const mid = s.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mid) ** 2, 0) / period);
  const upper = mid + k * sd, lower = mid - k * sd;
  const pctB = upper > lower ? Math.round(((value - lower) / (upper - lower)) * 100) : null;
  return { mid: Math.round(mid), upper: Math.round(upper), lower: Math.round(lower), pctB };
}

/** R² de la regresión lineal de los últimos n cierres (0-1): linealidad/calidad de la tendencia. */
function linregR2(closes: number[], n = 30): number | null {
  const s = closes.slice(-n);
  if (s.length < 5) return null;
  const N = s.length;
  const mx = (N - 1) / 2;
  const my = s.reduce((a, b) => a + b, 0) / N;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < N; i++) { sxy += (i - mx) * (s[i] - my); sxx += (i - mx) ** 2; syy += (s[i] - my) ** 2; }
  if (sxx === 0 || syy === 0) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  return Math.round(r * r * 100) / 100;
}

/** Serie de EMA (media móvil exponencial) de un periodo. */
function emaSeries(closes: number[], period: number): number[] {
  if (!closes.length) return [];
  const k = 2 / (period + 1);
  const out = [closes[0]];
  for (let i = 1; i < closes.length; i++) out.push(closes[i] * k + out[i - 1] * (1 - k));
  return out;
}

/** MACD (12/26/9): histograma + cruce reciente (alcista/bajista). */
function macd(closes: number[]): { hist: number; cruce: "alcista" | "bajista" | null } | null {
  if (closes.length < 35) return null;
  const e12 = emaSeries(closes, 12), e26 = emaSeries(closes, 26);
  const macdLine = closes.map((_, i) => e12[i] - e26[i]);
  const sig = emaSeries(macdLine, 9);
  const n = closes.length - 1;
  const hist = macdLine[n] - sig[n];
  const prev = macdLine[n - 1] - sig[n - 1];
  const cruce = prev <= 0 && hist > 0 ? "alcista" : prev >= 0 && hist < 0 ? "bajista" : null;
  return { hist: Math.round(hist * 100) / 100, cruce };
}

/** Cruce de EMA 12/26: golden (12>26, alcista) / death (12<26, bajista). */
function emaCross(closes: number[]): "golden" | "death" | null {
  if (closes.length < 26) return null;
  const e12 = emaSeries(closes, 12), e26 = emaSeries(closes, 26);
  const n = closes.length - 1;
  return e12[n] > e26[n] ? "golden" : e12[n] < e26[n] ? "death" : null;
}

/** Divergencia RSI/precio: precio sube pero momentum baja (bajista) o viceversa. */
function rsiDivergence(closes: number[]): "alcista" | "bajista" | null {
  if (closes.length < 30) return null;
  const rNow = rsi(closes), rPrev = rsi(closes.slice(0, -10));
  if (rNow == null || rPrev == null) return null;
  const pNow = closes[closes.length - 1], pPrev = closes[closes.length - 11];
  if (pNow > pPrev * 1.005 && rNow < rPrev - 3) return "bajista"; // precio ↑, momentum ↓
  if (pNow < pPrev * 0.995 && rNow > rPrev + 3) return "alcista"; // precio ↓, momentum ↑
  return null;
}

/** Estacionalidad mensual: promedio de cada mes vs. promedio anual (serie con timestamps). */
function seasonality(series: { c: number; t?: number }[]): AdvisorEstacional | null {
  const withT = series.filter((p): p is { c: number; t: number } => typeof p.t === "number" && p.c > 0);
  if (withT.length < 60) return null;
  const byMonth = new Map<number, { sum: number; n: number }>();
  let sum = 0;
  for (const p of withT) {
    const m = new Date(p.t).getUTCMonth();
    const cur = byMonth.get(m) ?? { sum: 0, n: 0 };
    cur.sum += p.c; cur.n++;
    byMonth.set(m, cur);
    sum += p.c;
  }
  if (byMonth.size < 4) return null;
  const avg = sum / withT.length;
  const porMes = [...byMonth.entries()]
    .map(([mes, v]) => ({ mes, idxPct: Math.round(((v.sum / v.n - avg) / avg) * 1000) / 10 }))
    .sort((a, b) => a.mes - b.mes);
  const mesActual = new Date(withT[withT.length - 1].t).getUTCMonth();
  const mejor = porMes.reduce((a, b) => (b.idxPct > a.idxPct ? b : a));
  const peor = porMes.reduce((a, b) => (b.idxPct < a.idxPct ? b : a));
  return {
    mesActual,
    desviacionPct: porMes.find((x) => x.mes === mesActual)?.idxPct ?? null,
    mejorMes: mejor.mes,
    peorMes: peor.mes,
    porMes,
  };
}

/** Pendiente diaria por mínimos cuadrados sobre los últimos `n` cierres (USD/día). */
function linregSlope(arr: number[], n = 30): number | null {
  const s = arr.slice(-n);
  if (s.length < 5) return null;
  const N = s.length;
  const meanX = (N - 1) / 2;
  const meanY = s.reduce((a, b) => a + b, 0) / N;
  let num = 0, den = 0;
  for (let i = 0; i < N; i++) { num += (i - meanX) * (s[i] - meanY); den += (i - meanX) ** 2; }
  return den === 0 ? null : num / den;
}

/**
 * Proyección lineal a `dias` con banda por volatilidad (paseo aleatorio: la
 * incertidumbre crece con √t). Extrapolación honesta, NO predicción de ML.
 */
function projectForecast(value: number, slope: number, volPct: number | null, dias: number): AdvisorForecast {
  const mid = Math.max(0, value + slope * dias);
  const band = volPct != null ? value * (volPct / 100) * Math.sqrt(dias) : Math.abs(mid - value) * 0.6;
  return {
    dias,
    mid: Math.round(mid),
    low: Math.round(Math.max(0, mid - band)),
    high: Math.round(mid + band),
    pct: value > 0 ? round1(((mid - value) / value) * 100) : 0,
  };
}

// Titulares alcistas (precio sube): oferta cae / demanda sube. Incluye inglés
// porque el feed trae titulares globales ("cocoa price market") de ICE/Londres.
const NEWS_ALCISTA =
  /(récord|record|sube|subió|subir|alza|dispara|escasez|sequ[íi]a|d[ée]ficit|plaga|hongo|enferm|caída de la oferta|m[áa]ximo|encarece|repunt|tension|shortage|drought|deficit|disease|blight|crop failure|rally|surge|soar|jump|rise|rises|rising|higher|tight supply|supply cut|swollen shoot|frost|el niño)/i;
// Titulares bajistas (precio baja): sobreoferta / demanda cae.
const NEWS_BAJISTA =
  /(baja|bajó|cae|ca[ií]da|desplom|superávit|superavit|sobreoferta|cosecha récord|corrección|m[íi]nimo|abarata|presión a la baja|debilita|surplus|oversupply|glut|bumper crop|record harvest|falls?|drop|plunge|slump|decline|lower|eases?|correction|weaken)/i;

/** Sentimiento de UN titular (alcista/bajista/neutral). Client-safe, sin IA. */
export function classifyNewsSentiment(title: string): "alcista" | "bajista" | "neutral" {
  const t = title ?? "";
  const up = NEWS_ALCISTA.test(t),
    down = NEWS_BAJISTA.test(t);
  if (up && !down) return "alcista";
  if (down && !up) return "bajista";
  return "neutral";
}

/** Palabras clave (con polaridad) que dispararon la clasificación de un titular. */
export function newsKeywords(title: string): { word: string; pol: "alcista" | "bajista" }[] {
  const t = title ?? "";
  const out: { word: string; pol: "alcista" | "bajista" }[] = [];
  const seen = new Set<string>();
  const grab = (re: RegExp, pol: "alcista" | "bajista") => {
    const m = t.match(new RegExp(re.source, "gi"));
    if (m) for (const w of m) { const k = w.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ word: w, pol }); } }
  };
  grab(NEWS_ALCISTA, "alcista");
  grab(NEWS_BAJISTA, "bajista");
  return out;
}

/** Señal de sentimiento de los titulares (keywords deterministas, sin IA). */
function analyzeNews(news: { title: string }[] | undefined): AdvisorNews | null {
  if (!news || news.length === 0) return null;
  let alcista = 0, bajista = 0;
  const destacados: string[] = [];
  for (const n of news) {
    const t = n.title ?? "";
    const up = NEWS_ALCISTA.test(t), down = NEWS_BAJISTA.test(t);
    if (up && !down) { alcista++; if (destacados.length < 3) destacados.push(t); }
    else if (down && !up) { bajista++; if (destacados.length < 3) destacados.push(t); }
  }
  const senal: NewsBias =
    alcista > bajista + 1 ? "alcista" : bajista > alcista + 1 ? "bajista" : alcista === 0 && bajista === 0 ? "neutral" : "mixto";
  return { total: news.length, alcista, bajista, senal, destacados };
}

const DONDE: AdvisorDonde[] = [
  { canal: "Cooperativa / asociación", nota: "mejor precio si tu cacao es fino de aroma y bien fermentado" },
  { canal: "Exportador directo", nota: "conviene con volumen y grado I uniforme" },
  { canal: "Mercado / intermediario local (Pucallpa)", nota: "pago rápido pero precio menor" },
];

/**
 * Veredicto direccional compuesto: integra tendencia, MACD, cruce de medias, RSI,
 * divergencia, Bollinger, posición 52s, noticias y estacionalidad en una única
 * probabilidad de suba, con el desglose de qué vota cada factor (transparente).
 */
function direccionCompuesta(x: {
  trend30: number | null;
  rsiVal: number | null;
  boll: { pctB: number | null } | null;
  pos52: number | null;
  macdHist: number | null;
  emaCr: "golden" | "death" | null;
  diverg: "alcista" | "bajista" | null;
  news: AdvisorNews | null;
  estacionalidad: AdvisorEstacional | null;
}): AdvisorDireccion {
  const factores: AdvisorFactor[] = [];
  let net = 0, maxW = 0;
  const add = (nombre: string, voto: "suba" | "baja" | "neutral", peso: number, detalle: string) => {
    factores.push({ nombre, voto, peso, detalle });
    maxW += peso;
    net += voto === "suba" ? peso : voto === "baja" ? -peso : 0;
  };
  if (x.trend30 != null)
    add("Tendencia (mes)", x.trend30 > 2 ? "suba" : x.trend30 < -2 ? "baja" : "neutral", 2, `${x.trend30 > 0 ? "+" : ""}${x.trend30}% en el mes`);
  if (x.macdHist != null)
    add("MACD", x.macdHist > 0 ? "suba" : x.macdHist < 0 ? "baja" : "neutral", 2, `histograma ${x.macdHist > 0 ? "positivo" : "negativo"} (${x.macdHist})`);
  if (x.emaCr)
    add("Cruce de medias", x.emaCr === "golden" ? "suba" : "baja", 1.5, x.emaCr === "golden" ? "EMA12 sobre EMA26 (golden cross)" : "EMA12 bajo EMA26 (death cross)");
  if (x.rsiVal != null) {
    const voto = x.rsiVal >= 70 ? "baja" : x.rsiVal <= 30 ? "suba" : x.rsiVal >= 55 ? "suba" : x.rsiVal <= 45 ? "baja" : "neutral";
    const det = x.rsiVal >= 70 ? `RSI ${x.rsiVal}: sobrecompra (riesgo de corrección)` : x.rsiVal <= 30 ? `RSI ${x.rsiVal}: sobreventa (posible rebote)` : `RSI ${x.rsiVal}`;
    add("Momentum (RSI)", voto, 1, det);
  }
  if (x.diverg)
    add("Divergencia RSI/precio", x.diverg === "alcista" ? "suba" : "baja", 1.5, x.diverg === "bajista" ? "precio sube pero el momentum baja" : "precio baja pero el momentum sube");
  if (x.boll?.pctB != null) {
    const voto = x.boll.pctB >= 90 ? "baja" : x.boll.pctB <= 10 ? "suba" : "neutral";
    if (voto !== "neutral") add("Bollinger %B", voto, 1, `%B ${x.boll.pctB} (${voto === "baja" ? "extendido al alza" : "extendido a la baja"})`);
  }
  if (x.pos52 != null) {
    const voto = x.pos52 >= 85 ? "baja" : x.pos52 <= 15 ? "suba" : "neutral";
    if (voto !== "neutral") add("Posición 52 sem", voto, 1, `${x.pos52}% del rango anual (${voto === "baja" ? "caro" : "barato"})`);
  }
  if (x.news && (x.news.senal === "alcista" || x.news.senal === "bajista"))
    add("Noticias", x.news.senal === "alcista" ? "suba" : "baja", 1, `sesgo ${x.news.senal}`);
  if (x.estacionalidad) {
    const cur = x.estacionalidad.porMes.find((m) => m.mes === x.estacionalidad!.mesActual)?.idxPct;
    const next = x.estacionalidad.porMes.find((m) => m.mes === (x.estacionalidad!.mesActual + 1) % 12)?.idxPct;
    if (cur != null && next != null) {
      const voto = next > cur + 1 ? "suba" : next < cur - 1 ? "baja" : "neutral";
      if (voto !== "neutral") add("Estacionalidad", voto, 1, `el mes próximo suele estar ${next > cur ? "más alto" : "más bajo"}`);
    }
  }
  const prob = Math.max(5, Math.min(95, Math.round(50 + (maxW ? net / maxW : 0) * 50)));
  const sesgo: AdvisorDireccion["sesgo"] = prob >= 58 ? "suba" : prob <= 42 ? "baja" : "lateral";
  factores.sort((a, b) => b.peso - a.peso);
  return { probabilidadSuba: prob, sesgo, factores };
}

export function cacaoAdvisor(p: AdvisorPriceInput): AdvisorResult {
  const closes = (p.series ?? []).map((x) => x.c).filter((c) => typeof c === "number" && c > 0);
  const pos52 = p.weekHigh52 != null && p.weekLow52 != null && p.weekHigh52 > p.weekLow52
    ? Math.round(((p.value - p.weekLow52) / (p.weekHigh52 - p.weekLow52)) * 100) : null;
  const trend30 = closes.length ? pctChange(closes, 22) : null; // ~1 mes hábil
  const trend7 = closes.length ? pctChange(closes, 5) : null; // ~1 semana hábil
  const trend90 = closes.length ? pctChange(closes, 66) : null; // ~3 meses hábiles
  const vol = closes.length ? volatility(closes) : null;
  const velocidadDia = trend7 != null ? round1(trend7 / 5) : null; // %/día en la última semana
  const metrics = { pos52, trend7, trend30, trend90, velocidadDia, volatilidad: vol };

  // ── Indicadores técnicos (análisis de trading) ──
  const rsiVal = rsi(closes);
  const rsiZona: AdvisorTecnico["rsiZona"] =
    rsiVal == null ? null : rsiVal >= 70 ? "sobrecompra" : rsiVal <= 30 ? "sobreventa" : "neutral";
  const boll = bollinger(closes, p.value);
  const recientes = closes.slice(-60);
  const soporte = recientes.length ? Math.round(Math.min(...recientes)) : null;
  const resistencia = recientes.length ? Math.round(Math.max(...recientes)) : null;
  const drawdownPct =
    p.weekHigh52 != null && p.weekHigh52 > 0 ? round1(((p.value - p.weekHigh52) / p.weekHigh52) * 100) : null;
  const trendR2 = closes.length ? linregR2(closes, 30) : null;
  const macdRes = macd(closes);
  const emaCr = emaCross(closes);
  const diverg = rsiDivergence(closes);
  const tecnico: AdvisorTecnico = {
    rsi: rsiVal,
    rsiZona,
    bollingerPctB: boll?.pctB ?? null,
    bollingerUpper: boll?.upper ?? null,
    bollingerLower: boll?.lower ?? null,
    soporte,
    resistencia,
    drawdownPct,
    trendR2,
    macdHist: macdRes?.hist ?? null,
    macdCruce: macdRes?.cruce ?? null,
    emaCruce: emaCr,
    divergencia: diverg,
  };
  const estacionalidad = seasonality(p.series ?? []);

  // Proyección lineal (regresión sobre 30 días) con banda de volatilidad.
  const slope = closes.length ? linregSlope(closes, 30) : null;
  const forecast: AdvisorForecast[] = slope != null && p.value > 0
    ? [projectForecast(p.value, slope, vol, 7), projectForecast(p.value, slope, vol, 30)]
    : [];

  // Señal de noticias (sentimiento de titulares).
  const news = analyzeNews(p.news);

  // Veredicto direccional compuesto (integra todo, ya con news disponible).
  const direccion = direccionCompuesta({
    trend30, rsiVal, boll, pos52, macdHist: macdRes?.hist ?? null,
    emaCr, diverg, news, estacionalidad,
  });

  const high = pos52 != null && pos52 >= 65;
  const low = pos52 != null && pos52 <= 35;
  const rising = (trend7 ?? 0) > 3 || (trend30 ?? 0) > 6;
  const falling = (trend7 ?? 0) < -3 || (trend30 ?? 0) < -6;
  const nervioso = (vol ?? 0) >= 3;
  // Estado de corto plazo (para que la señal NO contradiga los indicadores):
  const overbought = rsiVal != null && rsiVal >= 70;
  const oversold = rsiVal != null && rsiVal <= 30;
  const strongUp = (trend30 ?? 0) >= 10 || (trend90 ?? 0) >= 25;
  const strongDown = (trend30 ?? 0) <= -10 || (trend90 ?? 0) <= -25;
  const dd = tecnico.drawdownPct; // negativo = por debajo del máx 52 sem
  // "Barato en el año pero caliente/sobrecomprado ahora" (viene de un techo mayor).
  const rallyCaliente = overbought && (rising || strongUp) && !strongDown;

  let signal: AdvisorAction = "neutral";
  let fuerza: AdvisorResult["fuerza"] = "leve";
  const motivos: string[] = [];

  if (pos52 != null) {
    const ddTxt = low && dd != null && dd < -8 ? ` — aún ${Math.abs(dd)}% por debajo de su máximo del año, pero mira la tendencia reciente` : "";
    motivos.push(high ? `Precio en la parte ALTA de su rango anual (${pos52}%).` : low ? `Precio en la parte baja de su rango de 52 semanas (${pos52}%)${ddTxt}.` : `Precio en zona media de su rango anual (${pos52}%).`);
  }
  if (trend90 != null) motivos.push(`Últimos ~3 meses: ${trend90 > 0 ? "+" : ""}${trend90}%.`);
  if (trend30 != null) motivos.push(`Últimas ~4 semanas: ${trend30 > 0 ? "+" : ""}${trend30}% (${velocidadDia != null ? `${velocidadDia > 0 ? "+" : ""}${velocidadDia}%/día esta semana` : "—"}).`);
  if (trend7 != null) motivos.push(`Última semana: ${trend7 > 0 ? "+" : ""}${trend7}%.`);
  if (vol != null) motivos.push(`Volatilidad ${vol}%/día ${nervioso ? "(mercado nervioso)" : "(mercado tranquilo)"}.`);
  if (forecast.length) { const f = forecast[1]; motivos.push(`Si sigue la tendencia, en ~30 días rondaría USD ${f.mid.toLocaleString("es-PE")}/t (${f.pct > 0 ? "+" : ""}${f.pct}%, rango ${f.low.toLocaleString("es-PE")}–${f.high.toLocaleString("es-PE")}).`); }
  if (news && news.senal !== "neutral") {
    const neu = Math.max(0, news.total - news.alcista - news.bajista);
    motivos.push(`Noticias con sesgo ${news.senal} (${plural(news.alcista, "alcista")} · ${plural(news.bajista, "bajista")} · ${neu} neutrales de ${news.total}).`);
  }
  if (rsiVal != null && rsiZona === "sobrecompra") motivos.push(`RSI ${rsiVal} = sobrecompra: subió rápido y podría corregir — favorece asegurar/vender.`);
  else if (rsiVal != null && rsiZona === "sobreventa") motivos.push(`RSI ${rsiVal} = sobreventa: cayó fuerte y suele rebotar — favorece aguantar/acopiar.`);
  if (trendR2 != null) motivos.push(trendR2 >= 0.6 ? `Tendencia limpia (R² ${trendR2}): el movimiento es sostenido, no ruido.` : `Tendencia poco definida (R² ${trendR2}): la proyección es menos confiable — toma la banda con cautela.`);
  if (estacionalidad && estacionalidad.desviacionPct != null) {
    const d = estacionalidad.desviacionPct;
    motivos.push(`Estacionalidad: ${mesNombre(estacionalidad.mesActual)} suele estar ${d > 0 ? "+" : ""}${d}% ${d >= 0 ? "sobre" : "bajo"} el promedio del año (últimos 12 meses).`);
  }
  if (macdRes?.cruce === "alcista") motivos.push("MACD cruzó al alza: el momentum gira a favor de la suba.");
  else if (macdRes?.cruce === "bajista") motivos.push("MACD cruzó a la baja: el momentum gira a favor de la caída.");
  if (diverg === "bajista") motivos.push("Divergencia bajista: el precio sube pero el impulso se debilita — la tendencia puede girar.");
  else if (diverg === "alcista") motivos.push("Divergencia alcista: el precio baja pero el impulso mejora — posible piso.");

  // Decisión coherente con los indicadores: un rally sobrecomprado manda VENDER
  // aunque pos52 sea baja (viene de un máximo mucho mayor); no dice "está barato".
  if (rallyCaliente) { signal = "vender"; fuerza = "fuerte"; }
  else if (high && !falling) { signal = "vender"; fuerza = rising ? "fuerte" : "moderada"; }
  else if (high && falling) { signal = "vender"; fuerza = "moderada"; }
  else if (low && (falling || oversold) && !strongUp) { signal = "aguantar"; fuerza = "fuerte"; }
  else if (low && strongUp) { signal = "vender"; fuerza = "moderada"; } // se recupera con fuerza
  else if (low) { signal = "aguantar"; fuerza = "moderada"; }
  else if (rising) { signal = "vender"; fuerza = "leve"; }
  else if (falling) { signal = "aguantar"; fuerza = "moderada"; }
  else { signal = "neutral"; fuerza = "leve"; }

  // Contexto del acopiador (stock + margen sobre su costo): ajusta la señal de
  // mercado a SU situación. Un buen margen con stock listo empuja a asegurar; un
  // spread negativo advierte que vender hoy realiza pérdida.
  const local = p.local;
  let localMotivo: string | null = null;
  let localRiesgo: string | null = null;
  if (local && local.stockKg > 0 && local.spreadPct != null && local.miPrecioKg != null) {
    if (local.spreadPct >= 15) {
      localMotivo = `Tienes ${local.stockKg} kg en stock con ~${local.spreadPct}% de margen sobre tu costo (S/ ${local.miPrecioKg}/kg): buena ventana para asegurar ganancia.`;
      if (signal === "neutral" && !falling) { signal = "vender"; fuerza = "leve"; }
      else if (signal === "vender" && fuerza === "leve") fuerza = "moderada";
    } else if (local.spreadPct < 0) {
      localRiesgo = `La referencia está ${Math.abs(local.spreadPct)}% por DEBAJO de tu costo de compra (S/ ${local.miPrecioKg}/kg): vender ahora realiza pérdida. Si tu caja aguanta, espera una recuperación.`;
      if (signal === "vender") fuerza = fuerza === "fuerte" ? "moderada" : "leve";
    } else {
      localMotivo = `Tienes ${local.stockKg} kg en stock, con margen ajustado (~${local.spreadPct}% sobre tu costo) — vende por partes.`;
    }
  } else if (local && local.stockKg <= 0) {
    localMotivo = "No tienes stock seco disponible: la señal aplica a tu próxima compra/acopio.";
  }
  if (localMotivo) motivos.push(localMotivo);

  const titulo = signal === "vender"
    ? (fuerza === "fuerte" ? "Buen momento para VENDER tu cacao seco" : "Inclínate a VENDER")
    : signal === "aguantar"
      ? (fuerza === "fuerte" ? "Mejor AGUANTAR — no vendas barato" : "Inclínate a AGUANTAR")
      : "Momento NEUTRAL — vende según tu caja";

  const resumen = signal === "vender"
    ? rallyCaliente
      ? `El precio subió fuerte (${trend90 != null ? `+${trend90}% en 3 meses` : "con impulso"}) y está sobrecomprado (RSI ${rsiVal}).${low && dd != null && dd < -8 ? ` Sigue por debajo de su máximo del año, pero` : ""} es buena ventana para asegurar la ganancia del repunte antes de una posible corrección.`
      : `El precio internacional está ${high ? "alto" : "subiendo"}${rising ? " y con impulso" : ""}. Si tienes stock seco listo, es buena ventana para vender y asegurar margen.`
    : signal === "aguantar"
      ? `El precio está ${low && !strongUp ? "en la parte baja de su rango" : "cayendo"}${nervioso ? " y el mercado está nervioso" : ""}. Vender ahora te deja poco; si puedes cubrir tu caja, conviene esperar una recuperación.`
      : `El precio no muestra una señal clara. Vende lo que necesites para tu flujo de caja y guarda el resto esperando mejor precio.`;

  const objetivo = tecnico.resistencia != null ? `hacia su resistencia (USD ${tecnico.resistencia.toLocaleString("es-PE")}/t)` : p.weekHigh52 ? "hacia su máximo del año" : "";
  const cuando = signal === "vender"
    ? (rising || rallyCaliente ? "Esta semana, sin esperar demasiado — el impulso puede frenarse." : "En los próximos días, aprovechando el nivel actual.")
    : signal === "aguantar"
      ? `Espera señales de recuperación${objetivo ? ` (${objetivo})` : ""}; revisa el mercado cada semana.`
      : "Según tu necesidad de caja; no hay urgencia.";

  const riesgos: string[] = [];
  if (nervioso) riesgos.push(`Mercado volátil (±${vol}%/día): vende en partes para no arriesgar todo a un solo día.`);
  if (signal === "aguantar") riesgos.push("Aguantar tiene costo: el cacao mal guardado gana humedad y pierde grado/precio.");
  if (signal === "vender" && falling) riesgos.push("Viene cayendo: no te demores, podría seguir bajando.");
  if (rallyCaliente) riesgos.push(`En sobrecompra (RSI ${rsiVal}) el precio puede corregir de golpe — no esperes el techo exacto, vende por partes.`);
  riesgos.push("El precio internacional es referencia; tu precio en chacra/FOB suele ir por debajo (flete + margen del comprador).");
  if (localRiesgo) riesgos.push(localRiesgo);

  if (news && ((signal === "vender" && news.senal === "alcista") || (signal === "aguantar" && news.senal === "bajista"))) {
    riesgos.push(`Las noticias apuntan al lado contrario (sesgo ${news.senal}) — señal menos firme, síguela de cerca.`);
  }

  const compra = low || (pos52 != null && pos52 <= 40)
    ? "Para ACOPIAR: precio bajo = buena oportunidad de comprar barato a tus productores (y vender cuando suba)."
    : high
      ? "Para ACOPIAR: precio alto = cuida tu margen, los productores pedirán más por kg."
      : "Para ACOPIAR: precio en zona media, condiciones normales de compra.";

  // Confianza rigurosa: pondera acuerdo entre horizontes, calidad de la tendencia
  // (R²), confirmación de posición/RSI, alineación de noticias y penaliza volatilidad.
  const sameSign = (x: number | null, y: number | null) =>
    x != null && y != null && x !== 0 && Math.sign(x) === Math.sign(y);
  let confianza = 45;
  if (sameSign(trend7, trend30)) confianza += 8;
  if (sameSign(trend30, trend90)) confianza += 8;
  if (trendR2 != null) confianza += Math.round(trendR2 * 14); // tendencia limpia = más confianza
  if ((signal === "vender" && high) || (signal === "aguantar" && low)) confianza += 10;
  if (rsiVal != null) {
    if ((signal === "vender" && rsiVal >= 65) || (signal === "aguantar" && rsiVal <= 35)) confianza += 8;
    else if ((signal === "vender" && rsiVal <= 35) || (signal === "aguantar" && rsiVal >= 65)) confianza -= 10;
  }
  if (news && news.senal !== "neutral" && news.senal !== "mixto") {
    const alinea = (signal === "aguantar" && news.senal === "alcista") || (signal === "vender" && news.senal === "bajista");
    confianza += alinea ? 8 : -8;
  }
  if (nervioso) confianza -= 12;
  if (signal === "neutral") confianza = Math.min(confianza, 45);
  confianza = Math.max(15, Math.min(95, confianza));

  return { signal, fuerza, confianza, titulo, resumen, motivos, cuando, donde: DONDE, riesgos, compra, metrics, forecast, news, tecnico, estacionalidad, direccion };
}
