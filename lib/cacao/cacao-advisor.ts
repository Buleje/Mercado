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
  series?: { c: number }[]; // cierres diarios (1 año) para tendencia/volatilidad
  news?: { title: string }[]; // titulares para la señal de sentimiento
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
export type NewsBias = "alcista" | "bajista" | "mixta" | "neutral";
export interface AdvisorNews {
  total: number;
  alcista: number;
  bajista: number;
  senal: NewsBias;
  destacados: string[]; // titulares que movieron la señal
}

export interface AdvisorDonde { canal: string; nota: string }
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
    alcista > bajista + 1 ? "alcista" : bajista > alcista + 1 ? "bajista" : alcista === 0 && bajista === 0 ? "neutral" : "mixta";
  return { total: news.length, alcista, bajista, senal, destacados };
}

const DONDE: AdvisorDonde[] = [
  { canal: "Cooperativa / asociación", nota: "mejor precio si tu cacao es fino de aroma y bien fermentado" },
  { canal: "Exportador directo", nota: "conviene con volumen y grado I uniforme" },
  { canal: "Mercado / intermediario local (Pucallpa)", nota: "pago rápido pero precio menor" },
];

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

  // Proyección lineal (regresión sobre 30 días) con banda de volatilidad.
  const slope = closes.length ? linregSlope(closes, 30) : null;
  const forecast: AdvisorForecast[] = slope != null && p.value > 0
    ? [projectForecast(p.value, slope, vol, 7), projectForecast(p.value, slope, vol, 30)]
    : [];

  // Señal de noticias (sentimiento de titulares).
  const news = analyzeNews(p.news);

  const high = pos52 != null && pos52 >= 65;
  const low = pos52 != null && pos52 <= 35;
  const rising = (trend7 ?? 0) > 3 || (trend30 ?? 0) > 6;
  const falling = (trend7 ?? 0) < -3 || (trend30 ?? 0) < -6;
  const nervioso = (vol ?? 0) >= 3;

  let signal: AdvisorAction = "neutral";
  let fuerza: AdvisorResult["fuerza"] = "leve";
  const motivos: string[] = [];

  if (pos52 != null) motivos.push(high ? `Precio en la parte ALTA de su rango anual (${pos52}% entre mín y máx 52 sem).` : low ? `Precio en la parte BAJA de su rango anual (${pos52}%).` : `Precio en zona media del año (${pos52}%).`);
  if (trend90 != null) motivos.push(`Últimos ~3 meses: ${trend90 > 0 ? "+" : ""}${trend90}%.`);
  if (trend30 != null) motivos.push(`Últimas ~4 semanas: ${trend30 > 0 ? "+" : ""}${trend30}% (${velocidadDia != null ? `${velocidadDia > 0 ? "+" : ""}${velocidadDia}%/día esta semana` : "—"}).`);
  if (trend7 != null) motivos.push(`Última semana: ${trend7 > 0 ? "+" : ""}${trend7}%.`);
  if (vol != null) motivos.push(`Volatilidad ${vol}%/día ${nervioso ? "(mercado nervioso)" : "(mercado tranquilo)"}.`);
  if (forecast.length) { const f = forecast[1]; motivos.push(`Si sigue la tendencia, en ~30 días rondaría USD ${f.mid}/t (${f.pct > 0 ? "+" : ""}${f.pct}%, rango ${f.low}–${f.high}).`); }
  if (news && news.senal !== "neutral") motivos.push(`Noticias con sesgo ${news.senal} (${news.alcista} alcistas / ${news.bajista} bajistas de ${news.total}).`);

  if (high && !falling) { signal = "vender"; fuerza = rising ? "fuerte" : "moderada"; }
  else if (high && falling) { signal = "vender"; fuerza = "moderada"; }
  else if (low && falling) { signal = "aguantar"; fuerza = "fuerte"; }
  else if (low) { signal = "aguantar"; fuerza = "moderada"; }
  else if (rising) { signal = "vender"; fuerza = "leve"; }
  else if (falling) { signal = "aguantar"; fuerza = "moderada"; }
  else { signal = "neutral"; fuerza = "leve"; }

  const titulo = signal === "vender"
    ? (fuerza === "fuerte" ? "Buen momento para VENDER tu cacao seco" : "Inclínate a VENDER")
    : signal === "aguantar"
      ? (fuerza === "fuerte" ? "Mejor AGUANTAR — no vendas barato" : "Inclínate a AGUANTAR")
      : "Momento NEUTRAL — vendé según tu caja";

  const resumen = signal === "vender"
    ? `El precio internacional está ${high ? "alto" : "subiendo"}${rising ? " y con impulso" : ""}. Si tenés stock seco listo, es buena ventana para vender y asegurar margen.`
    : signal === "aguantar"
      ? `El precio está ${low ? "bajo" : "cayendo"}${nervioso ? " y el mercado está nervioso" : ""}. Vender ahora te deja poco; si podés cubrir tu caja, conviene esperar una recuperación.`
      : `El precio no muestra una señal clara. Vendé lo que necesites para tu flujo de caja y guardá el resto esperando mejor precio.`;

  const cuando = signal === "vender"
    ? (rising ? "Esta semana, sin esperar demasiado — el impulso puede frenarse." : "En los próximos días, aprovechando el nivel actual.")
    : signal === "aguantar"
      ? `Esperá señales de recuperación${p.weekHigh52 ? ` (idealmente que se acerque a USD ${Math.round((p.value + (p.weekHigh52 - p.value) * 0.4))}/t)` : ""}; revisá el mercado cada semana.`
      : "Según tu necesidad de caja; no hay urgencia.";

  const riesgos: string[] = [];
  if (nervioso) riesgos.push(`Mercado volátil (±${vol}%/día): vendé en partes para no arriesgar todo a un solo día.`);
  if (signal === "aguantar") riesgos.push("Aguantar tiene costo: el cacao mal guardado gana humedad y pierde grado/precio.");
  if (signal === "vender" && falling) riesgos.push("Viene cayendo: no te demores, podría seguir bajando.");
  riesgos.push("El precio internacional es referencia; tu precio en chacra/FOB suele ir por debajo (flete + margen del comprador).");

  if (news && ((signal === "vender" && news.senal === "alcista") || (signal === "aguantar" && news.senal === "bajista"))) {
    riesgos.push(`Las noticias apuntan al lado contrario (sesgo ${news.senal}) — señal menos firme, seguila de cerca.`);
  }

  const compra = low || (pos52 != null && pos52 <= 40)
    ? "Para ACOPIAR: precio bajo = buena oportunidad de comprar barato a tus productores (y vender cuando suba)."
    : high
      ? "Para ACOPIAR: precio alto = cuidá tu margen, los productores pedirán más por kg."
      : "Para ACOPIAR: precio en zona media, condiciones normales de compra.";

  // Confianza: qué tan alineadas están las señales (tendencias + posición + noticias).
  let confianza = 50;
  if (trend7 != null && trend30 != null && trend7 !== 0 && Math.sign(trend7) === Math.sign(trend30)) confianza += 15;
  if (trend30 != null && trend90 != null && trend30 !== 0 && Math.sign(trend30) === Math.sign(trend90)) confianza += 10;
  if (high || low) confianza += 10;
  if (news && news.senal !== "neutral" && news.senal !== "mixta") {
    const alinea = (signal === "aguantar" && news.senal === "alcista") || (signal === "vender" && news.senal === "bajista");
    confianza += alinea ? 10 : -10;
  }
  if (nervioso) confianza -= 15;
  if (signal === "neutral") confianza = Math.min(confianza, 45);
  confianza = Math.max(20, Math.min(95, confianza));

  return { signal, fuerza, confianza, titulo, resumen, motivos, cuando, donde: DONDE, riesgos, compra, metrics, forecast, news };
}
