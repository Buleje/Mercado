/**
 * cacao-market.ts — datos de mercado del cacao para el "Noticiero" (ADR-128).
 *
 * SERVER-ONLY: hace fetch a fuentes externas. NO importar en componentes client.
 * Fuentes gratis sin API key:
 *  - Precio ICE Cocoa (CC=F) + FX USD/PEN → Yahoo Finance chart API.
 *  - Noticias → Google News RSS (es-419 / gl=PE).
 * URLs hardcoded (sin input de usuario) → sin riesgo SSRF.
 *
 * Cache en memoria por instancia (TTL) para no golpear las fuentes en cada
 * request. En serverless el cache es best-effort (se pierde en cold start).
 */
import "server-only";

const TTL_MS = 20 * 60 * 1000; // 20 min
const UA = "Mozilla/5.0 (compatible; BulejeCacao/1.0)";

export interface PricePoint { t: number; c: number } // t = epoch ms, c = cierre USD/t
export interface CacaoPrice {
  value: number; // USD por tonelada métrica
  currency: string;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  asOf: string; // ISO
  spark: number[]; // cierres recientes para sparkline (compat)
  series: PricePoint[]; // 1 año de cierres diarios para el gráfico de flujo
}
export interface CacaoNewsItem { title: string; source: string | null; link: string; pubDate: string | null }
export interface CacaoMarket {
  price: CacaoPrice | null;
  usdPen: number | null; // soles por dólar
  pricePenPerKg: number | null; // referencia: S/ por kg seco (precio/1000 * fx)
  news: CacaoNewsItem[];
  generatedAt: string;
}

let cache: { at: number; data: CacaoMarket } | null = null;

async function safeFetch(url: string, timeoutMs = 9000): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

async function fetchCocoaPrice(): Promise<CacaoPrice | null> {
  // 1 año de cierres diarios → serie para el gráfico de flujo de precio.
  const r = await safeFetch("https://query1.finance.yahoo.com/v8/finance/chart/CC=F?interval=1d&range=1y");
  if (!r) return null;
  try {
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const m = res?.meta;
    if (!m || typeof m.regularMarketPrice !== "number") return null;
    const ts: number[] = res?.timestamp ?? [];
    const rawCloses: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const series: PricePoint[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = rawCloses[i];
      if (typeof c === "number" && c > 0) series.push({ t: ts[i] * 1000, c: Math.round(c * 100) / 100 });
    }
    const closes = series.map((p) => p.c);
    const value = m.regularMarketPrice;
    // Cambio DIARIO: cierre del día anterior = penúltimo close (el último ≈ hoy).
    // chartPreviousClose en range=1y sería de hace ~1 año (mal etiquetado).
    const prev = closes.length >= 2 ? closes[closes.length - 2]
      : typeof m.chartPreviousClose === "number" ? m.chartPreviousClose : null;
    const change = prev != null ? Math.round((value - prev) * 100) / 100 : null;
    const changePct = prev ? Math.round(((value - prev) / prev) * 1000) / 10 : null;
    return {
      value,
      currency: m.currency ?? "USD",
      prevClose: prev,
      change,
      changePct,
      dayHigh: m.regularMarketDayHigh ?? null,
      dayLow: m.regularMarketDayLow ?? null,
      weekHigh52: m.fiftyTwoWeekHigh ?? null,
      weekLow52: m.fiftyTwoWeekLow ?? null,
      asOf: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
      spark: closes.slice(-30),
      series,
    };
  } catch {
    return null;
  }
}

async function fetchUsdPen(): Promise<number | null> {
  const r = await safeFetch("https://query1.finance.yahoo.com/v8/finance/chart/PEN=X?interval=1d&range=1d");
  if (!r) return null;
  try {
    const j = await r.json();
    const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === "number" && p > 0 && p < 100 ? p : null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

function parseRss(xml: string, max: number): CacaoNewsItem[] {
  const items: CacaoNewsItem[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const b of blocks.slice(0, max)) {
    const title = b.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const link = b.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const pub = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const source = b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1];
    if (!title || !link) continue;
    items.push({
      title: decodeEntities(title),
      link: decodeEntities(link),
      source: source ? decodeEntities(source) : null,
      pubDate: pub ? new Date(decodeEntities(pub)).toISOString() : null,
    });
  }
  return items;
}

async function fetchNews(): Promise<CacaoNewsItem[]> {
  const q = (s: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(s)}&hl=es-419&gl=PE&ceid=PE:es-419`;
  const [a, b] = await Promise.all([
    safeFetch(q("cacao Perú precio OR exportación OR cosecha")),
    safeFetch(q("precio cacao mundial OR cocoa price market")),
  ]);
  const local = a ? parseRss(await a.text(), 8) : [];
  const global = b ? parseRss(await b.text(), 6) : [];
  // dedupe por título y ordenar por fecha desc
  const seen = new Set<string>();
  return [...local, ...global]
    .filter((n) => { const k = n.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => (y.pubDate ?? "").localeCompare(x.pubDate ?? ""))
    .slice(0, 12);
}

export async function getCacaoMarket(force = false): Promise<CacaoMarket> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const [price, usdPen, news] = await Promise.all([fetchCocoaPrice(), fetchUsdPen(), fetchNews()]);
  const pricePenPerKg =
    price && usdPen ? Math.round((price.value / 1000) * usdPen * 100) / 100 : null;
  const data: CacaoMarket = { price, usdPen, pricePenPerKg, news, generatedAt: new Date().toISOString() };
  cache = { at: Date.now(), data };
  return data;
}
