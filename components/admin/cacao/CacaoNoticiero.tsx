"use client";

/**
 * CacaoNoticiero — apartado de mercado/noticias del cacao (ADR-128).
 * Precio ICE en vivo + conversión a S//kg + análisis computado (sin IA, sin
 * alucinación) + feed de noticias (Google News) + enlaces de referencia.
 */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Newspaper, RefreshCw, TrendingUp, TrendingDown, Minus, ExternalLink, AlertCircle, Coins, Globe, ArrowUpRight, Activity,
} from "@buleje/design-system/icons";

// recharts fuera del bundle inicial del admin
const CacaoPriceChart = dynamic(() => import("./CacaoPriceChart"), {
  ssr: false,
  loading: () => <div className="flex h-[360px] items-center justify-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-tertiary)]"><Activity className="mr-2 h-5 w-5 animate-pulse" /> Cargando gráfico…</div>,
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-tertiary)]">Precio internacional en vivo, conversión a soles y noticias del cacao. Datos: ICE (Yahoo Finance) + Google Noticias.</p>
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
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Cacao · ICE New York (USD / tonelada)</p>
                    <div className="mt-1 flex items-end gap-3">
                      <span className="font-mono text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">{fmt(p.value)}</span>
                      <span className={`mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ${up ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : down ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
                        {up ? <TrendingUp className="h-4 w-4" /> : down ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                        {p.changePct != null ? `${up ? "+" : ""}${p.changePct}%` : "—"}
                      </span>
                    </div>
                    {data.pricePenPerKg != null && <p className="mt-1 text-sm text-[var(--text-secondary)]">≈ <b className="text-[var(--text-primary)]">S/ {data.pricePenPerKg.toFixed(2)}/kg</b> seco (referencia internacional)</p>}
                  </div>
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
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]/40 p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><TrendingUp className="h-4 w-4 text-[var(--accent)]" /> Lectura de mercado</h3>
            {insights.length ? <ul className="space-y-2.5 text-sm text-[var(--text-secondary)]">{insights.map((s, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />{s}</li>)}</ul> : <p className="text-sm text-[var(--text-tertiary)]">Sin datos de precio para analizar.</p>}
          </div>
        </div>
      )}

      {/* Flujo de precio + analítica de movimiento */}
      {p?.series && p.series.length > 1 && <CacaoPriceChart series={p.series} />}

      {/* Noticias */}
      {data && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="flex items-center gap-2 border-b-2 border-[var(--rule-soft)] px-5 py-3">
            <Newspaper className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Noticias del cacao</h3>
            <span className="text-xs text-[var(--text-tertiary)]">· Perú y mundo</span>
          </div>
          {data.news.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--text-tertiary)]">Sin noticias disponibles ahora.</p>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)]">
              {data.news.map((n, i) => (
                <li key={i}>
                  <a href={n.link} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 px-5 py-3.5 transition hover:bg-[var(--surface-sunken)]">
                    <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">{n.title}</span>
                      <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">{n.source ?? "Fuente"}{n.pubDate ? ` · ${relTime(n.pubDate)}` : ""}</span>
                    </span>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] opacity-0 transition group-hover:opacity-100" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Referencias */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <Coins className="h-3.5 w-3.5" /> Fuentes oficiales:
        <RefLink href="https://www.icco.org/statistics/" label="ICCO (precios diarios)" />
        <RefLink href="https://www.investing.com/commodities/us-cocoa" label="Investing — Cocoa" />
        <RefLink href="https://www.gob.pe/midagri" label="MIDAGRI Perú" />
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div><div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{value}</div></div>;
}
function RefLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1 font-medium text-[var(--text-secondary)] hover:text-[var(--accent)]">{label}<ArrowUpRight className="h-3 w-3" /></a>;
}
