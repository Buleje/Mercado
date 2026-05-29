"use client";

/**
 * LothLibroOperaciones — Módulo admin del Libro de Operaciones de los Títulos
 * Habilitantes (LO-TH, ADR-125). 6 secciones SERFOR como sub-tabs.
 *
 * Solo se renderiza si el tenant tiene `spec:forestal:loth-libro` habilitado
 * (gating sidebar via useEnabledSpecs + endpoints via 403).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  TreePine,
  AlertCircle,
  RefreshCw,
  Boxes,
  FileText,
  ShieldAlert,
  Ban,
  Download,
  Printer,
  FileSpreadsheet,
  ChevronDown,
  QrCode,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { downloadLothExcel, printLothLibro } from "@/lib/forestal/loth-print";
import { printTrozaLabels } from "@/lib/forestal/loth-labels";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { LOTH_SECTIONS, type LothSection, type LothEntryDTO } from "@/lib/forestal/loth-constants";
import LothEntryForm, { SECTION_META } from "./LothEntryForm";
import LothCaratulaForm from "./LothCaratulaForm";
import LothTraceView from "./LothTraceView";
import LothPlanView from "./LothPlanView";
import LothGtfView from "./LothGtfView";
import LothAnalyticsView from "./LothAnalyticsView";

type LothEntry = LothEntryDTO;

interface Caratula {
  id: string;
  registroNumber: string | null;
  tomo: string | null;
  titularName: string;
  tituloHabilitante: string | null;
}

interface SectionStat {
  section: LothSection;
  count: number;
  totalVolumeM3: number;
  totalQuantity: number;
}

type Col = { key: string; label: string; align?: "right"; render: (e: LothEntry) => React.ReactNode };

const num = (v: string | null, dp = 4) => (v == null ? "—" : Number(v).toFixed(dp));

/** Días entre actividad (entryDate) y registro (createdAt). >15 = fuera de plazo SERFOR. */
function lateDaysOf(e: LothEntry): number {
  const act = e.entryDate ? new Date(e.entryDate).getTime() : 0;
  const reg = (e as { createdAt?: string }).createdAt ? new Date((e as { createdAt?: string }).createdAt as string).getTime() : 0;
  if (!act || !reg) return 0;
  return Math.max(0, Math.floor((reg - act) / 86_400_000));
}
const PLAZO_DIAS = 15;

const COLS: Record<LothSection, Col[]> = {
  tala: [
    { key: "tree", label: "Cód. árbol", render: (e) => <Code v={e.treeCode} rama={e.isRama} /> },
    { key: "esp", label: "Especie", render: (e) => <Species e={e} /> },
    { key: "dM", label: "Ø may", align: "right", render: (e) => <Mono v={num(e.diamMayorM, 2)} /> },
    { key: "dm", label: "Ø men", align: "right", render: (e) => <Mono v={num(e.diamMenorM, 2)} /> },
    { key: "L", label: "Long.", align: "right", render: (e) => <Mono v={num(e.lengthM, 2)} /> },
    { key: "vol", label: "Vol. m³", align: "right", render: (e) => <Mono v={num(e.volumeM3)} bold /> },
  ],
  trozado: [
    { key: "troza", label: "Cód. troza", render: (e) => <Code v={e.trozaCode} rama={e.isRama} /> },
    { key: "esp", label: "Especie", render: (e) => <Species e={e} /> },
    { key: "dM", label: "Ø may", align: "right", render: (e) => <Mono v={num(e.diamMayorM, 2)} /> },
    { key: "dm", label: "Ø men", align: "right", render: (e) => <Mono v={num(e.diamMenorM, 2)} /> },
    { key: "L", label: "Long.", align: "right", render: (e) => <Mono v={num(e.lengthM, 2)} /> },
    { key: "vol", label: "Vol. m³", align: "right", render: (e) => <Mono v={num(e.volumeM3)} bold /> },
  ],
  despacho_troza: [
    { key: "troza", label: "Cód. troza", render: (e) => <Code v={e.trozaCode} /> },
    { key: "desp", label: "Cód. despacho", render: (e) => <span className="text-[var(--text-secondary)]">{e.despachoCode ?? "—"}</span> },
    { key: "gtf", label: "N° GTF", render: (e) => <Mono v={e.gtfNumber ?? "—"} bold /> },
  ],
  consumo_troza: [
    { key: "troza", label: "Cód. troza", render: (e) => <Code v={e.trozaCode} /> },
    { key: "esp", label: "Especie", render: (e) => <Species e={e} /> },
    { key: "vol", label: "Vol. m³", align: "right", render: (e) => <Mono v={num(e.volumeM3)} bold /> },
    { key: "ci", label: "", render: (e) => (e.consumoInterno ? <Tag>consumo interno</Tag> : null) },
  ],
  producto_terminado: [
    { key: "prod", label: "Producto", render: (e) => <span className="font-medium text-[var(--text-primary)]">{e.productType ?? "—"}</span> },
    { key: "esp", label: "Especie", render: (e) => <Species e={e} /> },
    { key: "qty", label: "Cantidad", align: "right", render: (e) => <Mono v={num(e.quantity)} bold /> },
    { key: "unit", label: "Unidad", render: (e) => <span className="text-[var(--text-secondary)]">{unitLabel(e.unit)}</span> },
  ],
  despacho_producto: [
    { key: "gtf", label: "N° GTF", render: (e) => <Mono v={e.gtfNumber ?? "—"} bold /> },
    { key: "prod", label: "Producto", render: (e) => <span className="font-medium text-[var(--text-primary)]">{e.productType ?? "—"}</span> },
    { key: "esp", label: "Especie", render: (e) => <Species e={e} /> },
    { key: "pcs", label: "Piezas", align: "right", render: (e) => <Mono v={e.pieces?.toString() ?? "—"} /> },
    { key: "qty", label: "Cantidad", align: "right", render: (e) => <Mono v={num(e.quantity)} bold /> },
    { key: "unit", label: "Unidad", render: (e) => <span className="text-[var(--text-secondary)]">{unitLabel(e.unit)}</span> },
  ],
};

export default function LothLibroOperaciones() {
  const [section, setSection] = useState<LothSection>("tala");
  const [entries, setEntries] = useState<LothEntry[]>([]);
  const [stats, setStats] = useState<SectionStat[]>([]);
  const [caratula, setCaratula] = useState<Caratula | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showCaratula, setShowCaratula] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [view, setView] = useState<"secciones" | "trazabilidad" | "plan" | "gtf" | "analitica">("secciones");
  const [allEntries, setAllEntries] = useState<LothEntry[]>([]);
  const [exportMenu, setExportMenu] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [printingLabels, setPrintingLabels] = useState(false);

  async function doPrintLabels() {
    setPrintingLabels(true);
    setError(null);
    try {
      const count = await printTrozaLabels(entries, {
        origin: window.location.origin,
        titular: caratula?.titularName ?? null,
        planNumber: caratula?.tituloHabilitante ?? null,
      });
      if (count === 0) setError("No hay códigos imprimibles en esta sección (usá Trozado o Tala).");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrintingLabels(false);
    }
  }

  async function doExport(kind: "pdf" | "excel") {
    setExportMenu(false);
    setExporting(kind);
    setError(null);
    try {
      if (kind === "excel") await downloadLothExcel();
      else await printLothLibro();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(null);
    }
  }

  // Solo la lista de la sección activa — corre en cada cambio de sección/búsqueda.
  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ section, limit: "200", includeAnnulled: "1" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/forestal/loth?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
      }
      setEntries((await res.json()).entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [section, search]);

  // Stats + carátula NO dependen de la sección → solo al montar y tras escrituras.
  const loadMeta = useCallback(async () => {
    try {
      const [statsRes, caratulaRes] = await Promise.all([
        fetch(`/api/admin/forestal/loth?stats=1`, { credentials: "include" }),
        fetch(`/api/admin/forestal/loth/caratula`, { credentials: "include" }),
      ]);
      if (statsRes.ok) setStats((await statsRes.json()).stats ?? []);
      if (caratulaRes.ok) setCaratula((await caratulaRes.json()).active ?? null);
    } catch {
      /* meta es best-effort; no rompe la vista */
    }
  }, []);

  // Todas las secciones juntas — para la vista de trazabilidad.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/forestal/loth?limit=500&includeAnnulled=1`, { credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
      }
      setAllEntries((await res.json()).entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Recargar manual + tras escrituras: lista + meta (+ trazabilidad).
  const refreshAll = useCallback(async () => {
    await Promise.all([loadEntries(), loadMeta(), loadAll()]);
  }, [loadEntries, loadMeta, loadAll]);

  // Cambio de sección/búsqueda → solo la lista (1 request).
  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // Montaje → meta una sola vez.
  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al entrar a trazabilidad → cargar todas las secciones.
  useEffect(() => {
    if (view === "trazabilidad") loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function doAnnul(id: string) {
    setPending(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/forestal/loth/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "annul", reason: annulReason.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
      }
      setAnnulId(null);
      setAnnulReason("");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  const statBy = useMemo(() => {
    const map = new Map(stats.map((s) => [s.section, s]));
    return map;
  }, [stats]);

  const cur = statBy.get(section);
  const totalLines = stats.reduce((a, s) => a + s.count, 0);
  const citesCount = entries.filter((e) => e.cites && e.status === "registrado").length;
  const cols = COLS[section];

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Forestal · Especialización"
        title="Libro de Operaciones · Títulos Habilitantes"
        description="Trazabilidad del aprovechamiento en el bosque: tala → trozado → despacho → consumo → producto → despacho. 6 secciones SERFOR (RDE 264-2019). Interno, no oficial."
        icon={TreePine}
      >
        <button
          type="button"
          onClick={() => setShowCaratula(true)}
          className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
        >
          <FileText className="h-4 w-4" />
          <span>{caratula ? "Carátula" : "Configurar carátula"}</span>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setExportMenu((v) => !v)}
            disabled={exporting !== null}
            className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            {exporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span>{exporting === "excel" ? "Generando…" : exporting === "pdf" ? "Abriendo…" : "Exportar"}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
          {exportMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExportMenu(false)} />
              <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl">
                <button
                  type="button"
                  onClick={() => doExport("pdf")}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--surface-canvas)]"
                >
                  <Printer className="h-4 w-4 text-[var(--data-danger-600)]" />
                  <span><b className="block text-[var(--text-primary)]">PDF formato SERFOR</b><span className="text-xs text-[var(--text-tertiary)]">Carátula + 6 secciones, para imprimir/firmar</span></span>
                </button>
                <button
                  type="button"
                  onClick={() => doExport("excel")}
                  className="flex w-full items-center gap-3 border-t border-[var(--rule-soft)] px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--surface-canvas)]"
                >
                  <FileSpreadsheet className="h-4 w-4 text-[var(--data-success-600)]" />
                  <span><b className="block text-[var(--text-primary)]">Excel (.xlsx) editable</b><span className="text-xs text-[var(--text-tertiary)]">1 hoja por sección + resumen</span></span>
                </button>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={loading}
          className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          aria-label="Recargar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span>Recargar</span>
        </button>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"
        >
          <Plus className="h-5 w-5" />
          Nueva línea
        </button>
      </AdminModuleHeader>

      {/* Carátula activa */}
      {caratula && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-3 text-sm">
          <span className="font-bold text-[var(--text-primary)]">{caratula.titularName}</span>
          {caratula.tituloHabilitante && <Meta k="Título" v={caratula.tituloHabilitante} />}
          {caratula.registroNumber && <Meta k="Registro" v={caratula.registroNumber} />}
          {caratula.tomo && <Meta k="Tomo" v={caratula.tomo} />}
        </div>
      )}

      {/* Toggle Secciones / Trazabilidad */}
      <div className="flex">
        <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
          {([["plan", "Plan de Manejo"], ["secciones", "Secciones"], ["trazabilidad", "Trazabilidad"], ["gtf", "GTF"], ["analitica", "Analítica"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
                view === v
                  ? "bg-[var(--brand-ink)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Vista Plan de Manejo — base maestra (censo + especies autorizadas) */}
      {view === "plan" && <LothPlanView />}

      {/* Vista GTF — guías de transporte forestal */}
      {view === "gtf" && <LothGtfView />}

      {/* Vista Analítica — inteligencia de aprovechamiento + anomalías (Batch 2) */}
      {view === "analitica" && <LothAnalyticsView />}

      {/* Vista de trazabilidad — operación completa por árbol */}
      {view === "trazabilidad" && (
        <>
          {error && (
            <div className="rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-4 text-sm text-[var(--data-danger-900)]">
              <strong>Error:</strong> {error}
            </div>
          )}
          {loading ? (
            <div className="p-8 text-center text-[var(--text-tertiary)]">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
              <p className="mt-2 text-sm">Cargando trazabilidad...</p>
            </div>
          ) : (
            <LothTraceView entries={allEntries} />
          )}
        </>
      )}

      {view === "secciones" && (
        <>
      {/* Sub-tabs de las 6 secciones */}
      <div className="flex flex-wrap gap-2">
        {LOTH_SECTIONS.map((s) => {
          const m = SECTION_META[s];
          const active = s === section;
          const st = statBy.get(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`inline-flex items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-sm font-bold transition ${
                active
                  ? "border-[var(--data-success-600)] bg-[var(--data-success-50)] text-[var(--data-success-900)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-md bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] tabular-nums">
                {m.index}
              </span>
              {m.short}
              {st && st.count > 0 && (
                <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">
                  {st.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Líneas · ${SECTION_META[section].short}`} value={(cur?.count ?? 0).toString()} subValue={`${totalLines} en el libro`} icon={Boxes} emphasis="neutral" />
        <StatCard label="Volumen registrado" value={`${(cur?.totalVolumeM3 ?? 0).toFixed(2)} m³`} subValue={SECTION_META[section].short} icon={TreePine} emphasis="success" />
        <StatCard label="Cantidad (prod.)" value={(cur?.totalQuantity ?? 0).toFixed(2)} subValue="prod. terminado" icon={FileText} emphasis="neutral" />
        <StatCard label="Especies CITES" value={citesCount.toString()} subValue="en esta sección" icon={ShieldAlert} emphasis={citesCount > 0 ? "error" : "neutral"} />
      </div>

      {/* Búsqueda + etiquetas */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadEntries()}
            placeholder="Buscar por código, especie o GTF..."
            className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={doPrintLabels}
          disabled={printingLabels || entries.length === 0}
          title="Imprimir etiquetas con QR de origen para las trozas de esta sección"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
        >
          {printingLabels ? <RefreshCw className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          <span>Etiquetas QR</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-4 text-[var(--data-danger-900)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm"><strong>Error:</strong> {error}</div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th className="text-right">N°</Th>
              <Th>Fecha</Th>
              {cols.map((c) => (
                <Th key={c.key} className={c.align === "right" ? "text-right" : undefined}>{c.label}</Th>
              ))}
              <Th>Observaciones</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const annulled = e.status === "anulado";
              return (
                <tr key={e.id} className={`border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]/40 ${annulled ? "opacity-50" : ""}`}>
                  <Td className="text-right"><span className="font-mono tabular-nums text-[var(--text-tertiary)]">{e.lineNo}</span></Td>
                  <Td><span className="text-[var(--text-secondary)]">{formatDate(e.entryDate)}</span></Td>
                  {cols.map((c) => (
                    <Td key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                      {annulled && c.key === cols[0].key ? <span className="line-through">{c.render(e)}</span> : c.render(e)}
                    </Td>
                  ))}
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {e.discarded && <Tag tone="danger">descartado</Tag>}
                      {annulled && <Tag tone="danger">ANULADO</Tag>}
                      {!annulled && lateDaysOf(e) > PLAZO_DIAS && (
                        <span
                          title={`Registrado ${lateDaysOf(e)} días después de la actividad — SERFOR exige registro dentro de ${PLAZO_DIAS} días`}
                          className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-900)]"
                        >
                          fuera de plazo · {lateDaysOf(e)}d
                        </span>
                      )}
                      {e.observations && <span className="text-xs text-[var(--text-tertiary)]">{e.observations}</span>}
                      {annulled && e.annulledReason && <span className="text-xs text-[var(--data-danger-700)]">· {e.annulledReason}</span>}
                    </div>
                  </Td>
                  <Td className="text-right">
                    {annulled ? (
                      <span className="text-xs text-[var(--text-tertiary)]">—</span>
                    ) : annulId === e.id ? (
                      <div className="inline-flex flex-col items-end gap-2">
                        <input
                          type="text"
                          value={annulReason}
                          onChange={(ev) => setAnnulReason(ev.target.value)}
                          placeholder="Motivo (min 3)"
                          className="h-9 w-44 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-danger-500)]"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button type="button" disabled={annulReason.trim().length < 3 || pending === e.id} onClick={() => doAnnul(e.id)} className="inline-flex h-9 items-center rounded-xl bg-[var(--data-danger-600)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
                            Confirmar
                          </button>
                          <button type="button" onClick={() => { setAnnulId(null); setAnnulReason(""); }} className="inline-flex h-9 items-center rounded-xl border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)]">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setAnnulId(e.id); setAnnulReason(""); }} title="Anular (subsanación SERFOR — queda visible)" className="inline-flex h-9 items-center gap-1 rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] px-3 text-xs font-bold text-[var(--data-danger-900)] hover:bg-[var(--data-danger-100)]">
                        <Ban className="h-3 w-3" />
                        Anular
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && entries.length === 0 && (
          <div className="p-12 text-center text-[var(--text-tertiary)]">
            <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-base font-medium">Sin registros en {SECTION_META[section].label.toLowerCase()}.</p>
            <p className="mt-1 text-sm">Hacé click en &quot;Nueva línea&quot; para registrar el primer movimiento.</p>
          </div>
        )}
        {loading && (
          <div className="p-8 text-center text-[var(--text-tertiary)]">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
            <p className="mt-2 text-sm">Cargando registros...</p>
          </div>
        )}
      </div>
        </>
      )}

      {showForm && (
        <LothEntryForm
          section={section}
          caratulaId={caratula?.id ?? null}
          onClose={() => setShowForm(false)}
          onSaved={(opts) => {
            if (!opts?.keepOpen) setShowForm(false);
            refreshAll();
          }}
        />
      )}
      {showCaratula && (
        <LothCaratulaForm
          current={caratula}
          onClose={() => setShowCaratula(false)}
          onSaved={() => { setShowCaratula(false); refreshAll(); }}
        />
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
function Mono({ v, bold }: { v: string; bold?: boolean }) {
  return <span className={`font-mono tabular-nums text-[var(--text-primary)] ${bold ? "font-bold" : ""}`}>{v}</span>;
}
function Code({ v, rama }: { v: string | null; rama?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono font-bold text-[var(--text-primary)]">{v ?? "—"}</span>
      {rama && <span className="rounded bg-[var(--surface-sunken)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">R</span>}
    </span>
  );
}
function Species({ e }: { e: LothEntry }) {
  if (!e.speciesCommon) return <span className="text-[var(--text-tertiary)]">—</span>;
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-[var(--text-primary)]">{e.speciesCommon}</span>
        {e.cites && <span className="rounded bg-[var(--data-danger-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-danger-900)]">CITES</span>}
      </div>
      {e.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{e.speciesScientific}</div>}
    </div>
  );
}
function Tag({ children, tone }: { children: React.ReactNode; tone?: "danger" }) {
  const cls = tone === "danger"
    ? "bg-[var(--data-danger-100)] text-[var(--data-danger-900)]"
    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}
function Meta({ k, v }: { k: string; v: string }) {
  return (
    <span className="text-[var(--text-secondary)]">
      <span className="text-[var(--text-tertiary)]">{k}:</span> <span className="font-medium text-[var(--text-primary)]">{v}</span>
    </span>
  );
}
function unitLabel(u: string | null) {
  return u === "m3" ? "m³" : u === "kg" ? "Kg" : u === "unidad" ? "Unidad" : (u ?? "—");
}
function formatDate(iso: string) {
  try {
    // Fecha date-only: se guarda como UTC medianoche → mostrar en UTC para no
    // restar un día por el huso horario (-5 en Perú).
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
}
