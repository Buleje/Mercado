"use client";

/**
 * CacaoNews — sub-vista "Noticias" del módulo Cacao (separada de Mercado por
 * pedido de Brandon 2026-06-30). Feed de Google Noticias del cacao con sentimiento
 * por titular (reusa el clasificador del asesor), buscador + filtros COMBINABLES
 * (geo · sentimiento · fuente), sesgo calculado sobre las noticias recientes (14d),
 * separación Recientes/Histórico, y resiliencia (último feed conocido si la fuente
 * cae). Geo: usa el origen del backend (query PE vs mundial) + fallback por keywords.
 * ADR-128.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Newspaper, RefreshCw, Globe, ExternalLink, AlertCircle, Coins, ArrowUpRight,
  TrendingUp, TrendingDown, Minus, Search, Sparkles, MapPin, MessageCircle,
  ChevronDown, Clock, X,
} from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { classifyNewsSentiment, newsKeywords } from "@/lib/cacao/cacao-advisor";
import { shareCacaoText } from "@/lib/cacao/cacao-print";

interface NewsItem { title: string; source: string | null; link: string; pubDate: string | null; origen?: "pe" | "world" }
type Sent = "alcista" | "bajista" | "neutral";
type Geo = "todas" | "peru" | "mundo";
type SentFilter = "todas" | "alcistas" | "bajistas" | "neutrales";

const DAY = 86_400_000;
const RECIENTE_DIAS = 14; // ventana para el "sesgo reciente"
const HISTORICO_DIAS = 30; // > 30 días = histórico (colapsable)

/** Detecta noticias de Perú / zona local del acopiador (fallback si falta `origen`). */
const PERU_RE = /(per[uú]|pucallpa|ucayali|san mart[ií]n|jun[ií]n|hu[aá]nuco|amazon[ao]s|cusco|cuzco|piura|cajamarca|tumbes|loreto|madre de dios|ayacucho|apur[ií]mac|pasco|midagri|senasa|devida|vraem|tocache|appcacao|promper[uú]|sierra exportadora|cacao peruano|fino de aroma|selva central)/i;
const esPeruNews = (n: NewsItem) => n.origen === "pe" || PERU_RE.test(`${n.title} ${n.source ?? ""}`);
/** Qué implica el sesgo de noticias para el precio. */
const IMPACTO: Record<Sent | "mixto", string> = {
  alcista: "El sesgo de las noticias recientes apunta a una SUBA del precio (escasez / problemas de oferta).",
  bajista: "El sesgo de las noticias recientes apunta a una BAJA del precio (más oferta / demanda floja).",
  mixto: "Las noticias recientes están mezcladas — sin una dirección clara del precio por ahora.",
  neutral: "Pocas señales fuertes en las noticias recientes sobre la dirección del precio.",
};

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(diff / 3.6e6);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}
type Bucket = "hoy" | "semana" | "mes" | "historico";
function ageGroup(iso: string | null): Bucket {
  if (!iso) return "historico";
  const d = Date.now() - new Date(iso).getTime();
  if (d < DAY) return "hoy";
  if (d < 7 * DAY) return "semana";
  if (d <= HISTORICO_DIAS * DAY) return "mes";
  return "historico";
}
const SENT_META: Record<Sent, { label: string; cls: string; border: string; Icon: typeof TrendingUp }> = {
  alcista: { label: "Alcista", cls: "bg-[var(--data-success-100)] text-[var(--data-success-900)]", border: "border-l-[var(--data-success-500)]", Icon: TrendingUp },
  bajista: { label: "Bajista", cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]", border: "border-l-[var(--data-error-500)]", Icon: TrendingDown },
  neutral: { label: "Neutral", cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", border: "border-l-[var(--rule-base)]", Icon: Minus },
};
const RECIENTES_LABEL: Record<"hoy" | "semana" | "mes", string> = { hoy: "Hoy", semana: "Esta semana", mes: "Este mes" };
const GEOS: { v: Geo; label: string }[] = [
  { v: "todas", label: "Todas" }, { v: "peru", label: "Perú" }, { v: "mundo", label: "Mundo" },
];
const SENTS: { v: SentFilter; label: string }[] = [
  { v: "todas", label: "Todas" }, { v: "alcistas", label: "Alcistas" }, { v: "bajistas", label: "Bajistas" }, { v: "neutrales", label: "Neutrales" },
];

type Item = NewsItem & { sent: Sent; keywords: { word: string; pol: "alcista" | "bajista" }[]; peru: boolean };

export default function CacaoNews() {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [stale, setStale] = useState<{ on: boolean; at: string | null }>({ on: false, at: null });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [geo, setGeo] = useState<Geo>("todas");
  const [sentF, setSentF] = useState<SentFilter>("todas");
  const [sourceF, setSourceF] = useState<string>("");
  const [showHist, setShowHist] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestAt, setDigestAt] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(true);

  // Resumen IA del día (endpoint aparte, progressive — no bloquea el feed).
  useEffect(() => {
    let alive = true;
    setDigestLoading(true);
    fetch("/api/admin/cacao/news-digest", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setDigest(d?.digest ?? null); setDigestAt(d?.generatedAt ?? null); } })
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
      setUpdatedAt(d.generatedAt ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Clasificar + keywords + origen (Perú/Mundo) por titular.
  const items = useMemo<Item[]>(
    () => (news ?? []).map((n) => ({
      ...n,
      sent: classifyNewsSentiment(n.title) as Sent,
      keywords: newsKeywords(n.title),
      peru: esPeruNews(n),
    })),
    [news],
  );

  // Sesgo SOLO sobre noticias recientes (≤14d): muchos neutrales son viejos y
  // ensucian el promedio. Si no hay fecha, no cuenta para el sesgo reciente.
  const resumen = useMemo(() => {
    const limite = Date.now() - RECIENTE_DIAS * DAY;
    const recientes = items.filter((i) => i.pubDate != null && new Date(i.pubDate).getTime() >= limite);
    let alcista = 0, bajista = 0;
    for (const i of recientes) { if (i.sent === "alcista") alcista++; else if (i.sent === "bajista") bajista++; }
    const sesgo: Sent | "mixto" =
      alcista > bajista + 1 ? "alcista" : bajista > alcista + 1 ? "bajista" : alcista === 0 && bajista === 0 ? "neutral" : "mixto";
    return { alcista, bajista, sesgo, nRecientes: recientes.length };
  }, [items]);

  const sources = useMemo(
    () => [...new Set(items.map((i) => i.source).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  // Filtros COMBINABLES (búsqueda + geo + sentimiento + fuente) → orden por fecha
  // → partición Recientes (≤30d, agrupadas hoy/semana/mes) vs Histórico (>30d).
  const vista = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtrado = items.filter((n) => {
      if (q && !`${n.title} ${n.source ?? ""}`.toLowerCase().includes(q)) return false;
      if (geo === "peru" && !n.peru) return false;
      if (geo === "mundo" && n.peru) return false;
      if (sentF === "alcistas" && n.sent !== "alcista") return false;
      if (sentF === "bajistas" && n.sent !== "bajista") return false;
      if (sentF === "neutrales" && n.sent !== "neutral") return false;
      if (sourceF && n.source !== sourceF) return false;
      return true;
    });
    filtrado.sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0));
    const recientes: Record<"hoy" | "semana" | "mes", Item[]> = { hoy: [], semana: [], mes: [] };
    const historico: Item[] = [];
    for (const n of filtrado) {
      const g = ageGroup(n.pubDate);
      if (g === "historico") historico.push(n); else recientes[g].push(n);
    }
    return { total: filtrado.length, nRecientes: filtrado.length - historico.length, recientes, historico };
  }, [items, search, geo, sentF, sourceF]);

  const filtrosActivos = geo !== "todas" || sentF !== "todas" || !!sourceF || !!search.trim();
  const limpiar = () => { setGeo("todas"); setSentF("todas"); setSourceF(""); setSearch(""); };

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
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button>
          {updatedAt && <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]"><Clock className="h-3 w-3" />Actualizado {relTime(updatedAt)}</span>}
        </div>
      </div>

      {/* Resumen IA del día */}
      {(digest || digestLoading) && (
        <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-4">
          <div role="heading" aria-level={3} className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--accent)]">
            <Sparkles className="h-4 w-4" /> Resumen del día
            {digest && digestAt && <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]"><Clock className="h-3 w-3" />generado {relTime(digestAt)}</span>}
          </div>
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
          {/* Barra de resumen — sesgo sobre noticias recientes (14 días) */}
          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-sm">
              <span className="font-bold text-[var(--text-primary)]">{items.length} noticia{items.length === 1 ? "" : "s"}</span>
              <span className="text-[var(--text-tertiary)]">· {resumen.nRecientes} de los últimos {RECIENTE_DIAS} días</span>
              <SentChip sent="alcista" count={resumen.alcista} />
              <SentChip sent="bajista" count={resumen.bajista} />
              <span className="ml-auto flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span title={`Calculado solo con las noticias de los últimos ${RECIENTE_DIAS} días`}>Sesgo reciente:</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${resumen.sesgo === "alcista" ? SENT_META.alcista.cls : resumen.sesgo === "bajista" ? SENT_META.bajista.cls : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
                  {resumen.sesgo === "alcista" ? <TrendingUp className="h-3.5 w-3.5" /> : resumen.sesgo === "bajista" ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                  {resumen.sesgo}
                </span>
              </span>
            </div>
          )}

          {/* Impacto en el precio del sesgo reciente */}
          {items.length > 0 && (
            <p className="flex items-start gap-2 px-1 text-sm text-[var(--text-secondary)]">
              {resumen.sesgo === "alcista" ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-600)]" /> : resumen.sesgo === "bajista" ? <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-600)]" /> : <Minus className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />}
              {IMPACTO[resumen.sesgo]}
            </p>
          )}

          {/* Buscador + filtros COMBINABLES */}
          <div className="space-y-2.5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-11 min-w-[200px] flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4">
                <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en titulares y fuentes…" className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none" />
              </div>
              <select value={sourceF} onChange={(e) => setSourceF(e.target.value)} aria-label="Filtrar por fuente" className="h-11 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none">
                <option value="">Todas las fuentes</option>
                {sources.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <PillGroup label="Origen" options={GEOS} value={geo} onChange={setGeo} />
              <PillGroup label="Sesgo" options={SENTS} value={sentF} onChange={setSentF} />
              {filtrosActivos && (
                <button type="button" onClick={limpiar} className="ml-auto inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"><X className="h-3.5 w-3.5" />Limpiar filtros</button>
              )}
            </div>
          </div>

          {/* Lista: Recientes agrupadas + Histórico colapsable */}
          {vista.total === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center">
              <Newspaper className="mx-auto h-7 w-7 text-[var(--text-tertiary)]" />
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                {items.length === 0 ? "Sin noticias disponibles ahora. Probá actualizar en un rato." : "Ninguna noticia coincide con los filtros."}
              </p>
              {items.length > 0 && filtrosActivos && <button type="button" onClick={limpiar} className="mt-3 inline-flex items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-3.5 w-3.5" />Limpiar filtros</button>}
            </div>
          ) : (
            <div className="space-y-4">
              {vista.nRecientes === 0 && (
                <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-center text-sm text-[var(--text-tertiary)]">Sin noticias recientes con estos filtros — mirá el histórico más abajo.</p>
              )}
              {(["hoy", "semana", "mes"] as const).map((g) =>
                vista.recientes[g].length === 0 ? null : (
                  <NewsGroup key={g} title={RECIENTES_LABEL[g]} count={vista.recientes[g].length} items={vista.recientes[g]} groupKey={g} />
                ),
              )}

              {vista.historico.length > 0 && (
                <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
                  <button type="button" onClick={() => setShowHist((v) => !v)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left hover:bg-[var(--surface-sunken)]">
                    <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                    <span className="text-sm font-bold text-[var(--text-primary)]">Histórico</span>
                    <span className="text-xs text-[var(--text-tertiary)]">· {vista.historico.length} · más de {HISTORICO_DIAS} días</span>
                    <ChevronDown className={`ml-auto h-4 w-4 text-[var(--text-tertiary)] transition ${showHist ? "rotate-180" : ""}`} />
                  </button>
                  {showHist && (
                    <ul className="divide-y divide-[var(--rule-soft)] border-t-2 border-[var(--rule-soft)]">
                      {vista.historico.map((n, i) => <NewsRow key={`hist-${i}`} n={n} />)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Fuentes oficiales — clicables y destacadas */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]"><Coins className="h-4 w-4 text-[var(--accent)]" />Fuentes oficiales para verificar precios</p>
        <div className="flex flex-wrap gap-2">
          <RefLink href="https://www.icco.org/statistics/" label="ICCO (precios diarios)" />
          <RefLink href="https://www.investing.com/commodities/us-cocoa" label="Investing — Cocoa" />
          <RefLink href="https://www.gob.pe/midagri" label="MIDAGRI Perú" />
          <RefLink href="https://www.gob.pe/institucion/midagri/informes-publicaciones" label="SIEA — precios en chacra" />
          <RefLink href="https://www.cocoainitiative.org/news" label="Cocoa Initiative" />
        </div>
      </div>
    </div>
  );
}

function NewsGroup({ title, count, items, groupKey }: { title: string; count: number; items: Item[]; groupKey: string }) {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex items-center gap-2 border-b-2 border-[var(--rule-soft)] px-5 py-2.5">
        <Newspaper className="h-4 w-4 text-[var(--accent)]" />
        <span className="text-sm font-bold text-[var(--text-primary)]">{title}</span>
        <span className="text-xs text-[var(--text-tertiary)]">· {count}</span>
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {items.map((n, i) => <NewsRow key={`${groupKey}-${i}`} n={n} />)}
      </ul>
    </div>
  );
}

function NewsRow({ n }: { n: Item }) {
  const meta = SENT_META[n.sent];
  return (
    <li className={`flex items-stretch border-l-4 ${meta.border}`}>
      <a href={n.link} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 flex-1 items-start gap-3 px-5 py-3.5 transition hover:bg-[var(--surface-sunken)]">
        <span className={`mt-0.5 inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[length:var(--ts-2xs)] font-bold ${meta.cls}`} title={`Sesgo ${meta.label.toLowerCase()}`}>
          <meta.Icon className="h-3 w-3" />{meta.label}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]"><Highlight text={n.title} keywords={n.keywords} /></span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <Globe className="h-3 w-3" />{n.source ?? "Fuente"}{n.pubDate ? ` · ${relTime(n.pubDate)}` : ""}
            <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold ${n.peru ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
              {n.peru ? <><MapPin className="h-2.5 w-2.5" />Perú</> : <><Globe className="h-2.5 w-2.5" />Mundo</>}
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
}

function PillGroup<T extends string>({ label, options, value, onChange }: { label: string; options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</span>
      <div className="inline-flex rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
        {options.map((o) => (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${value === o.v ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{o.label}</button>
        ))}
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
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]">{label}<ArrowUpRight className="h-3 w-3" /></a>;
}
