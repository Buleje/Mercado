"use client";

/**
 * CacaoReconcileModal — reconcilia lotes de acopio registrados con nombre libre
 * pero SIN vínculo al padrón (productorId = null). Estos lotes no suman al
 * historial ni a los pagos del productor, así que la tab Productores los muestra
 * en cero. Acá se agrupan por nombre y se vinculan (o se crea el productor) para
 * que sus kg/pagos vuelvan a la ficha del productor. Brandon 2026-07-02.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Loader2, RefreshCw, UserPlus, Users, AlertTriangle, Check } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";

interface OrphanGroup {
  nombre: string;
  lotes: number;
  kg: number;
  pagado: number;
  lastFecha: string | null;
  suggestedProducerId: string | null;
  suggestedProducerNombre: string | null;
}
interface OrphanResp {
  groups: OrphanGroup[];
  totals: { names: number; lotes: number; kg: number; pagado: number; conSugerencia: number };
}
interface Producer { id: string; nombre: string; codigo: string | null }

const NEW = "__new__";
const n2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CacaoReconcileModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [groups, setGroups] = useState<OrphanGroup[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ro, rp] = await Promise.all([
        fetch("/api/admin/cacao?view=orphan-lotes", { credentials: "include" }),
        fetch("/api/admin/cacao?view=producers", { credentials: "include" }),
      ]);
      if (!ro.ok) throw new Error(`HTTP ${ro.status}`);
      const od: OrphanResp = await ro.json();
      const pd = rp.ok ? ((await rp.json()).producers ?? []) : [];
      setGroups(od.groups ?? []);
      setProducers(pd);
      // Preselecciona la sugerencia (match exacto por nombre) cuando exista.
      const init: Record<string, string> = {};
      for (const g of od.groups ?? []) init[g.nombre] = g.suggestedProducerId ?? NEW;
      setSel(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => ({
    lotes: groups.reduce((s, g) => s + g.lotes, 0),
    pagado: groups.reduce((s, g) => s + g.pagado, 0),
  }), [groups]);

  async function link(g: OrphanGroup) {
    const choice = sel[g.nombre] ?? NEW;
    setBusy(g.nombre);
    setError(null);
    try {
      let producerId = choice;
      // "Crear productor con este nombre" → alta rápida y luego vínculo.
      if (choice === NEW) {
        const rc = await fetch("/api/admin/cacao?type=producer", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ nombre: g.nombre }),
        });
        if (!rc.ok) throw new Error((await rc.json().catch(() => ({}))).message ?? `HTTP ${rc.status}`);
        producerId = (await rc.json()).producer.id;
      }
      const r = await fetch("/api/admin/cacao", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "link_lotes", productorNombre: g.nombre, producerId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setGroups((gs) => gs.filter((x) => x.nombre !== g.nombre));
      setDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function close() {
    if (dirty) onDone();
    onClose();
  }

  return (
    <AdminModal open onClose={close} variant="wide" icon={Link2} title="Vincular lotes al padrón" description="Lotes registrados con un nombre libre que aún no suman al historial de ningún productor.">
      <div className="space-y-4 p-5">
        {!loading && groups.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)]">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span><strong>{totals.lotes}</strong> lote{totals.lotes === 1 ? "" : "s"} · <strong>S/ {n2(totals.pagado)}</strong> sin vincular. Elegí el productor del padrón (o creá uno) y vinculá.</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>
        )}

        {loading ? (
          <div className="p-10 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>
        ) : groups.length === 0 ? (
          <div className="p-10 text-center text-[var(--text-tertiary)]">
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--data-success-50)] text-[var(--data-success-700)]"><Check className="h-7 w-7" /></span>
            <p className="text-base font-bold text-[var(--text-primary)]">Todo vinculado</p>
            <p className="mx-auto mt-1 max-w-sm text-sm">No quedan lotes de acopio sin productor. Cada compra suma al historial del padrón.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.nombre} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[150px] flex-1">
                    <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]"><Users className="h-4 w-4 text-[var(--text-tertiary)]" />{g.nombre}</div>
                    <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">{g.lotes} lote{g.lotes === 1 ? "" : "s"} · {n2(g.kg)} kg · <span className="font-mono">S/ {n2(g.pagado)}</span></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={sel[g.nombre] ?? NEW}
                      onChange={(e) => setSel((s) => ({ ...s, [g.nombre]: e.target.value }))}
                      className="h-11 max-w-[200px] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    >
                      <option value={NEW}>+ Crear «{g.nombre}»</option>
                      {producers.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` · ${p.codigo}` : ""}{p.id === g.suggestedProducerId ? " (coincide)" : ""}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy === g.nombre}
                      onClick={() => link(g)}
                      className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === g.nombre ? <Loader2 className="h-4 w-4 animate-spin" /> : (sel[g.nombre] === NEW || !sel[g.nombre]) ? <UserPlus className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                      Vincular
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminModal>
  );
}
