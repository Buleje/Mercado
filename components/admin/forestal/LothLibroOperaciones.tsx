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
  ShieldCheck,
  Ban,
  Printer,
  FileSpreadsheet,
  QrCode,
  Map as MapIcon,
  MapPin,
  Layers,
  Share2,
  Truck,
  TrendingUp,
  Lock,
  Coins,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import LibroChrome, { type LibroAction, type LibroGroup } from "@/components/admin/shared/libro-chrome";
import { IconAction } from "./ctp-shared";
import { csrfHeaders } from "@/lib/csrf-client";
import { downloadLothExcel, printLothLibro } from "@/lib/forestal/loth-print";
import { printLothInforme } from "@/lib/forestal/loth-informe-print";
import { printTrozaLabels } from "@/lib/forestal/loth-labels";
import {
  LOTH_SECTIONS,
  PLAZO_REGISTRO_DIAS,
  diasDeRegistro,
  estaFueraDePlazo,
  type LothSection,
  type LothEntryDTO,
} from "@/lib/forestal/loth-constants";
import LothEntryForm, { SECTION_META } from "./LothEntryForm";
import LothCaratulaForm from "./LothCaratulaForm";
import LothTraceView from "./LothTraceView";
import LothCensoRendimientoPanel from "./LothCensoRendimientoPanel";
import LothPlanView from "./LothPlanView";
import LothGtfView from "./LothGtfView";
import LothAnalyticsView from "./LothAnalyticsView";
import LothCompliancePanel from "./LothCompliancePanel";
import LothResumenStrip from "./LothResumenStrip";
import LothCadenaModal from "./LothCadenaModal";
import LothCierrePanel from "./LothCierrePanel";
import LothMapaView from "./LothMapaView";
import LothRentabilidadPanel from "./LothRentabilidadPanel";
import type { LothNavTarget } from "@/lib/forestal/loth-compliance";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { LOTH_VISTAS } from "@/lib/admin/subvistas-modulos";

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

/** createdAt no está tipado en el DTO (lo agrega Prisma en runtime) — accesor con cast. */
const createdAtOf = (e: LothEntry) => (e as { createdAt?: string }).createdAt;

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

type LothView = "secciones" | "trazabilidad" | "plan" | "gtf" | "analitica" | "cumplimiento" | "cierre" | "mapa" | "rentabilidad";

// Navegación en cabina compartida con el Libro CTP (`libro-chrome`): las nueve
// vistas agrupadas por fase, con los MISMOS nombres de grupo que el otro libro
// — quien sabe moverse en uno se mueve en el otro sin volver a aprender.
const LOTH_MODULE_ID = "loth-libro";
/** label y hint salen de `lib/admin/subvistas-modulos` — la MISMA fuente que
 *  indexa el buscador global. Acá sólo se agrega lo visual (icono) y la tecla. */
const LOTH_VISTAS_POR_KEY = Object.fromEntries(LOTH_VISTAS.map((v) => [v.key, { label: v.label, hint: v.hint }]));

const LOTH_GROUPS: LibroGroup[] = [
  {
    id: "operacion",
    label: "Operación",
    views: [
      { key: "secciones", ...LOTH_VISTAS_POR_KEY["secciones"], icon: Layers },
      { key: "gtf", ...LOTH_VISTAS_POR_KEY["gtf"], icon: Truck },
    ],
  },
  {
    id: "trazabilidad",
    label: "Trazabilidad",
    views: [
      { key: "plan", ...LOTH_VISTAS_POR_KEY["plan"], icon: MapIcon },
      { key: "mapa", ...LOTH_VISTAS_POR_KEY["mapa"], icon: MapPin },
      { key: "trazabilidad", ...LOTH_VISTAS_POR_KEY["trazabilidad"], icon: Share2 },
    ],
  },
  {
    id: "control",
    label: "Control",
    views: [
      { key: "cumplimiento", ...LOTH_VISTAS_POR_KEY["cumplimiento"], icon: ShieldCheck },
      { key: "cierre", ...LOTH_VISTAS_POR_KEY["cierre"], icon: Lock },
    ],
  },
  {
    id: "gestion",
    label: "Gestión",
    views: [
      { key: "rentabilidad", ...LOTH_VISTAS_POR_KEY["rentabilidad"], icon: Coins },
      { key: "analitica", ...LOTH_VISTAS_POR_KEY["analitica"], icon: TrendingUp },
    ],
  },
];

const LOTH_VIEW_KEYS = LOTH_GROUPS.flatMap((g) => g.views.map((v) => v.key));
/** Las mismas claves, tipadas: es lo que valida la vista que pide la URL. */
const LOTH_VIEW_KEYS_TIPADAS = LOTH_VIEW_KEYS as LothView[];

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
  const [cadenaCode, setCadenaCode] = useState<string | null>(null);
  // Señal reactiva: se incrementa tras cada escritura (registro/anulación/carátula)
  // para que los paneles con fetch propio (Resumen, Cumplimiento, Rentabilidad)
  // se refresquen solos, sin depender de que el usuario apriete "Recargar".
  const [reloadSignal, setReloadSignal] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  // Misma cabina que el CTP: la vista vive en la URL con memoria de respaldo.
  const { vista: view, irA } = useVistaModulo<LothView>(LOTH_MODULE_ID, LOTH_VIEW_KEYS_TIPADAS, "secciones");
  const setView = irA;
  const [allEntries, setAllEntries] = useState<LothEntry[]>([]);
  /** Censo del plan activo — alimenta el cuadro "censo vs realidad". */
  const [censoArboles, setCensoArboles] = useState<
    { treeCode: string; speciesCommon: string; dapM: number | null; volumenEstimadoM3: number | null; estado: string }[]
  >([]);
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

  const [informing, setInforming] = useState(false);
  async function doInforme() {
    setInforming(true);
    setError(null);
    try {
      await printLothInforme();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInforming(false);
    }
  }

  /** Lo que se presenta ante la autoridad, plegado: se usa al cerrar el mes,
   *  no en cada línea que se registra. */
  const acciones: LibroAction[] = useMemo(
    () => [
      {
        id: "pdf",
        label: "PDF formato SERFOR",
        hint: "Carátula + las 6 secciones, para imprimir y firmar",
        icon: Printer,
        tone: "dark",
        busy: exporting === "pdf",
        disabled: exporting !== null,
        onSelect: () => void doExport("pdf"),
      },
      {
        id: "informe",
        label: "Informe ARFFS / OSINFOR",
        hint: "Informe del período para presentar",
        icon: FileText,
        busy: informing,
        disabled: informing,
        onSelect: () => void doInforme(),
      },
      {
        id: "excel",
        label: "Excel (.xlsx) editable",
        hint: "1 hoja por sección + resumen",
        icon: FileSpreadsheet,
        busy: exporting === "excel",
        disabled: exporting !== null,
        onSelect: () => void doExport("excel"),
      },
      {
        id: "caratula",
        label: caratula ? "Editar carátula" : "Configurar carátula",
        hint: "Titular, título habilitante, registro y tomo",
        icon: FileText,
        onSelect: () => setShowCaratula(true),
      },
    ],
    // doExport/doInforme se redefinen por render; lo que cambia el menú es el
    // trabajo en curso y si ya hay carátula.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exporting, informing, caratula],
  );

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

      // El censo del plan activo: sin él, la trazabilidad arranca en la tala y
      // el volumen ESTIMADO (el que sustenta la autorización) no se compara.
      const planRes = await fetch("/api/admin/forestal/plan?active=1", { credentials: "include" });
      const planId = planRes.ok ? ((await planRes.json()).active?.id ?? null) : null;
      if (planId) {
        const cRes = await fetch(`/api/admin/forestal/plan/census?planId=${encodeURIComponent(planId)}`, { credentials: "include" });
        if (cRes.ok) {
          const trees = (await cRes.json()).trees ?? [];
          setCensoArboles(
            trees.map((t: { treeCode: string; speciesCommon: string; dapM: string | null; volumenEstimadoM3: string | null; estado: string }) => ({
              treeCode: t.treeCode,
              speciesCommon: t.speciesCommon,
              dapM: t.dapM != null ? Number(t.dapM) : null,
              volumenEstimadoM3: t.volumenEstimadoM3 != null ? Number(t.volumenEstimadoM3) : null,
              estado: t.estado,
            })),
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Recargar manual + tras escrituras: lista + meta (+ trazabilidad).
  const refreshAll = useCallback(async () => {
    setReloadSignal((s) => s + 1); // gatilla el refetch de los paneles con fetch propio
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
  // Qué métrica tiene sentido en el KPI de cada sección (evita el "0.00" de ruido).
  const usaVolumen = section === "tala" || section === "trozado" || section === "consumo_troza";
  const usaCantidad = section === "producto_terminado" || section === "despacho_producto";

  return (
    <LibroChrome
      moduleId={LOTH_MODULE_ID}
      eyebrow="Forestal · LO-TH SERFOR"
      title="Libro de Operaciones · Títulos Habilitantes"
      icon={TreePine}
      groups={LOTH_GROUPS}
      view={view}
      onView={irA}
      status={
        // La carátula ES la identidad del libro: sin ella, ningún export es
        // presentable. Por eso el chip vive en la cabina y no en un banner.
        <button
          type="button"
          onClick={() => setShowCaratula(true)}
          title={caratula ? "Carátula del libro — titular, título habilitante, registro y tomo" : "El libro necesita carátula para poder presentarse"}
          className={`inline-flex h-10 max-w-[18rem] items-center gap-2 rounded-xl border-2 px-3 text-sm transition-colors ${
            caratula
              ? "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
              : "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
          }`}
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          {caratula ? (
            <>
              <span className="truncate font-bold">{caratula.titularName}</span>
              {caratula.tituloHabilitante && (
                <span className="hidden shrink-0 font-mono text-xs text-[var(--text-tertiary)] lg:inline">
                  {caratula.tituloHabilitante}
                </span>
              )}
            </>
          ) : (
            <span>Configurar carátula</span>
          )}
        </button>
      }
      tools={
        <>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            aria-label="Recargar"
            title="Recargar el libro"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Nueva línea
          </button>
        </>
      }
      actions={acciones}
    >

      {/* Vista Plan de Manejo — base maestra (censo + especies autorizadas) */}
      {view === "plan" && <LothPlanView reloadSignal={reloadSignal} />}

      {/* Vista GTF — guías de transporte forestal */}
      {view === "gtf" && <LothGtfView />}

      {/* Vista Analítica — inteligencia de aprovechamiento + anomalías (Batch 2) */}
      {view === "analitica" && <LothAnalyticsView reloadSignal={reloadSignal} />}

      {/* Vista Cumplimiento — veredicto de fiscalización OSINFOR + reporte (ADR-305) */}
      {view === "cumplimiento" && (
        <LothCompliancePanel
          totalLineas={totalLines}
          reloadSignal={reloadSignal}
          onNavigate={(t: LothNavTarget) => {
            if (t === "caratula") setShowCaratula(true);
            else setView(t);
          }}
        />
      )}

      {/* Vista Cierre — cerrar el mes → acta inmutable (invariante P1) */}
      {view === "cierre" && <LothCierrePanel />}

      {/* Vista Mapa — dónde se taló cada árbol (GPS de campo, EUDR) */}
      {view === "mapa" && <LothMapaView />}

      {/* Vista Rentabilidad — margen por especie (dashboard de negocio) */}
      {view === "rentabilidad" && <LothRentabilidadPanel reloadSignal={reloadSignal} />}

      {/* Vista de trazabilidad — operación completa por árbol */}
      {view === "trazabilidad" && (
        <>
          {error && (
            <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
              <strong>Error:</strong> {error}
            </div>
          )}
          {loading ? (
            <div className="p-8 text-center text-[var(--text-tertiary)]">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
              <p className="mt-2 text-sm">Cargando trazabilidad...</p>
            </div>
          ) : (
            <>
              {/* La CADENA por árbol primero —es lo que se lee de un vistazo— y
                  el detalle censo-vs-realidad después, como respaldo. Antes iba
                  al revés y la pantalla abría con una tabla de comparación
                  antes de decir de qué árboles habla. El panel de censo va
                  `sinKpis`: sus cuatro cifras globales las publica el resumen
                  de arriba, y una de ellas era literalmente la misma. */}
              <div className="space-y-4">
                <LothTraceView entries={allEntries} caratula={caratula} />
                <LothCensoRendimientoPanel censo={censoArboles} entries={allEntries} sinKpis />
              </div>
            </>
          )}
        </>
      )}

      {view === "secciones" && (
        <>
      {/* Resumen "de un vistazo" del aprovechamiento (bosque → producto) */}
      <LothResumenStrip onNavigate={(v) => setView(v)} reloadSignal={reloadSignal} />

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
                  ? "border-[var(--data-success-600)] bg-[var(--data-success-50)] text-[var(--data-success-700)]"
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

      {/* KPIs — adaptados a la sección (evita mostrar métricas que no aplican:
          volumen en tala/trozado/consumo · cantidad en producto/despacho PT). */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard density="compact" label={`Líneas · ${SECTION_META[section].short}`} value={(cur?.count ?? 0).toString()} subValue={`${totalLines} en el libro`} icon={Boxes} emphasis="neutral" />
        {usaVolumen ? (
          <StatCard density="compact" label="Volumen registrado" value={`${(cur?.totalVolumeM3 ?? 0).toFixed(2)} m³`} subValue={SECTION_META[section].short} icon={TreePine} emphasis="success" />
        ) : usaCantidad ? (
          <StatCard density="compact" label="Cantidad registrada" value={(cur?.totalQuantity ?? 0).toFixed(2)} subValue={SECTION_META[section].short} icon={FileText} emphasis="success" />
        ) : (
          <StatCard density="compact" label="Trozas despachadas" value={(cur?.count ?? 0).toString()} subValue="con N° de GTF" icon={Truck} emphasis="success" />
        )}
        <StatCard density="compact" label="Especies CITES" value={citesCount.toString()} subValue="en esta sección" icon={ShieldAlert} emphasis={citesCount > 0 ? "error" : "neutral"} />
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
        <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-[var(--data-error-700)]">
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
                      {!annulled && estaFueraDePlazo(e.entryDate, createdAtOf(e)) && (
                        <span
                          title={`Registrado ${diasDeRegistro(e.entryDate, createdAtOf(e))} días después de la actividad — SERFOR exige registro dentro de ${PLAZO_REGISTRO_DIAS} días`}
                          className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-700)]"
                        >
                          fuera de plazo · {diasDeRegistro(e.entryDate, createdAtOf(e))}d
                        </span>
                      )}
                      {e.observations && <span className="text-xs text-[var(--text-tertiary)]">{e.observations}</span>}
                      {annulled && e.annulledReason && <span className="text-xs text-[var(--data-error-700)]">· {e.annulledReason}</span>}
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
                          className="h-9 w-44 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-error-500)]"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button type="button" disabled={annulReason.trim().length < 3 || pending === e.id} onClick={() => doAnnul(e.id)} className="inline-flex h-9 items-center rounded-xl bg-[var(--data-error-600)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
                            Confirmar
                          </button>
                          <button type="button" onClick={() => { setAnnulId(null); setAnnulReason(""); }} className="inline-flex h-9 items-center rounded-xl border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)]">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Íconos, no palabras: la columna de acciones no debe
                      // pesar más que las seis de datos (mismo criterio que el
                      // Libro CTP — `IconAction`).
                      <div className="inline-flex items-center justify-end gap-1">
                        {(e.trozaCode || e.treeCode) && (
                          <IconAction
                            icon={Share2}
                            label="Ver la cadena de custodia de este árbol/troza"
                            onClick={() => setCadenaCode(e.trozaCode || e.treeCode)}
                          />
                        )}
                        <IconAction
                          icon={Ban}
                          tone="danger"
                          label="Anular (subsanación SERFOR — queda visible)"
                          onClick={() => { setAnnulId(e.id); setAnnulReason(""); }}
                        />
                      </div>
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
      {cadenaCode && <LothCadenaModal code={cadenaCode} onClose={() => setCadenaCode(null)} />}
    </LibroChrome>
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
        {e.cites && <span className="rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
      </div>
      {e.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{e.speciesScientific}</div>}
    </div>
  );
}
function Tag({ children, tone }: { children: React.ReactNode; tone?: "danger" }) {
  const cls = tone === "danger"
    ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]"
    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
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
