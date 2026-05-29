"use client";

/** CacaoProducerForm — alta de productor de cacao (master, ADR-128). */
import { useState } from "react";
import { Users, Loader2, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { CACAO_VARIEDADES, CACAO_CERTIFICACIONES } from "@/lib/cacao/cacao-quality";

const I = "w-full h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]";
const CERT_LABEL: Record<string, string> = { organico: "Orgánico", comercio_justo: "Comercio justo", convencional: "Convencional" };

export default function CacaoProducerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ nombre: "", dni: "", sector: "", parcelaHa: "", variedad: "", certificacion: "", altitudMsnm: "", telefono: "", observaciones: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const isValid = f.nombre.trim().length >= 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !isValid) { if (!isValid) setError("El nombre es obligatorio."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        nombre: f.nombre.trim(), dni: f.dni.trim() || null, sector: f.sector.trim() || null,
        parcelaHa: f.parcelaHa ? Number(f.parcelaHa) : null, variedad: f.variedad || null,
        certificacion: f.certificacion || null, altitudMsnm: f.altitudMsnm ? Number(f.altitudMsnm) : null,
        telefono: f.telefono.trim() || null, observaciones: f.observaciones.trim() || null,
      };
      const r = await fetch("/api/admin/cacao?type=producer", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="sm:max-w-[560px]">
      <div className="flex h-full max-h-[86vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Users className="h-5 w-5" strokeWidth={1.75} /></span>
            <div><CardTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">Nuevo productor</CardTitle><p className="text-xs text-[var(--text-tertiary)]">Cacao · registro de proveedor</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4" /></button>
        </header>
        <form id="cacao-producer-form" onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {error && <div className="rounded-xl border border-[var(--data-danger-200)] bg-[var(--data-danger-50)] px-4 py-3 text-sm text-[var(--data-danger-900)]">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" required><input value={f.nombre} onChange={set("nombre")} placeholder="Juan Pérez" className={I} /></Field>
            <Field label="DNI"><input value={f.dni} onChange={set("dni")} placeholder="12345678" className={I} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sector / caserío"><input value={f.sector} onChange={set("sector")} placeholder="ej: Aguaytía" className={I} /></Field>
            <Field label="Hectáreas de cacao"><input type="number" step="0.1" value={f.parcelaHa} onChange={set("parcelaHa")} placeholder="2.5" className={`${I} font-mono tabular-nums`} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Variedad predominante"><select value={f.variedad} onChange={set("variedad")} className={I}><option value="">—</option>{CACAO_VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
            <Field label="Certificación"><select value={f.certificacion} onChange={set("certificacion")} className={I}><option value="">—</option>{CACAO_CERTIFICACIONES.map((c) => <option key={c} value={c}>{CERT_LABEL[c]}</option>)}</select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Altitud (msnm)"><input type="number" value={f.altitudMsnm} onChange={set("altitudMsnm")} placeholder="600" className={`${I} font-mono tabular-nums`} /></Field>
            <Field label="Teléfono"><input value={f.telefono} onChange={set("telefono")} placeholder="9XXXXXXXX" className={I} /></Field>
          </div>
          <Field label="Observaciones"><textarea value={f.observaciones} onChange={set("observaciones")} rows={2} placeholder="Notas…" className={`${I} h-auto resize-none py-2.5`} /></Field>
        </form>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-3.5">
          <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button type="submit" form="cacao-producer-form" disabled={!isValid || submitting} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : "Registrar productor"}</button>
        </footer>
      </div>
    </AdminModal>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">{label}{required && <span className="text-[var(--data-danger-600)]">*</span>}</span>
      {children}
    </label>
  );
}
