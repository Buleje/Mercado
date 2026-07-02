"use client";

/**
 * CacaoParcelaDrawer — ficha de una sección del campo: registra labores (poda,
 * fertilización, cosecha…), marca hechas/pendientes, y muestra el historial.
 * El estado de la sección (al día / pendiente / vencido) se deriva de sus
 * labores. Drawer lateral. Brandon 2026-07-02.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Plus, Check, RotateCcw, Trash2, Loader2, Calendar } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CACAO_LABORES, LABOR_LABEL, PARCELA_STATUS, type CacaoLaborTipo, type CacaoParcelaStatus } from "@/lib/cacao/cacao-labores";

interface Parcela { id: string; codigo: string; nombre: string | null; areaHa: number | null; variedad: string | null; anioSiembra: number | null; nPlantas: number | null; status: string; observaciones: string | null }
interface Labor { id: string; tipo: CacaoLaborTipo; estado: string; fechaPlan: string | null; fechaHecho: string | null; responsable: string | null; detalle: string | null; cantidad: number | null; unidad: string | null; createdAt: string }

const fdate = (iso: string | null) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }); } catch { return iso; } };
const ICON = Object.fromEntries(CACAO_LABORES.map((l) => [l.tipo, l.icon])) as Record<CacaoLaborTipo, (typeof CACAO_LABORES)[number]["icon"]>;

function statusOf(labores: Labor[]): CacaoParcelaStatus {
  const now = Date.now();
  let hechos = 0, pend = 0, venc = 0;
  for (const l of labores) {
    if (l.estado === "hecho") hechos++;
    else if (l.fechaPlan && new Date(l.fechaPlan).getTime() < now) venc++;
    else pend++;
  }
  return venc > 0 ? "vencido" : pend > 0 ? "pendiente" : hechos > 0 ? "al_dia" : "sin_labores";
}

export default function CacaoParcelaDrawer({ parcelaId, onClose, onChanged }: { parcelaId: string; onClose: () => void; onChanged: () => void }) {
  const [parcela, setParcela] = useState<Parcela | null>(null);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/cacao/campo?view=parcela-detail&id=${encodeURIComponent(parcelaId)}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setParcela(d.parcela); setLabores(d.labores ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [parcelaId]);
  useEffect(() => { load(); }, [load]);

  const status = useMemo(() => statusOf(labores), [labores]);
  const ultimoPorTipo = useMemo(() => {
    const m = new Map<CacaoLaborTipo, string>();
    for (const l of labores) if (l.estado === "hecho" && l.fechaHecho) { const cur = m.get(l.tipo); if (!cur || l.fechaHecho > cur) m.set(l.tipo, l.fechaHecho); }
    return m;
  }, [labores]);

  async function mutate(fn: () => Promise<Response>, key: string) {
    setBusy(key); setError(null);
    try {
      const r = await fn();
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setDirty(true);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const setEstado = (l: Labor, estado: "hecho" | "pendiente") => mutate(
    () => fetch("/api/admin/cacao/campo", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ action: "set_labor", id: l.id, estado }) }),
    `estado-${l.id}`,
  );
  const del = (l: Labor) => mutate(
    () => fetch(`/api/admin/cacao/campo?type=labor&id=${encodeURIComponent(l.id)}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" }),
    `del-${l.id}`,
  );

  function close() { if (dirty) onChanged(); onClose(); }
  const m = PARCELA_STATUS[status];

  return (
    <AdminModal open onClose={close} variant="side" title={parcela ? `Sección ${parcela.codigo}` : "Sección"} description={parcela?.nombre ?? undefined}>
      <div className="space-y-4">
        {parcela && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold" style={{ background: m.bg, color: m.fg }}><m.icon className="h-3 w-3" />{m.label}</span>
            {parcela.areaHa != null && <span>{parcela.areaHa.toLocaleString("es-PE", { maximumFractionDigits: 1 })} ha</span>}
            {parcela.variedad && <span>· {parcela.variedad}</span>}
            {parcela.anioSiembra && <span>· siembra {parcela.anioSiembra}</span>}
            {parcela.nPlantas && <span>· {parcela.nPlantas} plantas</span>}
          </div>
        )}

        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}

        {/* Resumen por labor: último hecho */}
        <div className="grid grid-cols-2 gap-2">
          {CACAO_LABORES.map((l) => {
            const ult = ultimoPorTipo.get(l.tipo);
            return (
              <div key={l.tipo} className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
                <l.icon className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[var(--text-primary)]">{l.label}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{ult ? `último ${fdate(ult)}` : "sin registro"}</p>
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={() => setShowForm((v) => !v)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-4 w-4" />Registrar labor</button>
        {showForm && <RegistrarLaborForm parcelaId={parcelaId} onDone={() => { setShowForm(false); setDirty(true); load(); }} />}

        {/* Historial */}
        <div>
          <p className="mb-2 text-sm font-bold text-[var(--text-primary)]">Historial ({labores.length})</p>
          {loading && labores.length === 0 ? (
            <div className="p-6 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : labores.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">Aún no registraste labores en esta sección.</p>
          ) : (
            <ul className="space-y-2">
              {labores.map((l) => {
                const Icon = ICON[l.tipo];
                const vencido = l.estado !== "hecho" && l.fechaPlan && new Date(l.fechaPlan).getTime() < Date.now();
                return (
                  <li key={l.id} className="flex items-start gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[var(--text-primary)]">{LABOR_LABEL[l.tipo]}</span>
                        {l.estado === "hecho"
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-50)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)]"><Check className="h-3 w-3" />Hecho {fdate(l.fechaHecho)}</span>
                          : <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${vencido ? "bg-[var(--data-error-50)] text-[var(--data-error-700)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]"}`}><Calendar className="h-3 w-3" />{vencido ? "Vencida" : "Programada"} {fdate(l.fechaPlan)}</span>}
                      </div>
                      {(l.detalle || l.responsable || l.cantidad != null) && (
                        <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{[l.detalle, l.responsable && `por ${l.responsable}`, l.cantidad != null && `${l.cantidad}${l.unidad ? ` ${l.unidad}` : ""}`].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {l.estado === "hecho"
                        ? <button type="button" disabled={busy === `estado-${l.id}`} onClick={() => setEstado(l, "pendiente")} title="Reabrir" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50">{busy === `estado-${l.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}</button>
                        : <button type="button" disabled={busy === `estado-${l.id}`} onClick={() => setEstado(l, "hecho")} title="Marcar hecha" className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--data-success-500)] text-white hover:opacity-90 disabled:opacity-50">{busy === `estado-${l.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>}
                      <button type="button" disabled={busy === `del-${l.id}`} onClick={() => del(l)} title="Eliminar" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--data-error-600)] hover:bg-[var(--data-error-50)] disabled:opacity-50">{busy === `del-${l.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AdminModal>
  );
}

function RegistrarLaborForm({ parcelaId, onDone }: { parcelaId: string; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ tipo: "poda" as CacaoLaborTipo, estado: "hecho", fecha: today, responsable: "", detalle: "", cantidad: "", unidad: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true); setError(null);
    try {
      const hecho = f.estado === "hecho";
      const payload = {
        parcelaId, tipo: f.tipo, estado: f.estado,
        fechaHecho: hecho ? f.fecha : null, fechaPlan: hecho ? null : f.fecha,
        responsable: f.responsable.trim() || null, detalle: f.detalle.trim() || null,
        cantidad: f.cantidad ? Number(f.cantidad) : null, unidad: f.unidad.trim() || null,
      };
      const r = await fetch("/api/admin/cacao/campo?type=labor", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const I = "h-11 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border-2 border-[var(--accent-soft)] bg-[var(--surface-sunken)] p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-[var(--text-secondary)]">Labor<select value={f.tipo} onChange={set("tipo")} className={`mt-1 ${I}`}>{CACAO_LABORES.map((l) => <option key={l.tipo} value={l.tipo}>{l.label}</option>)}</select></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Estado<select value={f.estado} onChange={set("estado")} className={`mt-1 ${I}`}><option value="hecho">Ya la hice</option><option value="pendiente">Programada</option></select></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Fecha<input type="date" value={f.fecha} onChange={set("fecha")} className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Responsable<input value={f.responsable} onChange={set("responsable")} placeholder="opcional" className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Cantidad<input type="number" step="0.01" min="0" value={f.cantidad} onChange={set("cantidad")} placeholder="ej. 200" className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Unidad<input value={f.unidad} onChange={set("unidad")} placeholder="kg / L / jornal" className={`mt-1 ${I}`} /></label>
      </div>
      <label className="block text-xs font-bold text-[var(--text-secondary)]">Detalle<input value={f.detalle} onChange={set("detalle")} placeholder="opcional" className={`mt-1 ${I}`} /></label>
      {error && <div className="rounded-lg border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-2 text-xs text-[var(--data-error-700)]">{error}</div>}
      <button type="submit" disabled={submitting} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Guardar labor</button>
    </form>
  );
}
