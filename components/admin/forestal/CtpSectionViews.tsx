"use client";

/**
 * CtpSectionViews — vistas de Producción · Despacho · Saldos del Libro CTP (ADR-127).
 * Producción y Despacho comparten tabla (CtpEntriesView, adaptada por sección).
 * Saldos resume materia prima (m³) y stock de productos transformados.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, RefreshCw, Search, Boxes, Truck, AlertCircle, X as XIcon,
  Scale, PackageCheck, Layers, PackagePlus, Clock, TreePine, Link2, Calculator,
  ArrowUp, ArrowDown, ArrowUpDown,
} from "@buleje/design-system/icons";
import { StatCard, CardTitle } from "@buleje/design-system";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { csrfHeaders } from "@/lib/csrf-client";
import { useDebounce } from "@/hooks/use-debounce";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { evaluarRendimiento } from "@/lib/forestal/ctp-rendimiento";
import CtpEntryForm from "./CtpEntryForm";
import CtpDespachoDetalleModal from "./CtpDespachoDetalleModal";
import CtpProduccionDetalleModal from "./CtpProduccionDetalleModal";
import CtpSeccionCardMobile from "./CtpSeccionCardMobile";
import CtpSimuladorModal from "./CtpSimuladorModal";
import CtpKardexModal from "./CtpKardexModal";
import CtpPatioAging from "./CtpPatioAging";

export type CtpSection = "produccion" | "despacho";

export interface CtpEntry {
  id: string; section: CtpSection; lineNo: number; entryDate: string;
  gtfIngreso: string | null; materiaPrimaRef: string | null;
  speciesCommon: string | null; speciesScientific: string | null; cites: boolean;
  productType: string | null; volumeInputM3: string | null; rendimientoPct: string | null;
  quantity: string | null; unit: string | null; pieces: number | null;
  gtfNumber: string | null; destino: string | null; observations: string | null;
  status: "registrado" | "anulado"; annulledReason: string | null;
}

const SECTION_META: Record<CtpSection, { label: string; icon: typeof Boxes; cta: string; empty: string }> = {
  produccion: { label: "Producción", icon: Boxes, cta: "Nueva producción", empty: "Sin transformaciones registradas. Registrá la primera para convertir materia prima en producto." },
  despacho: { label: "Despacho", icon: Truck, cta: "Nuevo despacho", empty: "Sin despachos registrados. Registrá la salida de producto con su GTF." },
};

// timeZone UTC: entryDate es date-only guardada a medianoche UTC — en hora Lima se corría un día.
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };
const n4 = (v: string | null) => (v == null ? "—" : Number(v).toFixed(4));
const n2 = (v: number) => v.toFixed(2);

// ─── Producción / Despacho ───────────────────────────────────────────────────
export function CtpEntriesView({ section, period }: { section: CtpSection; period: CtpPeriod }) {
  const meta = SECTION_META[section];
  const [entries, setEntries] = useState<CtpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  // Sin debounce, `load` se re-creaba en cada tecla → un fetch por caracter.
  const search = useDebounce(searchInput, 350);
  const [showForm, setShowForm] = useState(false);
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
  const [sort, setSort] = useState<{ by: "fecha" | "cantidad" | "rend" | null; dir: "asc" | "desc" }>({ by: null, dir: "desc" });

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
  const visible = useMemo(() => {
    const list = statusFilter ? entries.filter((e) => e.status === statusFilter) : entries;
    if (!sort.by) return list;
    const val = (e: CtpEntry) =>
      sort.by === "fecha" ? new Date(e.entryDate).getTime()
      : sort.by === "cantidad" ? Number(e.quantity ?? 0)
      : Number(e.rendimientoPct ?? 0);
    return [...list].sort((a, b) => { const d = val(a) - val(b); return sort.dir === "asc" ? d : -d; });
  }, [entries, statusFilter, sort]);

  const toggleSort = (by: "fecha" | "cantidad" | "rend") =>
    setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "desc" }));

  const Icon = meta.icon;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Líneas registradas" value={String(kpis.count)} icon={Icon} emphasis="neutral" />
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
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar
        </button>
        {section === "produccion" && (
          <button type="button" onClick={() => setShowSim(true)} title="Previsualizá producido, costo y margen antes de registrar una corrida" className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--brand-ink)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--brand-ink)] hover:bg-[var(--surface-canvas)]">
            <Calculator className="h-5 w-5" /> Simular
          </button>
        )}
        <button type="button" onClick={() => setShowForm(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-5 text-base font-bold text-white shadow-sm hover:opacity-90">
          <Plus className="h-5 w-5" /> {meta.cta}
        </button>
      </div>
      {showSim && section === "produccion" && <CtpSimuladorModal onClose={() => setShowSim(false)} />}

      {/* Filtro por estado (chips, consistente con Ingresos): oculta anulados de un clic. */}
      {statusCounts.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <EntryChip label="Todos" count={statusCounts.total} active={statusFilter === ""} onClick={() => setStatusFilter("")} />
          <EntryChip label="Registrados" count={statusCounts.registrado} active={statusFilter === "registrado"} onClick={() => setStatusFilter((f) => (f === "registrado" ? "" : "registrado"))} />
          {statusCounts.anulado > 0 && (
            <EntryChip label="Anulados" count={statusCounts.anulado} active={statusFilter === "anulado"} tone="muted" onClick={() => setStatusFilter((f) => (f === "anulado" ? "" : "anulado"))} />
          )}
        </div>
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
              {section === "produccion" ? (<><Th className="text-right">Consumido (m³)</Th><SortTh label="Producido" by="cantidad" sort={sort} onSort={toggleSort} className="text-right" /><SortTh label="Rend." by="rend" sort={sort} onSort={toggleSort} className="text-right" /></>)
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
                <Td><span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">{e.productType ?? "—"}</span></Td>
                {section === "produccion" ? (
                  <>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n4(e.volumeInputM3)}</Td>
                    <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n4(e.quantity)} <span className="text-xs font-normal text-[var(--text-tertiary)]">{e.unit}</span></Td>
                    <Td className="text-right"><RendimientoCell productType={e.productType} rendimientoPct={e.rendimientoPct} /></Td>
                  </>
                ) : (
                  <>
                    <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n4(e.quantity)} <span className="text-xs font-normal text-[var(--text-tertiary)]">{e.unit}</span></Td>
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
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setChainEntry(e)}
                        title={section === "despacho"
                          ? "Cadena de custodia: origen, costo y certificado de trazabilidad"
                          : "Corrida: materia prima consumida, costo y congelado"}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] px-3 text-xs font-bold text-[var(--data-success-700)] hover:bg-[var(--data-success-100)]"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Cadena
                      </button>
                      <button
                        type="button"
                        disabled={toProductId === e.id}
                        onClick={() => sendToInventory(e.id)}
                        title="Crea el producto como borrador en el catálogo (inactivo)"
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--data-info-500)] bg-[var(--data-info-50)] px-3 text-xs font-bold text-[var(--data-info-700)] hover:bg-[var(--data-info-100)] disabled:opacity-50"
                      >
                        <PackagePlus className="h-3.5 w-3.5" />
                        {toProductId === e.id ? "Creando…" : "Enviar a inventario"}
                      </button>
                      <button type="button" onClick={() => { setAnnulId(e.id); setAnnulReason(""); }} className="inline-flex h-9 items-center rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]">Anular</button>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--text-tertiary)]">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
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
      {loading && <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>}

      {showForm && <CtpEntryForm section={section} onClose={() => setShowForm(false)} onSaved={(o) => { if (!o?.keepOpen) setShowForm(false); load(); }} />}
      {chainEntry && section === "despacho" && <CtpDespachoDetalleModal entry={chainEntry} onClose={() => setChainEntry(null)} />}
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

// ─── Saldos ───────────────────────────────────────────────────────────────────
interface SpeciesBalance {
  especie: string; scientific: string | null; cites: boolean;
  ingresoM3: number; pendienteM3: number; consumidoM3: number; saldoM3: number; ingresosCount: number;
}
interface SaldosData {
  materiaPrima: {
    ingresoM3: number; ingresosCount: number; consumidoM3: number; saldoM3: number;
    pendienteM3: number; especiesEnNegativo: number;
  };
  porEspecie: SpeciesBalance[];
  productos: { producto: string; producido: number; despachado: number; stock: number }[];
}

interface ConcilMP { especie: string; cites: boolean; apertura: number; ingreso: number; consumido: number; final: number; negativa: boolean }
interface Concil { fuenteApertura: "cierre" | "calculada" | "sin_apertura"; aperturaLabel: string | null; materiaPrima: ConcilMP[]; productos: { producto: string; apertura: number; producido: number; despachado: number; final: number; negativo: boolean }[] }

export function CtpSaldosView({ period }: { period: CtpPeriod }) {
  const [data, setData] = useState<SaldosData | null>(null);
  const [concil, setConcil] = useState<Concil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kardexEspecie, setKardexEspecie] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = applyCtpPeriodParams(new URLSearchParams({ saldos: "1" }), period);
      const r = await fetch(`/api/admin/forestal/ctp?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setData((await r.json()).saldos);
      // Conciliación (apertura + movimientos = final) — solo si el período tiene inicio.
      if (period.from) {
        const cp = applyCtpPeriodParams(new URLSearchParams({ conciliacion: "1" }), period);
        const cr = await fetch(`/api/admin/forestal/ctp?${cp}`, { credentials: "include" });
        setConcil(cr.ok ? (await cr.json()).conciliacion : null);
      } else { setConcil(null); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const mp = data?.materiaPrima;

  // Balance por especie, dibujado: lo que entró (validado) vs. lo que se consumió
  // en producción. Barras a la par = especie agotada; ingreso > consumo = stock en
  // patio. Es el balance que se fiscaliza, de un vistazo (el detalle en la tabla).
  const balanceChart = useMemo(
    () => (data?.porEspecie ?? []).map((s) => ({
      especie: s.especie.length > 14 ? s.especie.slice(0, 13) + "…" : s.especie,
      Ingreso: s.ingresoM3,
      Consumido: s.consumidoM3,
    })),
    [data],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-tertiary)]"><strong className="text-[var(--text-secondary)]">Existencias del Libro (LO-CTP)</strong> en {period.label}: materia prima que entra vs. producto que sale. Es el saldo que se declara ante SERFOR — va en la hoja «Existencias» del export oficial.</p>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {data && mp && (
        <>
          {/* La alerta que importa: el balance global puede tapar una especie en rojo. */}
          {mp.especiesEnNegativo > 0 && (
            <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <strong>{mp.especiesEnNegativo} {mp.especiesEnNegativo === 1 ? "especie tiene" : "especies tienen"} saldo negativo.</strong>{" "}
                Se transformó más volumen del que ingresó validado. Revisá los ingresos sin validar o las cantidades cargadas en Producción.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Ingresado (validado)" value={`${n2(mp.ingresoM3)} m³`} subValue={`${mp.ingresosCount} ingresos`} icon={Layers} emphasis="neutral" />
            <StatCard label="Consumido en producción" value={`${n2(mp.consumidoM3)} m³`} icon={Boxes} emphasis="neutral" />
            <StatCard label="Saldo de materia prima" value={`${n2(mp.saldoM3)} m³`} subValue={mp.saldoM3 < 0 ? "sobreconsumo" : "disponible"} icon={Scale} emphasis={mp.saldoM3 < 0 ? "error" : "success"} />
            <StatCard label="Pendiente de validar" value={`${n2(mp.pendienteM3)} m³`} subValue="no computa como saldo" icon={Clock} emphasis={mp.pendienteM3 > 0 ? "warning" : "neutral"} />
          </div>

          {/* Balance por especie, dibujado: entra (validado) vs. sale (consumido). */}
          {balanceChart.length > 0 && (
            <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Materia prima por especie · entra vs. consumido (m³)</CardTitle>
              <p className="mb-2 text-xs text-[var(--text-tertiary)]">Barras a la par = especie agotada en producción; ingreso por encima del consumo = stock en patio.</p>
              <BulejeComposedChart
                data={balanceChart}
                xKey="especie"
                bars={[
                  { key: "Ingreso", label: "Ingreso", color: "accent", yAxis: "left" },
                  { key: "Consumido", label: "Consumido", color: "amber", yAxis: "left" },
                ]}
                height={240}
                minDataPoints={1}
                leftAxisFormat={(v) => `${v}`}
                tooltipFormat={(v) => `${Number(v).toFixed(2)} m³`}
              />
            </div>
          )}

          {/* Conciliación: apertura (del cierre anterior) + movimientos = final (ADR-139 rollforward). */}
          {concil && concil.materiaPrima.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <div className="border-b-2 border-[var(--rule-base)] px-4 py-3">
                <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Conciliación del período · apertura → cierre</CardTitle>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Existencia de apertura {concil.fuenteApertura === "cierre" ? `(del cierre de ${concil.aperturaLabel})` : concil.fuenteApertura === "calculada" ? "(acumulada al inicio)" : "(sin cierre previo)"} + movimientos del período = existencia final. Así el saldo cuadra con el stock heredado.</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)] text-left"><tr><Th>Especie</Th><Th className="text-right">Apertura (m³)</Th><Th className="text-right">+ Ingreso</Th><Th className="text-right">− Consumido</Th><Th className="text-right">= Final (m³)</Th></tr></thead>
                <tbody>
                  {concil.materiaPrima.map((s) => (
                    <tr key={s.especie} className="border-t border-[var(--rule-soft)]">
                      <td className="px-4 py-2 text-[var(--text-primary)]">{s.especie}{s.cites ? " · CITES" : ""}</td>
                      <td className="px-4 py-2 text-right text-[var(--text-secondary)]">{n2(s.apertura)}</td>
                      <td className="px-4 py-2 text-right text-[var(--data-success-700)]">{n2(s.ingreso)}</td>
                      <td className="px-4 py-2 text-right text-[var(--text-secondary)]">{n2(s.consumido)}</td>
                      <td className={`px-4 py-2 text-right font-bold ${s.negativa ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n2(s.final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Balance POR ESPECIE — es lo que se fiscaliza; el global solo resume. */}
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <div className="border-b-2 border-[var(--rule-base)] px-4 py-3">
              <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Balance por especie</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Ingreso validado − consumo en producción. Es el balance que se fiscaliza.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left">
                <tr>
                  <Th>Especie</Th>
                  <Th className="text-right">Ingresado (m³)</Th>
                  <Th className="text-right">Consumido (m³)</Th>
                  <Th className="text-right">Saldo (m³)</Th>
                  <Th className="text-right">Sin validar (m³)</Th>
                </tr>
              </thead>
              <tbody>
                {data.porEspecie.map((s) => (
                  <tr
                    key={s.especie}
                    tabIndex={0}
                    role="button"
                    title={`Ver kardex de ${s.especie}`}
                    onClick={() => setKardexEspecie(s.especie)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setKardexEspecie(s.especie); } }}
                    className={`cursor-pointer border-t border-[var(--rule-soft)] outline-none transition-colors hover:bg-[var(--surface-canvas)] focus-visible:bg-[var(--surface-canvas)] ${s.saldoM3 < 0 ? "bg-[var(--data-error-50)]" : ""}`}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text-primary)]">{s.especie}</span>
                        {s.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">· ver kardex</span>
                      </div>
                      {s.scientific && <div className="text-xs italic text-[var(--text-tertiary)]">{s.scientific}</div>}
                    </Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(s.ingresoM3)}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(s.consumidoM3)}</Td>
                    <Td className="text-right">
                      <span className={`font-mono font-bold tabular-nums ${s.saldoM3 < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n2(s.saldoM3)}</span>
                    </Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-tertiary)]">{s.pendienteM3 > 0 ? n2(s.pendienteM3) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
              {data.porEspecie.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
                    <Td className="text-[var(--text-primary)]">Total ({data.porEspecie.length} especie{data.porEspecie.length === 1 ? "" : "s"})</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(mp.ingresoM3)}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(mp.consumidoM3)}</Td>
                    <Td className="text-right"><span className={`font-mono tabular-nums ${mp.saldoM3 < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n2(mp.saldoM3)}</span></Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-tertiary)]">{mp.pendienteM3 > 0 ? n2(mp.pendienteM3) : "—"}</Td>
                  </tr>
                </tfoot>
              )}
            </table>
            {data.porEspecie.length === 0 && <div className="p-10 text-center text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-3 h-9 w-9 opacity-30" /><p className="text-sm">Sin movimientos de madera en {period.label}.</p></div>}
          </div>

          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <div className="border-b-2 border-[var(--rule-base)] px-4 py-3"><CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Stock de productos transformados</CardTitle></div>
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left">
                <tr><Th>Producto · Especie</Th><Th className="text-right">Producido</Th><Th className="text-right">Despachado</Th><Th className="text-right">Stock</Th></tr>
              </thead>
              <tbody>
                {data.productos.map((p) => (
                  <tr key={p.producto} className="border-t border-[var(--rule-soft)]">
                    <Td className="font-medium text-[var(--text-primary)]">{p.producto}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(p.producido)}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(p.despachado)}</Td>
                    <Td className="text-right"><span className={`font-mono font-bold tabular-nums ${p.stock < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n2(p.stock)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.productos.length === 0 && <div className="p-10 text-center text-[var(--text-tertiary)]"><PackageCheck className="mx-auto mb-3 h-9 w-9 opacity-30" /><p className="text-sm">Sin productos transformados todavía.</p></div>}
          </div>

          {/* Gemelo del patio: materia prima parada por antigüedad (self-fetch). */}
          <CtpPatioAging />
        </>
      )}
      {loading && !data && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando saldos…</p></div>}

      {kardexEspecie && <CtpKardexModal especie={kardexEspecie} period={period} onClose={() => setKardexEspecie(null)} />}
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
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
            : "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dark)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] tabular-nums ${active ? "bg-[var(--surface-raised)]/70" : "bg-[var(--surface-sunken)]"}`}>{count}</span>
    </button>
  );
}
