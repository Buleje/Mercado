"use client";

/**
 * CtpEntriesView — tabla de Producción/Despacho del Libro CTP (ADR-127).
 * Producción y Despacho comparten esta misma tabla, adaptada por sección.
 * Saldos (balance de planta) vive en CtpSaldosView, componente hermano.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Plus, RefreshCw, Search, Boxes, Truck, AlertCircle, X as XIcon,
  Scale, PackageCheck, PackagePlus, Link2, Calculator, FileText, Download,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle,
  ClipboardList,
} from "@buleje/design-system/icons";
import { StatCard, CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useDebounce } from "@/hooks/use-debounce";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { evaluarRendimiento } from "@/lib/forestal/ctp-rendimiento";
import CtpEntryForm from "./CtpEntryForm";
import CtpProduccionImportModal from "./CtpProduccionImportModal";
import CtpDespachoDetalleModal from "./CtpDespachoDetalleModal";
import CtpProduccionDetalleModal from "./CtpProduccionDetalleModal";
import CtpSeccionCardMobile from "./CtpSeccionCardMobile";
import CtpSimuladorModal from "./CtpSimuladorModal";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import CtpFiltrosPanel, { BotonFiltros, usePanelFiltros } from "./ctp-filtros-panel";
import {
  contarFiltros,
  facetasDeSeccion,
  filtrarSeccion,
  totalesDeSeccion,
  type FiltrosSeccion,
} from "@/lib/forestal/ctp-secciones-filtro";
import { nombreArchivoSeccion, seccionACsv } from "@/lib/forestal/ctp-secciones-csv";
import { atribucionDeDespacho, faltaAtribuir } from "@/lib/forestal/atribucion-despacho";

// El anexo arrastra jsPDF/exceljs: entra solo cuando alguien lo pide.
const Anexo04Modal = dynamic(() => import("./Anexo04Modal"), { ssr: false });
import { type CtpEntry, type CtpSection, Th, Td, n2, estadoSalida, UNIT_LABELS } from "./ctp-section-shared";
import { Btn, IconAction, TablaSkeleton } from "./ctp-shared";

/** Una tarjeta que filtra se ve hundida: si no, nadie sabe por qué la tabla
 *  de abajo tiene menos filas. */
const ANILLO_ACTIVO = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]";

const SECTION_META: Record<CtpSection, { label: string; icon: typeof Boxes; cta: string; empty: string }> = {
  produccion: { label: "Producción", icon: Boxes, cta: "Nueva producción", empty: "Sin transformaciones registradas. Registrá la primera para convertir materia prima en producto." },
  despacho: { label: "Despacho", icon: Truck, cta: "Nuevo despacho", empty: "Sin despachos registrados. Registrá la salida de producto con su GTF." },
};

// timeZone UTC: entryDate es date-only guardada a medianoche UTC — en hora Lima se corría un día.
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };
const n4 = (v: string | null) => (v == null ? "—" : Number(v).toFixed(4));


/**
 * ¿Cuánto de este despacho salió SIN corrida de origen declarada?
 *
 * La atribución parcial está permitida a propósito (invariante I4: `≤`, nunca
 * `==` — exigir el 100% para poder guardar empuja a inventar un origen). Lo que
 * no puede pasar es que sea invisible: hasta ahora el faltante sólo se veía
 * abriendo la ficha de cadena de custodia, de a un despacho por vez, y es lo
 * primero que cruza un fiscalizador.
 *
 * Silencioso cuando está completo o cuando el despacho no declara cantidad.
 */
function AtribucionBadge({ entry }: { entry: CtpEntry }) {
  const estado = atribucionDeDespacho(
    entry.quantity == null ? null : Number(entry.quantity),
    entry.atribuidoQty,
    UNIT_LABELS[entry.unit ?? "m3"] ?? entry.unit ?? "",
  );
  if (!faltaAtribuir(estado)) return null;
  return (
    <div
      title="Este volumen salió de la planta sin corrida de producción atribuida. Abrí la cadena de custodia para completarlo: sin origen no se puede certificar."
      className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {estado.aviso}
    </div>
  );
}

/**
 * ¿El paquete sigue en el patio o ya se lo llevaron?
 *
 * Es el reporte "estado de productos" del ERP forestal de referencia, pero en la
 * misma fila en vez de en una pantalla aparte: la pregunta aparece mirando la
 * lista de producción, no yendo a buscarla.
 */
function SalidaBadge({ entry }: { entry: CtpEntry }) {
  const est = estadoSalida(entry);
  if (!est) return <span className="text-xs text-[var(--text-tertiary)]">—</span>;
  const tono =
    est.tono === "salido"
      ? "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]"
      : est.tono === "parcial"
        ? "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]"
        : "bg-[var(--surface-canvas)] text-[var(--text-secondary)]";
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${tono}`}>
      {est.label}
    </span>
  );
}

export function CtpEntriesView({
  section,
  period,
  presetProducto,
  presetEspecie,
  onPresetUsado,
}: {
  section: CtpSection;
  period: CtpPeriod;
  /** Producto que llega desde el stock de Saldos: abre el formulario ya cargado. */
  presetProducto?: string | null;
  presetEspecie?: string | null;
  onPresetUsado?: () => void;
}) {
  const meta = SECTION_META[section];
  const [entries, setEntries] = useState<CtpEntry[]>([]);
  /** Despacho para el que se está emitiendo el ANEXO N° 04 de la GTF. */
  const [anexoEntry, setAnexoEntry] = useState<CtpEntry | null>(null);
  /** Despachos que YA tienen anexo emitido (se marcan en la fila). */
  const [conAnexo, setConAnexo] = useState<Set<string>>(new Set());
  /** Bandeja de anexos emitidos abierta desde la barra (consulta, sin despacho). */
  const [verBandeja, setVerBandeja] = useState(false);
  /** Cuántos anexos hay en la bandeja (el badge del botón). */
  const [totalAnexos, setTotalAnexos] = useState(0);
  // Los avisos del anexo (descargó, no se pudo, cargué el ya emitido) necesitan
  // dónde salir: sin esto el modal hablaba solo cuando se abría desde el Libro.
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  // Sin debounce, `load` se re-creaba en cada tecla → un fetch por caracter.
  const search = useDebounce(searchInput, 350);
  const [showForm, setShowForm] = useState(false);
  /** Carga masiva del parte de turno (ADR-323), sólo en Producción. */
  const [importarParte, setImportarParte] = useState(false);
  /** Con qué producto abrir el formulario (viene de Saldos; se consume una vez). */
  const [productoDelStock, setProductoDelStock] = useState<{ producto: string; especie: string | null } | null>(null);

  // El producto que llega desde el stock abre el formulario una sola vez: se
  // avisa al padre para que lo limpie y volver a Saldos → Despacho no reabra
  // el modal con lo de la vez pasada.
  useEffect(() => {
    if (!presetProducto) return;
    setProductoDelStock({ producto: presetProducto, especie: presetEspecie ?? null });
    setShowForm(true);
    onPresetUsado?.();
  }, [presetProducto, presetEspecie, onPresetUsado]);
  const [showSim, setShowSim] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [pending, setPending] = useState(false);
  const [toProductId, setToProductId] = useState<string | null>(null);
  const [toProductMsg, setToProductMsg] = useState<string | null>(null);
  // Cadena de custodia (solo despacho): trazabilidad + COGS + certificado.
  const [chainEntry, setChainEntry] = useState<CtpEntry | null>(null);
  // Filtro por estado (chips, como Ingresos) + orden por columna, client-side
  // sobre el set completo del período (search es server-side, sin paginación).
  const [statusFilter, setStatusFilter] = useState<"" | "registrado" | "anulado">("");
  /** Sólo las guías que todavía no tienen su ANEXO N° 04 emitido. */
  const [soloSinAnexo, setSoloSinAnexo] = useState(false);
  const [sort, setSort] = useState<{ by: "fecha" | "cantidad" | "rend" | null; dir: "asc" | "desc" }>({ by: null, dir: "desc" });
  // Facetas (especie / producto / destino / CITES). Se calculan en el cliente:
  // esta vista trae TODO el período en una carga, así que la DB no tiene nada
  // que agregar — y las opciones no pueden mentir sobre lo que hay.
  const [facetas, setFacetas] = useState<FiltrosSeccion>({});
  const activos = contarFiltros(facetas);
  const { panelId, abierto, alternar } = usePanelFiltros(activos);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = applyCtpPeriodParams(new URLSearchParams({ section }), period);
      if (search.trim()) p.set("search", search.trim());
      const r = await fetch(`/api/admin/forestal/ctp?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setEntries((await r.json()).entries ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [section, search, period]);
  useEffect(() => { void load(); }, [load]);

  /**
   * Qué despachos ya tienen su ANEXO N° 04 emitido. Con esto la fila muestra el
   * papel como hecho — si no, el operario no tiene forma de saber cuál falta y
   * termina emitiendo dos veces el mismo.
   */
  const cargarAnexos = useCallback(() => {
    if (section !== "despacho") return;
    fetch("/api/admin/forestal/anexos", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { anexos: [] }))
      .then((j: { anexos?: { ctpEntryId?: string }[] }) => {
        const lista = j.anexos ?? [];
        setConAnexo(new Set(lista.map((a) => a.ctpEntryId).filter(Boolean) as string[]));
        setTotalAnexos(lista.length);
      })
      // Sin bandeja no se marca nada: es un indicador, no un bloqueo.
      .catch(() => { setConAnexo(new Set()); setTotalAnexos(0); });
  }, [section]);
  useEffect(cargarAnexos, [cargarAnexos]);

  async function annul() {
    if (!annulId || annulReason.trim().length < 3) return;
    setPending(true);
    try {
      const r = await fetch("/api/admin/forestal/ctp", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ id: annulId, action: "annul", reason: annulReason.trim() }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setAnnulId(null); setAnnulReason(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(false); }
  }

  async function sendToInventory(entryId: string) {
    setToProductId(entryId);
    setToProductMsg(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp/to-product", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ entryId }),
      });
      const json: { ok?: boolean; message?: string; error?: string } = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.message ?? `HTTP ${r.status}`);
      setToProductMsg(json.message ?? "Creado como borrador en inventario.");
    } catch (e) {
      setToProductMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setToProductId(null);
    }
  }

  const kpis = useMemo(() => {
    const reg = entries.filter((e) => e.status === "registrado");
    const totalQty = reg.reduce((a, e) => a + Number(e.quantity ?? 0), 0);
    const consumido = reg.reduce((a, e) => a + Number(e.volumeInputM3 ?? 0), 0);
    // Rendimiento PONDERADO por volumen consumido: la media simple hacía pesar
    // igual una línea de 0.5 m³ que una de 50 m³, y el promedio de planta no es eso.
    let pesoTotal = 0;
    let sumaPonderada = 0;
    for (const e of reg) {
      const rend = Number(e.rendimientoPct ?? 0);
      const vol = Number(e.volumeInputM3 ?? 0);
      if (rend > 0 && vol > 0) {
        sumaPonderada += rend * vol;
        pesoTotal += vol;
      }
    }
    const avgRend = pesoTotal > 0 ? sumaPonderada / pesoTotal : 0;
    return { count: reg.length, totalQty, consumido, avgRend };
  }, [entries]);

  const statusCounts = useMemo(() => ({
    total: entries.length,
    registrado: entries.filter((e) => e.status === "registrado").length,
    anulado: entries.filter((e) => e.status === "anulado").length,
  }), [entries]);

  // Filtro por estado + orden. La media/KPIs no cambian (siguen sobre todo el set);
  // esto solo cambia lo que se LISTA en la tabla/cards.
  /** Guías vivas que todavía no tienen anexo: lo que le falta emitir al regente. */
  const sinAnexo = useMemo(
    () => (section === "despacho" ? entries.filter((e) => e.status === "registrado" && !conAnexo.has(e.id)).length : 0),
    [entries, conAnexo, section],
  );

  /**
   * Atajos de la vista, los mismos que en Ingresos para no tener que aprender
   * dos teclados: `N` abre el alta, `/` va al buscador, `R` recarga. Se apagan
   * mientras se escribe, con modal abierto y con cualquier modificador (Ctrl+N
   * del navegador no se toca).
   */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (showForm || showSim || anexoEntry || chainEntry || verBandeja || annulId) return;

      if (ev.key === "n" || ev.key === "N") {
        ev.preventDefault();
        setShowForm(true);
      } else if (ev.key === "/") {
        ev.preventDefault();
        document.getElementById(`ctp-search-${section}`)?.focus();
      } else if (ev.key === "r" || ev.key === "R") {
        ev.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [section, load, showForm, showSim, anexoEntry, chainEntry, verBandeja, annulId]);

  /** Opciones de los selectores: salen de lo cargado, no de un catálogo. */
  const opciones = useMemo(() => facetasDeSeccion(entries), [entries]);

  const visible = useMemo(() => {
    const porFaceta = filtrarSeccion(entries, facetas);
    const porEstado = statusFilter ? porFaceta.filter((e) => e.status === statusFilter) : porFaceta;
    // "Sin anexo" sólo tiene sentido sobre líneas vivas: una anulada no se ampara.
    const list = soloSinAnexo
      ? porEstado.filter((e) => e.status === "registrado" && !conAnexo.has(e.id))
      : porEstado;
    if (!sort.by) return list;
    const val = (e: CtpEntry) =>
      sort.by === "fecha" ? new Date(e.entryDate).getTime()
      : sort.by === "cantidad" ? Number(e.quantity ?? 0)
      : Number(e.rendimientoPct ?? 0);
    return [...list].sort((a, b) => { const d = val(a) - val(b); return sort.dir === "asc" ? d : -d; });
  }, [entries, facetas, statusFilter, sort, soloSinAnexo, conAnexo]);

  /** Totales de lo que se está viendo (sin anuladas: en el libro no cuentan). */
  const totalesVista = useMemo(() => totalesDeSeccion(visible), [visible]);

  /** Descarga lo filtrado, con las columnas de la sección. */
  function descargarCsv() {
    const csv = seccionACsv(section, visible);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoSeccion(section, period.label);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    pushToast({
      tono: "success",
      msg: `${visible.length} ${visible.length === 1 ? "línea descargada" : "líneas descargadas"}`,
      detail: "Se abre en Excel con las columnas ya separadas.",
    });
  }

  const toggleSort = (by: "fecha" | "cantidad" | "rend") =>
    setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "desc" }));

  const Icon = meta.icon;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Líneas registradas"
          value={String(kpis.count)}
          subValue={statusFilter === "registrado" ? "Filtrando por estas" : "Ver solo las vigentes"}
          icon={Icon}
          emphasis="neutral"
          onClick={() => setStatusFilter((f) => (f === "registrado" ? "" : "registrado"))}
          className={statusFilter === "registrado" ? ANILLO_ACTIVO : undefined}
        />
        <StatCard label={section === "produccion" ? "Producido total" : "Despachado total"} value={n2(kpis.totalQty)} subValue="suma de cantidades" icon={PackageCheck} emphasis="success" />
        {section === "produccion"
          ? <StatCard label="Rendimiento prom." value={`${kpis.avgRend.toFixed(1)}%`} subValue={`ponderado · ${n2(kpis.consumido)} m³ consumidos`} icon={Scale} emphasis={kpis.avgRend > 0 ? "success" : "neutral"} />
          : <StatCard label="Materia prima ref." value={String(new Set(entries.map((e) => e.gtfNumber).filter(Boolean)).size)} subValue="GTF de salida distintos" icon={Truck} emphasis="neutral" />}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <label htmlFor={`ctp-search-${section}`} className="sr-only">Buscar en {meta.label}</label>
          <input id={`ctp-search-${section}`} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar por especie, producto o GTF..." className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none" />
        </div>
        {/* Una sola fila en móvil: los secundarios como cuadrados con tooltip,
            el CTA se estira. Antes cada uno era una caja de ancho completo. */}
        <div className="flex items-center gap-2">
          <BotonFiltros activos={activos} abierto={abierto} panelId={panelId} onToggle={alternar} />
          <button
            type="button"
            onClick={descargarCsv}
            disabled={visible.length === 0}
            title={`Descargar en Excel/CSV las ${visible.length} líneas de este filtro`}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60 max-sm:w-12 max-sm:px-0"
          >
            <Download className="h-4 w-4" /> <span className="max-sm:sr-only">Descargar</span>
          </button>
          <button type="button" onClick={load} disabled={loading} aria-label="Recargar" title="Recargar" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60 max-sm:w-12 max-sm:px-0">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> <span className="max-sm:sr-only">Recargar</span>
          </button>
          {section === "despacho" && (
            <button
              type="button"
              onClick={() => setVerBandeja(true)}
              title="Los ANEXOS N° 04 ya emitidos: re-imprimir, buscar o bajar el libro en Excel"
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] max-sm:px-3"
            >
              <FileText className="h-5 w-5" /> <span className="max-sm:sr-only">Anexos emitidos</span>
              {totalAnexos > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{totalAnexos}</span>
              )}
            </button>
          )}
          {section === "produccion" && (
            <button type="button" onClick={() => setShowSim(true)} title="Previsualizá producido, costo y margen antes de registrar una corrida" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] max-sm:w-12 max-sm:px-0">
              <Calculator className="h-5 w-5" /> <span className="max-sm:sr-only">Simular</span>
            </button>
          )}
          {section === "produccion" && (
            <Btn size="md" variant="secondary" onClick={() => setImportarParte(true)}>
              <ClipboardList className="h-4 w-4" />
              Parte de turno
            </Btn>
          )}
          <button type="button" onClick={() => setShowForm(true)} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-bold text-white shadow-sm transition hover:brightness-110 sm:flex-none">
            <Plus className="h-5 w-5" /> {meta.cta}
          </button>
        </div>
      </div>
      {showSim && section === "produccion" && <CtpSimuladorModal onClose={() => setShowSim(false)} />}

      {/* Filtro por estado (chips, consistente con Ingresos): oculta anulados de un clic. */}
      {statusCounts.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <EntryChip label="Todos" count={statusCounts.total} active={statusFilter === ""} onClick={() => setStatusFilter("")} />
          {section === "despacho" && sinAnexo > 0 && (
            <EntryChip
              label="Sin anexo 04"
              count={sinAnexo}
              active={soloSinAnexo}
              tone="muted"
              onClick={() => setSoloSinAnexo((v) => !v)}
            />
          )}
          <EntryChip label="Registrados" count={statusCounts.registrado} active={statusFilter === "registrado"} onClick={() => setStatusFilter((f) => (f === "registrado" ? "" : "registrado"))} />
          {statusCounts.anulado > 0 && (
            <EntryChip label="Anulados" count={statusCounts.anulado} active={statusFilter === "anulado"} tone="muted" onClick={() => setStatusFilter((f) => (f === "anulado" ? "" : "anulado"))} />
          )}
        </div>
      )}

      {abierto && (
        <CtpFiltrosPanel
          id={panelId}
          activos={activos}
          selects={[
            { id: "species", label: "Especie", value: facetas.species ?? "", options: opciones.species },
            { id: "product", label: "Producto", value: facetas.product ?? "", options: opciones.products },
            ...(section === "despacho"
              ? [{ id: "destino", label: "Destino", value: facetas.destino ?? "", options: opciones.destinos }]
              : []),
          ]}
          toggles={[{ id: "cites", label: "CITES", on: facetas.cites === true }]}
          onSelect={(id, valor) => setFacetas((f) => ({ ...f, [id]: valor || undefined }))}
          onToggle={() => setFacetas((f) => ({ ...f, cites: f.cites === true ? undefined : true }))}
          onLimpiar={() => setFacetas({})}
        />
      )}

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {toProductMsg && (
        <div className={`flex items-start justify-between gap-3 rounded-xl border-2 p-4 text-sm ${toProductMsg.startsWith("Error") ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]" : "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]"}`}>
          <div className="flex items-start gap-2"><PackagePlus className="mt-0.5 h-5 w-5 shrink-0" /><span>{toProductMsg}</span></div>
          <button type="button" onClick={() => setToProductMsg(null)} className="shrink-0 text-xs font-bold underline opacity-70 hover:opacity-100">Cerrar</button>
        </div>
      )}

      {/* ── Desktop: tabla (≥640px). El `hidden` a <640px gana sobre la
             auto-conversión genérica del shell, dejando lugar a las cards. ── */}
      <div className="hidden overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] sm:block">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th className="w-12 text-right">#</Th>
              <SortTh label="Fecha" by="fecha" sort={sort} onSort={toggleSort} />
              <Th>Especie</Th>
              <Th>Producto</Th>
              {section === "produccion" ? (<><Th className="text-right">Consumido (m³)</Th><SortTh label="Producido" by="cantidad" sort={sort} onSort={toggleSort} className="text-right" /><SortTh label="Rend." by="rend" sort={sort} onSort={toggleSort} className="text-right" /><Th>Salida</Th></>)
                : (<><SortTh label="Cantidad" by="cantidad" sort={sort} onSort={toggleSort} className="text-right" /><Th className="text-right">Piezas</Th><Th>GTF salida</Th><Th>Destino</Th></>)}
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id} className={`border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]/40 ${e.status === "anulado" ? "opacity-50" : ""}`}>
                <Td className="text-right font-mono text-xs text-[var(--text-tertiary)]">{e.lineNo}</Td>
                <Td className="font-medium text-[var(--text-primary)]">{fmtDate(e.entryDate)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">{e.speciesCommon ?? "—"}</span>
                    {e.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                  </div>
                  {e.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{e.speciesScientific}</div>}
                </Td>
                <Td>
                  <span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">{e.productType ?? "—"}</span>
                  {e.codigoProducto && (
                    <div className="mt-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{e.codigoProducto}</div>
                  )}
                </Td>
                {section === "produccion" ? (
                  <>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n4(e.volumeInputM3)}</Td>
                    <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n4(e.quantity)} <span className="text-xs font-normal text-[var(--text-tertiary)]">{e.unit}</span></Td>
                    <Td className="text-right"><RendimientoCell productType={e.productType} rendimientoPct={e.rendimientoPct} /></Td>
                    <Td><SalidaBadge entry={e} /></Td>
                  </>
                ) : (
                  <>
                    <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {n4(e.quantity)} <span className="text-xs font-normal text-[var(--text-tertiary)]">{e.unit}</span>
                      <AtribucionBadge entry={e} />
                    </Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{e.pieces ?? "—"}</Td>
                    <Td className="font-mono text-xs font-bold text-[var(--text-primary)]">{e.gtfNumber ?? "—"}</Td>
                    <Td className="text-[var(--text-secondary)]">{e.destino ?? "—"}</Td>
                  </>
                )}
                <Td>{e.status === "anulado"
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]"><XIcon className="h-3 w-3" />Anulado</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-100)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)]">Registrado</span>}
                  {e.annulledReason && <div className="mt-1 text-xs text-[var(--data-error-700)]">{e.annulledReason}</div>}
                </Td>
                <Td className="text-right">
                  {e.status === "registrado" ? (
                    <div className="inline-flex items-center gap-1">
                      <IconAction
                        icon={Link2}
                        tone="success"
                        onClick={() => setChainEntry(e)}
                        label={section === "despacho"
                          ? "Cadena de custodia: origen, costo y certificado"
                          : "Corrida: materia prima consumida, costo y congelado"}
                      />
                      <IconAction
                        icon={PackagePlus}
                        tone="info"
                        disabled={toProductId === e.id}
                        busy={toProductId === e.id}
                        onClick={() => sendToInventory(e.id)}
                        label={toProductId === e.id ? "Creando el producto…" : "Enviar a inventario (borrador inactivo)"}
                      />
                      {section === "despacho" && (
                        <IconAction
                          icon={FileText}
                          tone={conAnexo.has(e.id) ? "accent" : "muted"}
                          done={conAnexo.has(e.id)}
                          onClick={() => setAnexoEntry(e)}
                          label={conAnexo.has(e.id)
                            ? "ANEXO N° 04 emitido — abrir para re-imprimir o corregir"
                            : "Emitir el ANEXO N° 04 de esta GTF"}
                        />
                      )}
                      <IconAction
                        icon={XIcon}
                        tone="danger"
                        onClick={() => { setAnnulId(e.id); setAnnulReason(""); }}
                        label="Anular la línea"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--text-tertiary)]">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
          {visible.length > 0 && (
            <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
                  {totalesVista.lineas} {totalesVista.lineas === 1 ? "línea vigente" : "líneas vigentes"} en pantalla
                </td>
                {section === "produccion" ? (
                  <>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.consumido.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.cantidad.toFixed(4)}</td>
                    <td colSpan={4} />
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.cantidad.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.piezas}</td>
                    <td colSpan={4} />
                  </>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Mobile: cards a medida (<640px) ── */}
      {visible.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {visible.map((e) => (
            <CtpSeccionCardMobile
              key={e.id}
              entry={e}
              section={section}
              toProductId={toProductId}
              onChain={setChainEntry}
              onAnexo={section === "despacho" ? setAnexoEntry : undefined}
              anexoEmitido={conAnexo.has(e.id)}
              onSendInventory={sendToInventory}
              onAnnul={(id) => { setAnnulId(id); setAnnulReason(""); }}
            />
          ))}
        </div>
      )}

      {/* Filtro activo sin resultados (pero sí hay datos): distinto de "sin datos". */}
      {!loading && entries.length > 0 && visible.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
          Ninguna línea {statusFilter === "anulado" ? "anulada" : statusFilter === "registrado" ? "registrada" : ""} en {period.label}.
        </div>
      )}

      {/* ── Estados compartidos (vacío / cargando) ── */}
      {!loading && entries.length === 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <Icon className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">{search.trim() ? "Ninguna línea coincide con la búsqueda." : meta.empty}</p>
          {!search.trim() && period.from && (
            <p className="mt-1 text-sm">Mostrando {period.label} — puede haber líneas fuera de este período.</p>
          )}
        </div>
      )}
      {loading && <TablaSkeleton filas={4} columnas={section === "produccion" ? 8 : 9} />}

      {importarParte && (
        <CtpProduccionImportModal
          onListo={() => { void load(); }}
          onClose={() => setImportarParte(false)}
        />
      )}
      {showForm && <CtpEntryForm section={section} presetProducto={productoDelStock?.producto ?? null} presetEspecie={productoDelStock?.especie ?? null} onClose={() => { setShowForm(false); setProductoDelStock(null); }} onSaved={(o) => { if (!o?.keepOpen) { setShowForm(false); setProductoDelStock(null); } load(); if (o?.offline) pushToast({ tono: "warning", msg: "Sin señal: quedó anotado en el patio", detail: "Todavía NO está en el libro. Sube solo cuando vuelva la conexión." }); }} />}
      {verBandeja && (
        <Anexo04Modal
          rows={[]}
          abrirHistorial
          onAviso={(msg, tono) => pushToast({ tono, msg })}
          onCerrar={() => { setVerBandeja(false); cargarAnexos(); }}
        />
      )}

      {anexoEntry && (
        <Anexo04Modal
          rows={[]}
          especieGlobal={anexoEntry.speciesCommon ?? undefined}
          gtfInicial={anexoEntry.gtfNumber ?? ""}
          ctpEntryId={anexoEntry.id}
          declarado={{ cantidad: Number(anexoEntry.quantity ?? 0), unidad: anexoEntry.unit, piezas: anexoEntry.pieces }}
          // El anexo y la guía son los dos papeles del mismo camión: se miran
          // en el mismo modal en vez de en dos pantallas.
          despacho={anexoEntry.section === "despacho" ? anexoEntry : undefined}
          onAviso={(msg, tono) => pushToast({ tono, msg })}
          observacionesIniciales={[anexoEntry.productType, anexoEntry.destino ? `Destino: ${anexoEntry.destino}` : ""].filter(Boolean).join(" · ")}
          onCerrar={() => { setAnexoEntry(null); cargarAnexos(); }}
        />
      )}

      <ActionToasts toasts={toasts} onDismiss={dismissToast} />

      {/* Al cerrar se recarga: en la ficha se emite la GTF y se edita la atribución,
          y sin esto la fila seguía mostrando el número y el origen viejos. */}
      {chainEntry && section === "despacho" && (
        <CtpDespachoDetalleModal entry={chainEntry} onClose={() => { setChainEntry(null); void load(); }} />
      )}
      {chainEntry && section === "produccion" && <CtpProduccionDetalleModal entry={chainEntry} onClose={() => setChainEntry(null)} />}

      {annulId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAnnulId(null)}>
          <div className="w-full max-w-md rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">Anular línea</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">Indicá el motivo (queda en el historial, no se borra).</p>
            <input autoFocus value={annulReason} onChange={(e) => setAnnulReason(e.target.value)} placeholder="Motivo (min 3 caracteres)" className="mt-3 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm outline-none focus:border-[var(--data-error-500)]" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAnnulId(null)} className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)]">Cancelar</button>
              <button type="button" disabled={annulReason.trim().length < 3 || pending} onClick={annul} className="inline-flex h-10 items-center rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">Confirmar anulación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Celda de rendimiento con alerta de sobre-declaración vs. el referencial SERFOR. */
function RendimientoCell({ productType, rendimientoPct }: { productType: string | null; rendimientoPct: string | null }) {
  const pct = rendimientoPct != null ? Number(rendimientoPct) : null;
  const { estado, ref } = evaluarRendimiento(productType, pct);
  const alto = estado === "alto";
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {alto && (
        <AlertCircle
          className="h-3.5 w-3.5 text-[var(--data-warning-600)]"
          aria-label={`Rendimiento sobre el referencial SERFOR (${ref}%): revisá que no haya sobre-declaración`}
        />
      )}
      <span className={`font-mono text-xs font-bold tabular-nums ${alto ? "text-[var(--data-warning-700)]" : "text-[var(--data-info-700)]"}`}>
        {pct != null ? `${pct.toFixed(1)}%` : "—"}
      </span>
    </span>
  );
}

type SortKey = "fecha" | "cantidad" | "rend";
/** Encabezado de columna ordenable: click alterna asc/desc; indica el estado con flecha. */
function SortTh({ label, by, sort, onSort, className }: {
  label: string; by: SortKey; sort: { by: SortKey | null; dir: "asc" | "desc" }; onSort: (by: SortKey) => void; className?: string;
}) {
  const active = sort.by === by;
  const Ico = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const right = className?.includes("text-right");
  return (
    <th className={`px-4 py-3 font-bold ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(by)}
        className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""} ${active ? "text-[var(--accent)]" : "text-[var(--text-primary)] hover:text-[var(--accent)]"}`}
      >
        {label} <Ico className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`} />
      </button>
    </th>
  );
}

/** Chip de filtro por estado (mismo lenguaje que los de Ingresos). */
function EntryChip({ label, count, active, onClick, tone = "accent" }: {
  label: string; count: number; active: boolean; onClick: () => void; tone?: "accent" | "muted";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition ${
        active
          ? tone === "muted"
            ? "border-[var(--text-tertiary)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
            : "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] tabular-nums ${active ? "bg-[var(--surface-raised)]/70" : "bg-[var(--surface-sunken)]"}`}>{count}</span>
    </button>
  );
}
