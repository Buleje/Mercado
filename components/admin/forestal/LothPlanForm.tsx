"use client";

/** El alta de un plan de manejo: el permiso aprobado del que cuelga todo. */

import { useState } from "react";
import { Loader2, Plus } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field, cls } from "./loth-plan-ui";

export default function LothPlanForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    planType: "PO", planNumber: "", tituloHabilitante: "", resolucionNumber: "", resolucionDate: "",
    titularName: "", arffs: "", region: "Ucayali", parcelaCorta: "", areaHa: "", uitRef: "5350",
    vigenciaDesde: "", vigenciaHasta: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || f.titularName.trim().length < 2) return;
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f)) body[k] = v === "" ? null : v;
      body.titularName = f.titularName.trim();
      const r = await fetch("/api/admin/forestal/plan", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include", body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      {err && <div className="rounded-lg border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">{err}</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Tipo"><select value={f.planType} onChange={(e) => set("planType", e.target.value)} className={cls}><option>PO</option><option>PMFI</option><option>DEMA</option></select></Field>
        <Field label="N° de plan"><input value={f.planNumber} onChange={(e) => set("planNumber", e.target.value)} placeholder="PO 12" className={cls} /></Field>
        <Field label="Título habilitante"><input value={f.tituloHabilitante} onChange={(e) => set("tituloHabilitante", e.target.value)} placeholder="17-CPO/C-J-001-02" className={cls} /></Field>
        <Field label="N° resolución"><input value={f.resolucionNumber} onChange={(e) => set("resolucionNumber", e.target.value)} placeholder="RDF N° 001-2026..." className={cls} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Titular *"><input value={f.titularName} onChange={(e) => set("titularName", e.target.value)} placeholder="Maderera ... SAC" required className={cls} /></Field>
        <Field label="ARFFS"><input value={f.arffs} onChange={(e) => set("arffs", e.target.value)} placeholder="GERFOR Ucayali" className={cls} /></Field>
        <Field label="Región"><input value={f.region} onChange={(e) => set("region", e.target.value)} onFocus={(e) => e.target.select()} className={cls} /></Field>
        <Field label="Parcela de corta"><input value={f.parcelaCorta} onChange={(e) => set("parcelaCorta", e.target.value)} placeholder="PC 12" className={cls} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Fecha resolución"><input type="date" value={f.resolucionDate} onChange={(e) => set("resolucionDate", e.target.value)} className={cls} /></Field>
        <Field label="Área (ha)"><input type="number" step="0.01" value={f.areaHa} onChange={(e) => set("areaHa", e.target.value)} className={cls} /></Field>
        <Field label="Vigencia desde"><input type="date" value={f.vigenciaDesde} onChange={(e) => set("vigenciaDesde", e.target.value)} className={cls} /></Field>
        <Field label="Vigencia hasta"><input type="date" value={f.vigenciaHasta} onChange={(e) => set("vigenciaHasta", e.target.value)} className={cls} /></Field>
      </div>
      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
        <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button type="submit" disabled={busy || f.titularName.trim().length < 2} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-success-700)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear plan
        </button>
      </div>
    </form>
  );
}
