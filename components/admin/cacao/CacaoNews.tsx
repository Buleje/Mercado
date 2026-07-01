"use client";

/**
 * CacaoNews — sub-vista "Noticias" del módulo Cacao (separada de Mercado por
 * pedido de Brandon 2026-06-30). Feed de Google Noticias del cacao + fuentes
 * oficiales de precios. Self-fetch del endpoint de mercado (usa solo la parte
 * de news). ADR-128.
 */
import { useCallback, useEffect, useState } from "react";
import { Newspaper, RefreshCw, Globe, ExternalLink, AlertCircle, Coins, ArrowUpRight } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";

interface NewsItem { title: string; source: string | null; link: string; pubDate: string | null }

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export default function CacaoNews() {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao/market", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setNews((await r.json()).news ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">Agrícola · Noticias</p>
          <SectionTitle className="mt-0.5">Noticias del cacao</SectionTitle>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">Lo último del cacao en Perú y el mundo. Fuente: Google Noticias.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>No se pudieron cargar las noticias:</strong> {error}</div></div>}

      {loading && !news && <div className="p-12 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando noticias del cacao…</p></div>}

      {news && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="flex items-center gap-2 border-b-2 border-[var(--rule-soft)] px-5 py-3">
            <Newspaper className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">{news.length} noticia{news.length === 1 ? "" : "s"}</span>
            <span className="text-xs text-[var(--text-tertiary)]">· Perú y mundo</span>
          </div>
          {news.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--text-tertiary)]">Sin noticias disponibles ahora.</p>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)]">
              {news.map((n, i) => (
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

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <Coins className="h-3.5 w-3.5" /> Fuentes oficiales:
        <RefLink href="https://www.icco.org/statistics/" label="ICCO (precios diarios)" />
        <RefLink href="https://www.investing.com/commodities/us-cocoa" label="Investing — Cocoa" />
        <RefLink href="https://www.gob.pe/midagri" label="MIDAGRI Perú" />
      </div>
    </div>
  );
}

function RefLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1 font-medium text-[var(--text-secondary)] hover:text-[var(--accent)]">{label}<ArrowUpRight className="h-3 w-3" /></a>;
}
