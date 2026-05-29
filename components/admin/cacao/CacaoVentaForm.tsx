"use client";

/**
 * CacaoVentaForm — registrar venta de cacao seco (ADR-128 v3).
 * Soporta venta local (PEN) y exportación FOB (USD + tipo de cambio). Total en
 * soles calculado en vivo. Muestra stock disponible y avisa si se excede.
 */
import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, X, Check, Globe, Warehouse, AlertCircle } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { CACAO_VENTA_CANALES, CACAO_VARIEDADES, cacaoVentaTotalPen } from "@/lib/cacao/cacao-quality";

interface Props { onClose: () => void; onSaved: () => void }
const I = "w-full h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]";
const CANAL_LABEL: Record<string, string> = { cooperativa: "Cooperativa", exportador: "Exportador", mercado_local: "Mercado local", otro: "Otro" };

export default function CacaoVentaForm({ onClose, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [comprador, setComprador] = useState("");
  const [canal, setCanal] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [moneda, setMoneda] = useState<"PEN" | "USD">("PEN");
  const [precioPorKg, setPrecio] = useState("");
  const [tipoCambio, setFx] = useState("");
  const [esFob, setEsFob] = useState(false);
  const [variedad, setVariedad] = useState("");
  const [grado, setGrado] = useState("");
  const [obs, setObs] = useState("");
  const [disponible, setDisponible] = useState<number | null>(null);

  const loadInv = useCallback(async () => {
    try { const r = await fetch("/api/admin/cacao?view=inventory", { credentials: "include" }); if (r.ok) setDisponible((await r.json()).inventory?.kgSecoDisponible ?? null); } catch {}
  }, []);
  useEffect(() => { loadInv(); }, [loadInv]);

  const total = cacaoVentaTotalPen(pesoKg ? Number(pesoKg) : 0, precioPorKg ? Number(precioPorKg) : 0, moneda, tipoCambio ? Number(tipoCambio) : null);
  const excede = disponible != null && Number(pesoKg) > disponible;
  const needsFx = moneda === "USD";
  const isValid = Number(pesoKg) > 0 && (!needsFx || Number(tipoCambio) > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !isValid) { if (!isValid) setError(needsFx && !(Number(tipoCambio) > 0) ? "Ingresá el tipo de cambio (USD→PEN)." : "Ingresá el peso vendido."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        fecha: new Date(fecha).toISOString(), compradorNombre: comprador.trim() || null, canal: canal || null,
        pesoKg: Number(pesoKg), moneda, precioPorKg: precioPorKg ? Number(precioPorKg) : null,
        tipoCambio: needsFx && tipoCambio ? Number(tipoCambio) : null, esFob, variedad: variedad || null,
        grado: grado || null, observaciones: obs.trim() || null,
      };
      const r = await fetch("/api/admin/cacao?type=venta", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="!max-w-[900px]">
      <div className="flex h-full max-h-[90vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Coins className="h-5 w-5" strokeWidth={1.75} /></span>
            <div><CardTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">Registrar venta</CardTitle><p className="text-xs text-[var(--text-tertiary)]">Cacao seco · local (S/) o exportación FOB (US$)</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
            <form id="cacao-venta-form" onSubmit={submit} className="space-y-4 px-5 py-5">
              {error && <div className="rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">{error}</div>}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha" required><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={I} /></Field>
                <Field label="Comprador"><input value={comprador} onChange={(e) => setComprador(e.target.value)} placeholder="Nombre / empresa" className={I} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Canal"><select value={canal} onChange={(e) => setCanal(e.target.value)} className={I}><option value="">—</option>{CACAO_VENTA_CANALES.map((c) => <option key={c} value={c}>{CANAL_LABEL[c]}</option>)}</select></Field>
                <Field label="Peso vendido (kg)" required hint={disponible != null ? `disponible: ${disponible.toFixed(2)} kg` : undefined}><input type="number" step="0.01" value={pesoKg} onChange={(e) => setPesoKg(e.target.value)} placeholder="100" className={`${I} font-mono tabular-nums ${excede ? "border-[var(--data-warning-400)]" : ""}`} /></Field>
              </div>

              <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]/50 p-3">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Precio</span>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Field label="Moneda">
                    <div className="flex h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-1">
                      {(["PEN", "USD"] as const).map((m) => <button key={m} type="button" onClick={() => setMoneda(m)} className={`flex-1 rounded-md text-sm font-bold transition ${moneda === m ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm" : "text-[var(--text-tertiary)]"}`}>{m === "PEN" ? "Soles" : "Dólares"}</button>)}
                    </div>
                  </Field>
                  <Field label={`Precio ${moneda === "USD" ? "US$" : "S/"}/kg`}><input type="number" step="0.01" value={precioPorKg} onChange={(e) => setPrecio(e.target.value)} placeholder={moneda === "USD" ? "3.50" : "13.00"} className={`${I} font-mono tabular-nums`} /></Field>
                  {needsFx && <Field label="Tipo de cambio (US$→S/)" required><input type="number" step="0.0001" value={tipoCambio} onChange={(e) => setFx(e.target.value)} placeholder="3.75" className={`${I} font-mono tabular-nums`} /></Field>}
                </div>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={esFob} onChange={(e) => setEsFob(e.target.checked)} className="h-4 w-4 rounded border-[var(--rule-base)] accent-[var(--accent)]" />
                  <span className="flex items-center gap-1 font-medium text-[var(--text-primary)]"><Globe className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /> Es exportación FOB</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Variedad"><select value={variedad} onChange={(e) => setVariedad(e.target.value)} className={I}><option value="">—</option>{CACAO_VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
                <Field label="Grado"><select value={grado} onChange={(e) => setGrado(e.target.value)} className={I}><option value="">—</option><option value="I">Grado I</option><option value="II">Grado II</option></select></Field>
              </div>
              <Field label="Observaciones"><textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Notas de la venta…" className={`${I} h-auto resize-none py-2.5`} /></Field>
            </form>

            {/* Ficha viva */}
            <aside className="border-t-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 px-5 py-5 lg:sticky lg:top-0 lg:self-start lg:border-l-2 lg:border-t-0">
              <p className="mb-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Resumen de la venta</p>
              <div className="rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-4">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-700)]">Total (soles)</p>
                <p className="mt-1 font-mono text-3xl font-extrabold tabular-nums text-[var(--data-success-700)]">S/ {total ? total.toFixed(2) : "0.00"}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{pesoKg ? Number(pesoKg).toFixed(2) : "—"} kg × {moneda === "USD" ? "US$" : "S/"} {precioPorKg ? Number(precioPorKg).toFixed(2) : "0.00"}{needsFx && tipoCambio ? ` × ${Number(tipoCambio).toFixed(2)}` : ""}</p>
              </div>
              {esFob && <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><Globe className="h-3.5 w-3.5 text-[var(--accent)]" /> Exportación FOB</p>}
              {disponible != null && (
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Warehouse className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <span className="text-[var(--text-secondary)]">Stock disponible: <b className="text-[var(--text-primary)]">{disponible.toFixed(2)} kg</b></span>
                </div>
              )}
              {excede && <div className="mt-2 flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-300)] bg-[var(--data-warning-50)] p-2.5 text-xs text-[var(--data-warning-900)]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Estás vendiendo más que tu stock disponible. Revisá el peso o registrá más acopio/beneficio.</div>}
              <p className="mt-3 text-xs text-[var(--text-tertiary)]">Al registrar, se descuenta del inventario de cacao seco disponible.</p>
            </aside>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-3.5">
          <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button type="submit" form="cacao-venta-form" disabled={!isValid || submitting} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : "Registrar venta"}</button>
        </footer>
      </div>
    </AdminModal>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">{label}{required && <span className="text-[var(--data-error-600)]">*</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}
