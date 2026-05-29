"use client";

/**
 * CtpSectionViews — vistas de Producción · Despacho · Saldos del Libro CTP (ADR-127).
 * Producción y Despacho comparten tabla (CtpEntriesView, adaptada por sección).
 * Saldos resume materia prima (m³) y stock de productos transformados.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, RefreshCw, Search, Boxes, Truck, AlertCircle, X as XIcon,
  Scale, PackageCheck, Layers,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import CtpEntryForm from "./CtpEntryForm";

type CtpSection = "produccion" | "despacho";

interface CtpEntry {
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

const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };
const n4 = (v: string | null) => (v == null ? "—" : Number(v).toFixed(4));
const n2 = (v: number) => v.toFixed(2);

// ─── Producción / Despacho ───────────────────────────────────────────────────
export function CtpEntriesView({ section }: { section: CtpSection }) {
  const meta = SECTION_META[section];
  const [entries, setEntries] = useState<CtpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ section });
      if (search.trim()) p.set("search", search.trim());
      const r = await fetch(`/api/admin/forestal/ctp?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setEntries((await r.json()).entries ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [section, search]);
  useEffect(() => { load(); }, [load]);

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

  const kpis = useMemo(() => {
    const reg = entries.filter((e) => e.status === "registrado");
    const totalQty = reg.reduce((a, e) => a + Number(e.quantity ?? 0), 0);
    const consumido = reg.reduce((a, e) => a + Number(e.volumeInputM3 ?? 0), 0);
    const rends = reg.map((e) => Number(e.rendimientoPct ?? 0)).filter((x) => x > 0);
    const avgRend = rends.length ? rends.reduce((a, b) => a + b, 0) / rends.length : 0;
    return { count: reg.length, totalQty, consumido, avgRend };
  }, [entries]);

  const Icon = meta.icon;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Líneas registradas" value={String(kpis.count)} icon={Icon} emphasis="neutral" />
        <StatCard label={section === "produccion" ? "Producido total" : "Despachado total"} value={n2(kpis.totalQty)} subValue="suma de cantidades" icon={PackageCheck} emphasis="success" />
        {section === "produccion"
          ? <StatCard label="Rendimiento prom." value={`${kpis.avgRend.toFixed(1)}%`} subValue={`${n2(kpis.consumido)} m³ consumidos`} icon={Scale} emphasis={kpis.avgRend > 0 ? "success" : "neutral"} />
          : <StatCard label="Materia prima ref." value={String(new Set(entries.map((e) => e.gtfNumber).filter(Boolean)).size)} subValue="GTF de salida distintos" icon={Truck} emphasis="neutral" />}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Buscar por especie, producto o GTF..." className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none" />
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar
        </button>
        <button type="button" onClick={() => setShowForm(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-5 text-base font-bold text-white shadow-sm hover:opacity-90">
          <Plus className="h-5 w-5" /> {meta.cta}
        </button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-4 text-sm text-[var(--data-danger-900)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th className="w-12 text-right">#</Th>
              <Th>Fecha</Th>
              <Th>Especie</Th>
              <Th>Producto</Th>
              {section === "produccion" ? (<><Th className="text-right">Consumido (m³)</Th><Th className="text-right">Producido</Th><Th className="text-right">Rend.</Th></>)
                : (<><Th className="text-right">Cantidad</Th><Th className="text-right">Piezas</Th><Th>GTF salida</Th><Th>Destino</Th></>)}
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={`border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]/40 ${e.status === "anulado" ? "opacity-50" : ""}`}>
                <Td className="text-right font-mono text-xs text-[var(--text-tertiary)]">{e.lineNo}</Td>
                <Td className="font-medium text-[var(--text-primary)]">{fmtDate(e.entryDate)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">{e.speciesCommon ?? "—"}</span>
                    {e.cites && <span className="rounded-full bg-[var(--data-danger-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-danger-900)]">CITES</span>}
                  </div>
                  {e.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{e.speciesScientific}</div>}
                </Td>
                <Td><span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">{e.productType ?? "—"}</span></Td>
                {section === "produccion" ? (
                  <>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n4(e.volumeInputM3)}</Td>
                    <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n4(e.quantity)} <span className="text-xs font-normal text-[var(--text-tertiary)]">{e.unit}</span></Td>
                    <Td className="text-right"><span className="font-mono text-xs font-bold tabular-nums text-[var(--data-info-700)]">{e.rendimientoPct ? `${Number(e.rendimientoPct).toFixed(1)}%` : "—"}</span></Td>
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
                  : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-100)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-900)]">Registrado</span>}
                  {e.annulledReason && <div className="mt-1 text-xs text-[var(--data-danger-700)]">{e.annulledReason}</div>}
                </Td>
                <Td className="text-right">
                  {e.status === "registrado"
                    ? <button type="button" onClick={() => { setAnnulId(e.id); setAnnulReason(""); }} className="inline-flex h-9 items-center rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] px-3 text-xs font-bold text-[var(--data-danger-900)] hover:bg-[var(--data-danger-100)]">Anular</button>
                    : <span className="text-xs text-[var(--text-tertiary)]">—</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && entries.length === 0 && (
          <div className="p-12 text-center text-[var(--text-tertiary)]"><Icon className="mx-auto mb-3 h-10 w-10 opacity-30" /><p className="text-base font-medium">{meta.empty}</p></div>
        )}
        {loading && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>}
      </div>

      {showForm && <CtpEntryForm section={section} onClose={() => setShowForm(false)} onSaved={(o) => { if (!o?.keepOpen) setShowForm(false); load(); }} />}

      {annulId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAnnulId(null)}>
          <div className="w-full max-w-md rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Anular línea</h3>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">Indicá el motivo (queda en el historial, no se borra).</p>
            <input autoFocus value={annulReason} onChange={(e) => setAnnulReason(e.target.value)} placeholder="Motivo (min 3 caracteres)" className="mt-3 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm outline-none focus:border-[var(--data-danger-500)]" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAnnulId(null)} className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)]">Cancelar</button>
              <button type="button" disabled={annulReason.trim().length < 3 || pending} onClick={annul} className="inline-flex h-10 items-center rounded-xl bg-[var(--data-danger-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">Confirmar anulación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Saldos ───────────────────────────────────────────────────────────────────
interface SaldosData {
  materiaPrima: { ingresoM3: number; ingresosCount: number; consumidoM3: number; saldoM3: number };
  productos: { producto: string; producido: number; despachado: number; stock: number }[];
}

export function CtpSaldosView() {
  const [data, setData] = useState<SaldosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp?saldos=1", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setData((await r.json()).saldos);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-tertiary)]">Balance de planta: materia prima que entra vs. producto que sale.</p>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-4 text-sm text-[var(--data-danger-900)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Ingresado (materia prima)" value={`${n2(data.materiaPrima.ingresoM3)} m³`} subValue={`${data.materiaPrima.ingresosCount} ingresos`} icon={Layers} emphasis="neutral" />
            <StatCard label="Consumido en producción" value={`${n2(data.materiaPrima.consumidoM3)} m³`} icon={Boxes} emphasis="neutral" />
            <StatCard label="Saldo de materia prima" value={`${n2(data.materiaPrima.saldoM3)} m³`} subValue={data.materiaPrima.saldoM3 < 0 ? "⚠ sobreconsumo" : "disponible"} icon={Scale} emphasis={data.materiaPrima.saldoM3 < 0 ? "error" : "success"} />
          </div>

          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <div className="border-b-2 border-[var(--rule-base)] px-4 py-3"><h3 className="text-sm font-bold text-[var(--text-primary)]">Stock de productos transformados</h3></div>
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
                    <Td className="text-right"><span className={`font-mono font-bold tabular-nums ${p.stock < 0 ? "text-[var(--data-danger-700)]" : "text-[var(--text-primary)]"}`}>{n2(p.stock)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.productos.length === 0 && <div className="p-10 text-center text-[var(--text-tertiary)]"><PackageCheck className="mx-auto mb-3 h-9 w-9 opacity-30" /><p className="text-sm">Sin productos transformados todavía.</p></div>}
          </div>
        </>
      )}
      {loading && !data && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando saldos…</p></div>}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
