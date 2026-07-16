"use client";

/**
 * CacaoNoticiero — apartado de mercado/noticias del cacao (ADR-128).
 * Precio ICE en vivo + conversión a S//kg + análisis computado (sin IA, sin
 * alucinación) + feed de noticias (Google News) + enlaces de referencia.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { SectionTitle, CardTitle } from "@buleje/design-system";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, AlertCircle, Activity,
} from "@buleje/design-system/icons";
// Escalera de precios por plaza (sin recharts → import eager, liviano)
import CacaoPreciosRegionales from "./CacaoPreciosRegionales";
// Tabla de conversión día a día (sin recharts → eager, liviano)
import CacaoTablaConversion from "./CacaoTablaConversion";
// Pulso del mercado: intradía + stats multi-horizonte (sin recharts → eager)
import CacaoMarketPulse, { type LecturaSesion } from "./CacaoMarketPulse";
import { computeMarketStats, buildLecturas } from "@/lib/cacao/cacao-lecturas";
import { CHACRA_CC_COMPRA_OFICIAL_FACTOR, COMPRA_LOCAL_PCT } from "@/lib/cacao/cacao-precio-regional";
// Modal de presentación compartido (mismo del dashboard inicio): navega entre
// los 3 charts de esta vista con ← →, modo TV y export PNG.
import { ChartPresentationModal } from "@/components/admin/inicio/_shared/ChartPresentationModal";

// recharts fuera del bundle inicial del admin
const CacaoPriceChart = dynamic(() => import("./CacaoPriceChart"), {
  ssr: false,
  loading: () => <div className="flex h-[360px] items-center justify-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-tertiary)]"><Activity className="mr-2 h-5 w-5 animate-pulse" /> Cargando gráfico…</div>,
});
const CacaoMiPrecio = dynamic(() => import("./CacaoMiPrecio"), {
  ssr: false,
  loading: () => <div className="flex h-[320px] items-center justify-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-tertiary)]"><Activity className="mr-2 h-5 w-5 animate-pulse" /> Cargando gráfico…</div>,
});

interface Price {
  value: number; currency: string; prevClose: number | null; change: number | null; changePct: number | null;
  dayHigh: number | null; dayLow: number | null; weekHigh52: number | null; weekLow52: number | null; asOf: string;
  spark: number[]; series: { t: number; c: number }[];
}
interface NewsItem { title: string; source: string | null; link: string; pubDate: string | null }
interface Market { price: Price | null; usdPen: number | null; fxSeries?: { t: number; c: number }[]; intraday?: { t: number; c: number }[]; pricePenPerKg: number | null; news: NewsItem[]; generatedAt: string; stale?: boolean; staleAt?: string | null }

const fmt = (v: number | null, d = 0) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }));
// El mercado se mueve: auto-lectura cada 5 min (fuerza el fetch, salta el cache del server).
const AUTO_MS = 5 * 60_000;
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const lecturasKey = () => `cacao-lecturas-${new Date().toISOString().slice(0, 10)}`;
function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export default function CacaoNoticiero() {
  const [data, setData] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Punto del gráfico seleccionado (click): fija ese precio histórico en los KPIs
  // y en "a cuánto se vende". null = precio de hoy (en vivo).
  const [sel, setSel] = useState<{ usd: number; t: number } | null>(null);
  // Chart abierto en el modal de presentación fullscreen. null = cerrado.
  const [presentingId, setPresentingId] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      // force salta el cache de 20 min del server (botón Actualizar); el mount usa cache.
      const r = await fetch(`/api/admin/cacao/market${force ? "?force=1" : ""}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Auto-lectura: countdown de 5 min visible; al llegar a 0 fuerza una lectura
  // nueva y arranca de vuelta. "Actualizar" manual también resetea el reloj.
  const [auto, setAuto] = useState(true);
  const [countdown, setCountdown] = useState(AUTO_MS);
  const nextAtRef = useRef(0);
  useEffect(() => {
    if (!auto) return;
    nextAtRef.current = Date.now() + AUTO_MS;
    setCountdown(AUTO_MS);
    const t = window.setInterval(() => {
      const left = nextAtRef.current - Date.now();
      if (left <= 0) {
        nextAtRef.current = Date.now() + AUTO_MS;
        setCountdown(AUTO_MS);
        load(true);
      } else setCountdown(left);
    }, 1000);
    return () => window.clearInterval(t);
  }, [auto, load]);
  const refreshNow = useCallback(() => {
    nextAtRef.current = Date.now() + AUTO_MS;
    setCountdown(AUTO_MS);
    load(true);
  }, [load]);

  // Registro de lecturas de la sesión (persistido por día en localStorage):
  // cada actualización con precio distinto queda anotada con su hora.
  const [lecturas, setLecturas] = useState<LecturaSesion[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(lecturasKey());
      return raw ? (JSON.parse(raw) as LecturaSesion[]) : [];
    } catch { return []; }
  });
  useEffect(() => {
    const v = data?.price?.value;
    if (v == null) return;
    setLecturas((prev) => {
      if (prev.length && prev[prev.length - 1].usd === v) return prev;
      const next = [...prev, { t: Date.now(), usd: v, pen: data?.pricePenPerKg ?? null }].slice(-60);
      try { localStorage.setItem(lecturasKey(), JSON.stringify(next)); } catch { /* storage lleno/incógnito: el registro es cosmético */ }
      return next;
    });
  }, [data?.price?.value, data?.pricePenPerKg]);

  const p = data?.price;
  const up = (p?.changePct ?? 0) > 0, down = (p?.changePct ?? 0) < 0;
  // posición del precio en el rango de 52 semanas (0-100%)
  const pos52 = p && p.weekHigh52 != null && p.weekLow52 != null && p.weekHigh52 > p.weekLow52
    ? Math.round(((p.value - p.weekLow52) / (p.weekHigh52 - p.weekLow52)) * 100) : null;

  // análisis computado (determinístico, sin IA) — motor compartido cacao-lecturas:
  // los mismos números que muestra el Pulso, en lenguaje de bodega.
  const stats = useMemo(
    () => (p?.series && p.series.length > 2 ? computeMarketStats(p.series, data?.usdPen ?? null) : null),
    [p?.series, data?.usdPen],
  );
  const insights: string[] = [];
  if (p) {
    if (p.changePct != null) insights.push(`Hoy ${up ? "subió" : down ? "bajó" : "sin cambio"} ${Math.abs(p.changePct).toFixed(1)}% vs cierre anterior (USD ${fmt(p.prevClose)}/t).`);
    if (data?.pricePenPerKg != null) insights.push(`Compra local ≈ S/ ${(data.pricePenPerKg * CHACRA_CC_COMPRA_OFICIAL_FACTOR).toFixed(2)}/kg seco — ${COMPRA_LOCAL_PCT}% del oficial (S/ ${data.pricePenPerKg.toFixed(2)}/kg, FX S/ ${data?.usdPen?.toFixed(2)}/USD).`);
    if (stats) insights.push(...buildLecturas(stats, data?.pricePenPerKg ?? null));
  }

  // Precio efectivo: el del punto del gráfico seleccionado, o el de hoy. El local
  // se escala por la razón de precios (selUsd / hoyUsd) sobre el S//kg de hoy.
  const baseUsd = p?.value ?? null;
  const effUsd = sel?.usd ?? baseUsd;
  const effPen = sel && baseUsd && baseUsd > 0 && data?.pricePenPerKg != null
    ? (data.pricePenPerKg * sel.usd) / baseUsd
    : (data?.pricePenPerKg ?? null);
  // Lo que se paga acá por el grano seco: 88% del oficial (dato real de la zona).
  const compraLocalPen = effPen != null ? effPen * CHACRA_CC_COMPRA_OFICIAL_FACTOR : null;
  const mercadoLocalRef = data?.pricePenPerKg != null ? Math.round(data.pricePenPerKg * CHACRA_CC_COMPRA_OFICIAL_FACTOR * 100) / 100 : null;
  const selDate = sel ? new Date(sel.t).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : null;

  // Mercado LOCAL mensual (ICE→S//kg × 88% oficial) desde la serie de 1 año que
  // ya trae getCacaoMarket. Permite comparar cada compra contra lo que se pagaba
  // acá en SU mes (no una línea plana de hoy). FX = el actual (sin histórico).
  const marketMensual = useMemo(() => {
    const s = data?.price?.series;
    const fx = data?.usdPen;
    if (!s || !fx) return [];
    const byMonth = new Map<string, { sum: number; n: number }>();
    for (const pt of s) {
      const d = new Date(pt.t);
      const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const cur = byMonth.get(mes) ?? { sum: 0, n: 0 };
      cur.sum += pt.c;
      cur.n++;
      byMonth.set(mes, cur);
    }
    return Array.from(byMonth.entries()).map(([mes, v]) => ({
      mes,
      solKg: Math.round(((v.sum / v.n / 1000) * fx * CHACRA_CC_COMPRA_OFICIAL_FACTOR) * 100) / 100,
    }));
  }, [data?.price?.series, data?.usdPen]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">Agrícola · Mercado</p>
          <SectionTitle className="mt-0.5 flex items-center gap-2">
            Mercado del cacao
            {p &&
              (data?.stale ? (
                <span
                  title={data.staleAt ? `Último dato: ${relTime(data.staleAt)}` : "Fuente no disponible"}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--data-warning-700)]"
                >
                  <AlertCircle className="h-3 w-3" /> Desactualizado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--data-success-700)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--data-success-600)]" /> En vivo
                </span>
              ))}
          </SectionTitle>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            Precio internacional, conversión a soles y noticias. Datos: ICE (Yahoo Finance) + Google Noticias{p ? ` · ${relTime(p.asOf) || "recién"}` : ""}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setAuto((v) => !v)}
            aria-pressed={auto}
            title={auto ? "Lectura automática cada 5 min activada — click para pausar" : "Activar lectura automática cada 5 min"}
            className={`inline-flex h-10 items-center gap-2 rounded-2xl border-2 px-3.5 text-sm font-bold transition ${auto ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}
          >
            <span className={`h-2 w-2 rounded-full ${auto ? "animate-pulse bg-[var(--accent)]" : "bg-[var(--rule-base)]"}`} aria-hidden />
            {auto ? <>Auto · <span className="font-mono tabular-nums">{mmss(countdown)}</span></> : "Auto off"}
          </button>
          <button type="button" onClick={refreshNow} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button>
        </div>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>No se pudo cargar el mercado:</strong> {error}</div></div>}

      {loading && !data && <div className="p-12 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando mercado del cacao…</p></div>}

      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Precio */}
          <div className="lg:col-span-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
            {p ? (
              <>
                {/* HERO: referencia local en soles — el número que le importa al productor */}
                <div className="rounded-xl bg-[var(--accent-soft)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                      {sel ? `Compra local · ${selDate}` : `Compra local · grano seco (${COMPRA_LOCAL_PCT}% del oficial)`}
                    </p>
                    {sel && (
                      <button type="button" onClick={() => setSel(null)} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:brightness-95">
                        <RefreshCw className="h-3 w-3" /> Volver a hoy
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <span className="font-mono text-4xl font-extrabold leading-none tabular-nums text-[var(--accent)]">S/ {compraLocalPen != null ? compraLocalPen.toFixed(2) : "—"}</span>
                      <span className="mb-1.5 text-sm font-bold text-[var(--text-secondary)]">/ kg</span>
                    </div>
                    {!sel && p.spark && p.spark.length > 1 && (
                      <div className="mb-0.5" title="Tendencia reciente del precio ICE">
                        <Sparkline data={p.spark} />
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-secondary)]">≈ {COMPRA_LOCAL_PCT}% del precio oficial (S/ {effPen != null ? effPen.toFixed(2) : "—"}/kg, ICE al cambio S/ {data.usdPen != null ? data.usdPen.toFixed(2) : "—"}/USD) — lo que se paga acá por el grano seco. Calibrado con S/ 18.20 del vie 10 jul.</p>
                </div>

                {/* Contexto internacional */}
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div>
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Mundo · ICE New York</p>
                    <div className="mt-0.5 flex flex-wrap items-end gap-2">
                      <span className="font-mono text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">USD {fmt(effUsd)}</span>
                      <span className="mb-0.5 text-xs text-[var(--text-tertiary)]">/ tonelada</span>
                    </div>
                  </div>
                  {!sel && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ${up ? "bg-[var(--data-success-100)] text-[var(--data-success-700)]" : down ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
                      {up ? <TrendingUp className="h-4 w-4" /> : down ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                      {p.changePct != null ? `${up ? "+" : ""}${p.changePct}% hoy` : "—"}
                    </span>
                  )}
                </div>

                {/* Rango 52 semanas */}
                {pos52 != null && (
                  <div className="mt-5">
                    <div className="mb-1 flex justify-between text-xs text-[var(--text-tertiary)]"><span>mín 52s: USD {fmt(p.weekLow52)}</span><span>máx 52s: USD {fmt(p.weekHigh52)}</span></div>
                    <div className="relative h-2.5 rounded-full bg-[var(--surface-sunken)]">
                      <div className="absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-[var(--surface-raised)] bg-[var(--accent)] shadow" style={{ left: `${pos52}%` }} />
                    </div>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--rule-soft)] pt-3 text-center">
                  <Cell label="Cierre ant." value={`USD ${fmt(p.prevClose)}`} />
                  <Cell label="Mín / Máx día" value={`${fmt(p.dayLow)} / ${fmt(p.dayHigh)}`} />
                  <Cell label="Actualizado" value={relTime(p.asOf) || "—"} />
                </div>
              </>
            ) : <div className="flex items-center gap-2 py-6 text-[var(--text-tertiary)]"><AlertCircle className="h-5 w-5" /> Precio no disponible ahora. Reintentá en unos minutos.</div>}
          </div>

          {/* Análisis */}
          <div className="rounded-2xl border-2 border-l-[6px] border-[var(--rule-base)] border-l-[var(--accent)] bg-[var(--surface-canvas)]/40 p-5">
            <CardTitle className="mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[var(--accent)]" /> Lectura de mercado</CardTitle>
            {insights.length ? <ul className="space-y-2.5 text-sm text-[var(--text-secondary)]">{insights.map((s, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />{s}</li>)}</ul> : <p className="text-sm text-[var(--text-tertiary)]">Sin datos de precio para analizar.</p>}
            <p className="mt-3 border-t border-[var(--rule-soft)] pt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              Lectura de las {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—"} · se renueva sola cada 5 min{auto ? "" : " (auto en pausa)"}.
            </p>
          </div>
        </div>
      )}

      {/* Pulso del mercado: sesión intradía real (velas 5 min), rango del día,
          FX con variación, stats multi-horizonte y registro de lecturas. */}
      {p && (
        <CacaoMarketPulse
          value={p.value}
          prevClose={p.prevClose}
          dayHigh={p.dayHigh}
          dayLow={p.dayLow}
          asOf={p.asOf}
          series={p.series}
          intraday={data?.intraday ?? []}
          usdPen={data?.usdPen ?? null}
          fxSeries={data?.fxSeries ?? []}
          pricePenPerKg={data?.pricePenPerKg ?? null}
          lecturas={lecturas}
          onPresent={() => setPresentingId("cacao-pulso")}
        />
      )}

      {/* Flujo de precio (gráfico interactivo) — primero. Click en un punto fija ese
          precio histórico en el hero y en "a cuánto se vende". */}
      {p?.series && p.series.length > 1 && (
        <CacaoPriceChart
          series={p.series}
          usdPen={data?.usdPen ?? null}
          onPointSelect={(usd, t) => setSel({ usd, t })}
          selectedT={sel?.t ?? null}
          onPresent={() => setPresentingId("cacao-flujo")}
        />
      )}

      {/* Tabla de conversión: ICE × FX del día → S//kg oficial → 88% compra local,
          con variación vs fila base y filtros de período/rango/semanas. */}
      {p?.series && p.series.length > 1 && (
        <CacaoTablaConversion
          series={p.series}
          fxSeries={data?.fxSeries ?? []}
          usdPen={data?.usdPen ?? null}
          onPresent={() => setPresentingId("cacao-tabla")}
        />
      )}

      {/* A cuánto se vende por plaza — compacto, debajo del gráfico. Refleja el
          precio efectivo (hoy o el punto seleccionado). */}
      {data && <CacaoPreciosRegionales refSolKg={effPen} usdPen={data.usdPen} onPresent={() => setPresentingId("cacao-plazas")} />}

      <CacaoMiPrecio marketRefSolKg={mercadoLocalRef} marketMensual={marketMensual} onPresent={() => setPresentingId("cacao-mi-precio")} />

      {/* Vista completa tipo presentación: un solo modal navega los 3 charts
          (← →, modo TV, PNG). Renderiza instancias frescas — el estado del modal
          (rango/unidad) es independiente del card de la página. */}
      <ChartPresentationModal
        items={[
          ...(p
            ? [{
                id: "cacao-pulso",
                title: "Pulso del mercado · sesión de hoy",
                render: () => (
                  <CacaoMarketPulse
                    value={p.value} prevClose={p.prevClose} dayHigh={p.dayHigh} dayLow={p.dayLow} asOf={p.asOf}
                    series={p.series} intraday={data?.intraday ?? []} usdPen={data?.usdPen ?? null}
                    fxSeries={data?.fxSeries ?? []} pricePenPerKg={data?.pricePenPerKg ?? null} lecturas={lecturas}
                  />
                ),
              }]
            : []),
          ...(p?.series && p.series.length > 1
            ? (() => {
                const serie = p.series;
                return [{
                  id: "cacao-flujo",
                  title: "Flujo de precio del cacao",
                  render: () => (
                    <CacaoPriceChart series={serie} usdPen={data?.usdPen ?? null} onPointSelect={(usd, t) => setSel({ usd, t })} selectedT={sel?.t ?? null} />
                  ),
                }];
              })()
            : []),
          ...(p?.series && p.series.length > 1
            ? (() => {
                const serie = p.series;
                return [{
                  id: "cacao-tabla",
                  title: "Tabla de conversión del cacao",
                  render: () => <CacaoTablaConversion series={serie} fxSeries={data?.fxSeries ?? []} usdPen={data?.usdPen ?? null} />,
                }];
              })()
            : []),
          ...(data
            ? [{
                id: "cacao-plazas",
                title: "A cuánto se vende · S//kg por plaza",
                render: () => <CacaoPreciosRegionales refSolKg={effPen} usdPen={data.usdPen} />,
              }]
            : []),
          {
            id: "cacao-mi-precio",
            title: "Mi precio en el tiempo · S//kg",
            render: () => <CacaoMiPrecio marketRefSolKg={mercadoLocalRef} marketMensual={marketMensual} />,
          },
        ]}
        activeId={presentingId}
        onClose={() => setPresentingId(null)}
        onNavigate={setPresentingId}
      />
    </div>
  );
}

/** Sparkline SVG liviano (sin recharts) para el hero — tendencia reciente del ICE. */
function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;
  const w = 132, h = 34;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * h}`)
    .join(" ");
  const upTrend = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ stroke: upTrend ? "var(--data-success-500)" : "var(--data-error-500)" }}
      />
    </svg>
  );
}
function Cell({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div><div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{value}</div></div>;
}
