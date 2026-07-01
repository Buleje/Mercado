"use client";

/**
 * CacaoNews — sub-vista "Noticias" del módulo Cacao (separada de Mercado por
 * pedido de Brandon 2026-06-30). Feed de Google Noticias del cacao con sentimiento
 * por titular (reusa el clasificador del asesor), buscador + filtros, agrupado por
 * antigüedad y resiliencia (último feed conocido si la fuente cae). ADR-128.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Newspaper, RefreshCw, Globe, ExternalLink, AlertCircle, Coins, ArrowUpRight,
  TrendingUp, TrendingDown, Minus, Search, Sparkles, MapPin, MessageCircle,
} from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { classifyNewsSentiment, newsKeywords } from "@/lib/cacao/cacao-advisor";
import { shareCacaoText } from "@/lib/cacao/cacao-print";

interface NewsItem { title: string; source: string | null; link: string; pubDate: string | null }
type Sent = "alcista" | "bajista" | "neutral";
type Filter = "todas" | "peru" | "alcistas" | "bajistas" | "recientes";

/** Detecta noticias de Perú / zona local del acopiador. */
const PERU_RE = /(per[uú]|pucallpa|ucayali|san mart[ií]n|jun[ií]n|hu[aá]nuco|amazon[ao]s|midagri|senasa|devida|vraem|tocache|cacao peruano|fino de aroma|selva central)/i;
const esPeruNews = (n: { title: string; source: string | null }) => PERU_RE.test(`${n.title} ${n.source ?? ""}`);
/** Qué implica el sesgo de noticias para el precio. */
const IMPACTO: Record<Sent | "mixto", string> = {
  alcista: "El sesgo de las noticias apunta a una SUBA del precio (escasez / problemas de oferta).",
  bajista: "El sesgo de las noticias apunta a una BAJA del precio (más oferta / demanda floja).",
  mixto: "Las noticias están mezcladas — sin una dirección clara del precio por ahora.",
  neutral: "Sin señales fuertes en las noticias sobre la dirección del precio.",
};

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}
function ageGroup(iso: string | null): "hoy" | "semana" | "antes" {
  if (!iso) return "antes";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 86_400_000) return "hoy";
  if (d < 7 * 86_400_000) return "semana";
  return "antes";
}
const SENT_META: Record<Sent, { label: string; cls: string; Icon: typeof TrendingUp }> = {
  alcista: { label: "Alcista", cls: "bg-[var(--data-success-100)] text-[var(--data-success-900)]", Icon: TrendingUp },
  bajista: { label: "Bajista", cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]", Icon: TrendingDown },
  neutral: { label: "Neutral", cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", Icon: Minus },
};
const GROUP_LABEL: Record<"hoy" | "semana" | "antes", string> = {
  hoy: "Hoy", semana: "Esta semana", antes: "Antes",
};
const FILTERS: { v: Filter; label: string }[] = [
  { v: "todas", label: "Todas" },
  { v: "peru", label: "Perú" },
  { v: "alcistas", label: "Alcistas" },
  { v: "bajistas", label: "Bajistas" },
  { v: "recientes", label: "Recientes" },
];

export default function CacaoNews() {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [stale, setStale] = useState<{ on: boolean; at: string | null }>({ on: false, at: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(true);

  // Resumen IA del día (endpoint aparte, progressive — no bloquea el feed).
  useEffect(() => {
    let alive = true;
    setDigestLoading(true);
    fetch("/api/admin/cacao/news-digest", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setDigest(d?.digest ?? null); })
      .catch((err) => { console.warn("[cacao] resumen IA de noticias no disponible", err); })
      .finally(() => { if (alive) setDigestLoading(false); });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao/market", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const d = await r.json();
      setNews(d.news ?? []);
      setStale({ on: !!d.newsStale, at: d.newsStaleAt ?? null });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Clasificar + keywords + origen (Perú/Mundo) por titular.
  const items = useMemo(
    () => (news ?? []).map((n) => ({
      ...n,
      sent: classifyNewsSentiment(n.title) as Sent,
      keywords: newsKeywords(n.title),
      peru: esPeruNews(n),
    })),
    [news],
  );
  const resumen = useMemo(() => {
    let alcista = 0, bajista = 0;
    for (const i of items) { if (i.sent === "alcista") alcista++; else if (i.sent === "bajista") bajista++; }
    const sesgo: Sent | "mixto" =
      alcista > bajista + 1 ? "alcista" : bajista > alcista + 1 ? "bajista" : alcista === 0 && bajista === 0 ? "neutral" : "mixto";
    return { alcista, bajista, sesgo };
  }, [items]);

  // Filtro + búsqueda + orden (más recientes primero) + agrupado por antigüedad.
  const grupos = useMemo(() => {
    const q = search.trim().toLowerCase();
    const recienteLimite = Date.now() - 48 * 3.6e6;
    const filtrado = items.filter((n) => {
      if (q && !(`${n.title} ${n.source ?? ""}`.toLowerCase().includes(q))) return false;
      if (filter === "peru") return n.peru;
      if (filter === "alcistas") return n.sent === "alcista";
      if (filter === "bajistas") return n.sent === "bajista";
      if (filter === "recientes") return n.pubDate != null && new Date(n.pubDate).getTime() >= recienteLimite;
      return true;
    });
    filtrado.sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0));
    const byGroup: Record<"hoy" | "semana" | "antes", typeof filtrado> = { hoy: [], semana: [], antes: [] };
    for (const n of filtrado) byGroup[ageGroup(n.pubDate)].push(n);
    return { total: filtrado.length, byGroup };
  }, [items, search, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">Agrícola · Noticias</p>
          <SectionTitle className="mt-0.5 flex items-center gap-2">
            Noticias del cacao
            {stale.on && (
              <span title={stale.at ? `Último feed: ${relTime(stale.at)}` : "Fuente no disponible"} className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--data-warning-900)]">
                <AlertCircle className="h-3 w-3" /> Desactualizado
              </span>
            )}
          </SectionTitle>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">Lo último del cacao en Perú y el mundo, con su sesgo de precio. Fuente: Google Noticias.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button>
      </div>

      {/* Resumen IA del día */}
      {(digest || digestLoading) && (
        <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-4">
          <h3 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-[var(--accent)]"><Sparkles className="h-4 w-4" /> Resumen del día</h3>
          {digest ? (
            <p className="text-sm leading-relaxed text-[var(--text-primary)]">{digest}</p>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">{digestLoading ? "Analizando los titulares de hoy…" : "Resumen no disponible ahora."}</p>
          )}
        </div>
      )}

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>No se pudieron cargar las noticias:</strong> {error}</div></div>}

      {loading && !news && <div className="p-12 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando noticias del cacao…</p></div>}

      {news && (
        <>
          {/* Barra de resumen de sentimiento */}
          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-sm">
              <span className="font-bold text-[var(--text-primary)]">{items.length} noticia{items.length === 1 ? "" : "s"}</span>
              <SentChip sent="alcista" count={resumen.alcista} />
              <SentChip sent="bajista" count={resumen.bajista} />
              <span className="ml-auto flex items-center gap-1.5 text-[var(--text-secondary)]">
                Sesgo general:
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${resumen.sesgo === "alcista" ? SENT_META.alcista.cls : resumen.sesgo === "bajista" ? SENT_META.bajista.cls : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
                  {resumen.sesgo === "alcista" ? <TrendingUp className="h-3.5 w-3.5" /> : resumen.sesgo === "bajista" ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                  {resumen.sesgo}
                </span>
              </span>
            </div>
          )}

          {/* Impacto en el precio del sesgo de noticias */}
          {items.length > 0 && (
            <p className="flex items-start gap-2 px-1 text-sm text-[var(--text-secondary)]">
              {resumen.sesgo === "alcista" ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-600)]" /> : resumen.sesgo === "bajista" ? <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-600)]" /> : <Minus className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />}
              {IMPACTO[resumen.sesgo]}
            </p>
          )}

          {/* Buscador + filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-11 min-w-[200px] flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
              <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en titulares y fuentes…" className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none" />
            </div>
            <div className="inline-flex rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
              {FILTERS.map((f) => (
                <button key={f.v} type="button" onClick={() => setFilter(f.v)} className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${filter === f.v ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{f.label}</button>
              ))}
            </div>
          </div>

          {/* Lista agrupada por antigüedad */}
          {grupos.total === 0 ? (
            <p className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              {items.length === 0 ? "Sin noticias disponibles ahora." : "Sin resultados para tu búsqueda o filtro."}
            </p>
          ) : (
            <div className="space-y-4">
              {(["hoy", "semana", "antes"] as const).map((g) =>
                grupos.byGroup[g].length === 0 ? null : (
                  <div key={g} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
                    <div className="flex items-center gap-2 border-b-2 border-[var(--rule-soft)] px-5 py-2.5">
                      <Newspaper className="h-4 w-4 text-[var(--accent)]" />
                      <span className="text-sm font-bold text-[var(--text-primary)]">{GROUP_LABEL[g]}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">· {grupos.byGroup[g].length}</span>
                    </div>
                    <ul className="divide-y divide-[var(--rule-soft)]">
                      {grupos.byGroup[g].map((n, i) => {
                        const meta = SENT_META[n.sent];
                        return (
                          <li key={`${g}-${i}`} className="flex items-stretch">
                            <a href={n.link} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 flex-1 items-start gap-3 px-5 py-3.5 transition hover:bg-[var(--surface-sunken)]">
                              <span className={`mt-0.5 inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[length:var(--ts-2xs)] font-bold ${meta.cls}`} title={`Sesgo ${meta.label.toLowerCase()}`}>
                                <meta.Icon className="h-3 w-3" />{meta.label}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]"><Highlight text={n.title} keywords={n.keywords} /></span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                                  <Globe className="h-3 w-3" />{n.source ?? "Fuente"}{n.pubDate ? ` · ${relTime(n.pubDate)}` : ""}
                                  <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold ${n.peru ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
                                    {n.peru ? <><MapPin className="h-2.5 w-2.5" />Perú</> : "Mundo"}
                                  </span>
                                </span>
                              </span>
                              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] opacity-0 transition group-hover:opacity-100" />
                            </a>
                            <button type="button" onClick={() => shareCacaoText("Noticia del cacao", `${n.title}\n${n.link}`)} title="Compartir por WhatsApp" aria-label="Compartir noticia" className="flex shrink-0 items-center px-3 text-[var(--text-tertiary)] hover:bg-[var(--data-success-50)] hover:text-[var(--data-success-700)]">
                              <MessageCircle className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <Coins className="h-3.5 w-3.5" /> Fuentes oficiales:
        <RefLink href="https://www.icco.org/statistics/" label="ICCO (precios diarios)" />
        <RefLink href="https://www.investing.com/commodities/us-cocoa" label="Investing — Cocoa" />
        <RefLink href="https://www.gob.pe/midagri" label="MIDAGRI Perú" />
        <RefLink href="https://www.gob.pe/institucion/midagri/informes-publicaciones" label="SIEA — precios en chacra" />
        <RefLink href="https://www.cocoainitiative.org/news" label="Cocoa Initiative" />
      </div>
    </div>
  );
}

function Highlight({ text, keywords }: { text: string; keywords: { word: string; pol: "alcista" | "bajista" }[] }) {
  if (!keywords.length) return <>{text}</>;
  const pat = keywords.map((k) => k.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const parts = text.split(new RegExp(`(${pat})`, "gi"));
  return (
    <>
      {parts.map((p, i) => {
        const kw = keywords.find((k) => k.word.toLowerCase() === p.toLowerCase());
        return kw ? (
          <mark key={i} className={`bg-transparent px-0.5 font-bold ${kw.pol === "alcista" ? "text-[var(--data-success-700)]" : "text-[var(--data-error-700)]"}`}>{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </>
  );
}
function SentChip({ sent, count }: { sent: Sent; count: number }) {
  const meta = SENT_META[sent];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${meta.cls}`}>
      <meta.Icon className="h-3.5 w-3.5" />{count} {meta.label.toLowerCase()}{count === 1 ? "" : "s"}
    </span>
  );
}
function RefLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1 font-medium text-[var(--text-secondary)] hover:text-[var(--accent)]">{label}<ArrowUpRight className="h-3 w-3" /></a>;
}
