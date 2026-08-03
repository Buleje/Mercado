"use client";

/**
 * CtpEntriesView — tabla de Producción/Despacho del Libro CTP (ADR-127).
 * Producción y Despacho comparten esta misma tabla, adaptada por sección.
 * Saldos (balance de planta) vive en CtpSaldosView, componente hermano.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, RefreshCw, Search, Boxes, Truck, AlertCircle, Scale, PackageCheck, PackagePlus, Calculator, FileText, Download, ClipboardList } from "@buleje/design-system/icons";
import { StatCard, CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useDebounce } from "@/hooks/use-debounce";
import { type CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpEntryForm from "./CtpEntryForm";
import CtpProduccionImportModal from "./CtpProduccionImportModal";
import CtpDespachoDetalleModal from "./CtpDespachoDetalleModal";
import CtpProduccionDetalleModal from "./CtpProduccionDetalleModal";
import CtpEntriesTabla, { type SortKey } from "./CtpEntriesTabla";
import { useCtpSeccion } from "@/hooks/use-ctp-secciones";
import CtpSimuladorModal from "./CtpSimuladorModal";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import CtpFiltrosPanel, { BotonFiltros } from "./ctp-filtros-panel";
import { nombreArchivoSeccion, seccionACsv } from "@/lib/forestal/ctp-secciones-csv";

// El anexo arrastra jsPDF/exceljs: entra solo cuando alguien lo pide.
const Anexo04Modal = dynamic(() => import("./Anexo04Modal"), { ssr: false });
import { type CtpEntry, type CtpSection, n2 } from "./ctp-section-shared";
import { Btn, TablaSkeleton } from "./ctp-shared";

/** Una tarjeta que filtra se ve hundida: si no, nadie sabe por qué la tabla
 *  de abajo tiene menos filas. */
const ANILLO_ACTIVO = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]";

const SECTION_META: Record<CtpSection, { label: string; icon: typeof Boxes; cta: string; empty: string }> = {
  produccion: { label: "Producción", icon: Boxes, cta: "Nueva producción", empty: "Sin transformaciones registradas. Registrá la primera para convertir materia prima en producto." },
  despacho: { label: "Despacho", icon: Truck, cta: "Nuevo despacho", empty: "Sin despachos registrados. Registrá la salida de producto con su GTF." },
};



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
  /** Bandeja de anexos emitidos abierta desde la barra (consulta, sin despacho). */
  const [verBandeja, setVerBandeja] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  // Sin debounce, `load` se re-creaba en cada tecla → un fetch por caracter.
  const search = useDebounce(searchInput, 350);

  /** Todo lo que se SABE de la sección: fetch, filtros, orden y derivados. */
  const {
    entries, loading, error, setError, recargar: load,
    conAnexo, totalAnexos, recargarAnexos: cargarAnexos, sinAnexo,
    statusFilter, setStatusFilter, soloSinAnexo, setSoloSinAnexo,
    sort, setSort, facetas, setFacetas, activos, panelId, abierto, alternar, opciones,
    visible, totalesVista, kpis, statusCounts,
  } = useCtpSeccion(section, period, search);
  /** Despacho para el que se está emitiendo el ANEXO N° 04 de la GTF. */
  const [anexoEntry, setAnexoEntry] = useState<CtpEntry | null>(null);
  // Los avisos del anexo (descargó, no se pudo, cargué el ya emitido) necesitan
  // dónde salir: sin esto el modal hablaba solo cuando se abría desde el Libro.
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
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

  const toggleSort = (by: SortKey) =>
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

      {/* Las filas viven aparte (CtpEntriesTabla): acá quedan el estado, los
          KPIs, los filtros y los modales. */}
      <CtpEntriesTabla
        section={section}
        visible={visible}
        sort={sort}
        onSort={toggleSort}
        conAnexo={conAnexo}
        toProductId={toProductId}
        onChain={setChainEntry}
        onAnexo={setAnexoEntry}
        onSendInventory={sendToInventory}
        onAnnul={(id) => { setAnnulId(id); setAnnulReason(""); }}
        totalesVista={totalesVista}
      />

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

/** Encabezado de columna ordenable: click alterna asc/desc; indica el estado con flecha. */

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
