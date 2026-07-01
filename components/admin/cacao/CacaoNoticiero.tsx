"use client";

/**
 * CacaoNoticiero — apartado de mercado/noticias del cacao (ADR-128).
 * Precio ICE en vivo + conversión a S//kg + análisis computado (sin IA, sin
 * alucinación) + feed de noticias (Google News) + enlaces de referencia.
 */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { SectionTitle, CardTitle } from "@buleje/design-system";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, AlertCircle, Activity,
} from "@buleje/design-system/icons";
// Escalera de precios por plaza (sin recharts → import eager, liviano)
import CacaoPreciosRegionales from "./CacaoPreciosRegionales";

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
interface Market { price: Price | null; usdPen: number | null; pricePenPerKg: number | null; news: NewsItem[]; generatedAt: string }

const fmt = (v: number | null, d = 0) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }));
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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao/market", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const p = data?.price;
  const up = (p?.changePct ?? 0) > 0, down = (p?.changePct ?? 0) < 0;
  // posición del precio en el rango de 52 semanas (0-100%)
  const pos52 = p && p.weekHigh52 != null && p.weekLow52 != null && p.weekHigh52 > p.weekLow52
    ? Math.round(((p.value - p.weekLow52) / (p.weekHigh52 - p.weekLow52)) * 100) : null;

  // análisis computado (determinístico, sin IA)
  const insights: string[] = [];
  if (p) {
    if (p.changePct != null) insights.push(`Hoy ${up ? "subió" : down ? "bajó" : "sin cambio"} ${Math.abs(p.changePct).toFixed(1)}% vs cierre anterior (USD ${fmt(p.prevClose)}/t).`);
    if (pos52 != null) insights.push(pos52 >= 80 ? `Cerca de su máximo de 52 semanas (USD ${fmt(p.weekHigh52)}/t) — precios altos para el productor.` : pos52 <= 20 ? `Cerca de su mínimo de 52 semanas (USD ${fmt(p.weekLow52)}/t) — momento de compra barata.` : `En la zona media de su rango anual (${pos52}% entre mín y máx de 52 sem).`);
    if (data?.pricePenPerKg != null) insights.push(`Referencia internacional ≈ S/ ${data.pricePenPerKg.toFixed(2)}/kg seco (FX S/ ${data?.usdPen?.toFixed(2)}/USD). Tu precio en chacra suele ir por debajo (flete + margen).`);
  }

  // Precio efectivo: el del punto del gráfico seleccionado, o el de hoy. El local
  // se escala por la razón de precios (selUsd / hoyUsd) sobre el S//kg de hoy.
  const baseUsd = p?.value ?? null;
  const effUsd = sel?.usd ?? baseUsd;
  const effPen = sel && baseUsd && baseUsd > 0 && data?.pricePenPerKg != null
    ? (data.pricePenPerKg * sel.usd) / baseUsd
    : (data?.pricePenPerKg ?? null);
  const selDate = sel ? new Date(sel.t).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">Agrícola · Mercado</p>
          <SectionTitle className="mt-0.5 flex items-center gap-2">
            Mercado del cacao
            {p && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--data-success-900)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--data-success-600)]" /> En vivo
              </span>
            )}
          </SectionTitle>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            Precio internacional, conversión a soles y noticias. Datos: ICE (Yahoo Finance) + Google Noticias{p ? ` · ${relTime(p.asOf) || "recién"}` : ""}.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button>
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
                      {sel ? `Precio del ${selDate}` : "Referencia local · grano seco"}
                    </p>
                    {sel && (
                      <button type="button" onClick={() => setSel(null)} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:brightness-95">
                        <RefreshCw className="h-3 w-3" /> Volver a hoy
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-end gap-2">
                    <span className="font-mono text-4xl font-extrabold leading-none tabular-nums text-[var(--accent)]">S/ {effPen != null ? effPen.toFixed(2) : "—"}</span>
                    <span className="mb-1.5 text-sm font-bold text-[var(--text-secondary)]">/ kg</span>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-secondary)]">Convertido del precio ICE al cambio S/ {data.usdPen != null ? data.usdPen.toFixed(2) : "—"}/USD. En chacra suele cerrarse algo por debajo (flete + margen del acopiador).</p>
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
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ${up ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : down ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
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
          </div>
        </div>
      )}

      {/* Flujo de precio (gráfico interactivo) — primero. Click en un punto fija ese
          precio histórico en el hero y en "a cuánto se vende". */}
      {p?.series && p.series.length > 1 && (
        <CacaoPriceChart
          series={p.series}
          usdPen={data?.usdPen ?? null}
          onPointSelect={(usd, t) => setSel({ usd, t })}
          selectedT={sel?.t ?? null}
        />
      )}

      {/* A cuánto se vende por plaza — compacto, debajo del gráfico. Refleja el
          precio efectivo (hoy o el punto seleccionado). */}
      {data && <CacaoPreciosRegionales refSolKg={effPen} usdPen={data.usdPen} />}

      <CacaoMiPrecio marketRefSolKg={data?.pricePenPerKg ?? null} />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div><div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{value}</div></div>;
}
