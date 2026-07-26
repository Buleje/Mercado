"use client";

import { CardTitle, PageTitle, StatCard } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  Trash2, Plus, ChevronDown, ChevronUp, X,
  DollarSign, CreditCard, Check,
} from "@buleje/design-system/icons";
import type { DbPayable, DbSupplier, PaymentMethod } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import EmptyState from "@/components/admin/shared/EmptyState";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import AdminCard from "./shared/AdminCard";
import StatusBadge from "./shared/StatusBadge";
import { Field } from "@/components/admin/shared/Field";
const PAY_STATUS_LABELS = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado" } as const;
const PAY_STATUS_VARIANT: Record<"pendiente" | "parcial" | "pagado", "warning" | "info" | "success"> = {
  pendiente: "warning",
  parcial: "info",
  pagado: "success",
};
const METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo", yape: "Yape", plin: "Plin", transferencia: "Transferencia",
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

// Extrae un mensaje legible de una respuesta fallida (evita el fallo silencioso).
async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (typeof j?.error === "string") return j.error;
  } catch { /* sin cuerpo JSON */ }
  return `No se pudo completar la operación (${res.status}).`;
}

export default function PayablesTab() {
  const [payables, setPayables] = useState<DbPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<DbSupplier[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showPayment, setShowPayment] = useState<string | null>(null);
  const [filterSupplier, setFilterSupplier] = useState("");
  useScrollLock(showAdd);

  // Add form
  const [addForm, setAddForm] = useState({ supplierId: "", description: "", amount: "", dueDate: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment form
  const [payForm, setPayForm] = useState({ amount: "", method: "efectivo" as PaymentMethod, reference: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [payRes, supRes] = await Promise.all([
        fetch("/api/payables"),
        fetch("/api/suppliers"),
      ]);
      if (payRes.ok) setPayables(await payRes.json());
      if (supRes.ok) setSuppliers(await supRes.json());
    } catch {}
    setLoading(false);
  }, []);

   
  useEffect(() => { load(); }, [load]);

  const addPayable = async (e: FormEvent) => {
    e.preventDefault();
    if (!addForm.supplierId || !addForm.amount) return;
    const sup = suppliers.find(s => s.id === addForm.supplierId);
    setSaving(true);
    setError(null);
    const res = await fetch("/api/payables", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        supplierId: addForm.supplierId,
        supplierName: sup?.name || "",
        description: addForm.description,
        amount: Number(addForm.amount),
        dueDate: addForm.dueDate ? new Date(addForm.dueDate).toISOString() : new Date().toISOString(),
      }),
    });
    setSaving(false);
    if (!res.ok) { setError(await readError(res)); return; }
    setShowAdd(false);
    setAddForm({ supplierId: "", description: "", amount: "", dueDate: "" });
    load();
  };

  const registerPayment = async (e: FormEvent, payableId: string) => {
    e.preventDefault();
    if (!payForm.amount || Number(payForm.amount) <= 0) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/payables/${payableId}/payments`, {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        amount: Number(payForm.amount),
        method: payForm.method,
        reference: payForm.reference || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) { setError(await readError(res)); return; }
    setShowPayment(null);
    setPayForm({ amount: "", method: "efectivo", reference: "" });
    load();
  };

  const deletePayable = async (id: string) => {
    if (!confirm("¿Eliminar esta cuenta por pagar?")) return;
    setError(null);
    const res = await fetch(`/api/payables/${id}`, { method: "DELETE", headers: csrfHeaders() });
    if (!res.ok) { setError(await readError(res)); return; }
    load();
  };

  const filtered = filterSupplier
    ? payables.filter(p => p.supplierId === filterSupplier)
    : payables;

  const totalDebt = filtered.reduce((s, p) => s + (p.amount - p.paidAmount), 0);
  const totalPaid = filtered.reduce((s, p) => s + p.paidAmount, 0);

  // Summary by supplier
  const supplierSummary = suppliers.map(sup => {
    const debts = payables.filter(p => p.supplierId === sup.id);
    const total = debts.reduce((s, p) => s + p.amount, 0);
    const paid = debts.reduce((s, p) => s + p.paidAmount, 0);
    return { ...sup, totalDebt: total, totalPaid: paid, pending: total - paid, count: debts.length };
  }).filter(s => s.count > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold">Finanzas / Obligaciones</p>
          <PageTitle className="mt-1 text-fs-h1 font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <CreditCard className="h-5 w-5 currentColor" />
            Cuentas por Pagar
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{filtered.length} cuentas activas con proveedores</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark px-4 py-2 rounded-xl transition-colors">
          <Plus className="h-4 w-4" /> Nueva cuenta
        </button>
      </div>

      {/* Error banner — antes las mutaciones fallaban en silencio */}
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] dark:bg-red-950/20 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--data-error-500)]">{error}</p>
          <button onClick={() => setError(null)} className="shrink-0 text-[var(--data-error-500)] hover:opacity-70" aria-label="Cerrar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Por pagar" value={`S/ ${totalDebt.toFixed(2)}`} icon={DollarSign} emphasis={totalDebt > 0 ? "warning" : "neutral"} />
        <StatCard label="Pagado" value={`S/ ${totalPaid.toFixed(2)}`} icon={Check} emphasis="success" />
        <StatCard label="Cuentas activas" value={filtered.length} icon={CreditCard} />
      </div>

      {/* Supplier summary cards */}
      {supplierSummary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {supplierSummary.map(s => (
            <button
              key={s.id}
              onClick={() => setFilterSupplier(filterSupplier === s.id ? "" : s.id)}
              className={cn(
                "text-left p-3 rounded-xl border transition-all",
                filterSupplier === s.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-gray-300"
              )}
            >
              <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm truncate">{s.name}</p>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className="text-xs text-[var(--data-error-500)] font-bold">Debe: S/{Number(s.pending).toFixed(2)}</span>
                <span className="text-xs text-[var(--data-success-500)]">Pagado: S/{Number(s.totalPaid).toFixed(2)}</span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">{s.count} factura{s.count !== 1 ? "s" : ""}</p>
            </button>
          ))}
        </div>
      )}

      {/* Payables list */}
      {loading ? (
        <TableSkeleton rows={4} cols={4} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={filterSupplier ? "Sin cuentas para este proveedor" : "Sin cuentas por pagar"}
          description={filterSupplier ? "Este proveedor no tiene deudas registradas." : "No tienes deudas con proveedores. ¡Excelente!"}
          className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const remaining = p.amount - p.paidAmount;
            const pct = p.amount > 0 ? (p.paidAmount / p.amount) * 100 : 0;
            return (
              <div key={p.id} className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[var(--text-primary)]">{p.supplierName}</span>
                      <StatusBadge variant={PAY_STATUS_VARIANT[p.status]} label={PAY_STATUS_LABELS[p.status]} size="sm" dot />
                    </div>
                    {p.description && <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">{p.description}</p>}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-[var(--text-tertiary)] dark:text-muted mt-1">
                      <span>Total: <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{Number(p.amount).toFixed(2)}</span></span>
                      <span>Pagado: <span className="font-bold text-[var(--data-success-500)]">S/{Number(p.paidAmount).toFixed(2)}</span></span>
                      <span>Restante: <span className="font-bold text-[var(--data-error-500)]">S/{remaining.toFixed(2)}</span></span>
                      <span>Vence: {formatDate(p.dueDate)}</span>
                    </div>
                    {/* Progress bar — fill sólido y diferenciado: verde cuando
                        está 100% pagado, teal cuando es pago parcial. Antes usaba
                        --accent-soft (pálido) para ambos → invisible y sin distinción. */}
                    <div className="w-full bg-[var(--surface-sunken)] rounded-full h-1.5 mt-2">
                      <div
                        className={cn("h-1.5 rounded-full transition-all", pct >= 100 ? "bg-[var(--data-success-500)]" : "bg-primary")}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {p.status !== "pagado" && (
                      <button
                        onClick={() => { setShowPayment(showPayment === p.id ? null : p.id); setPayForm({ amount: String(remaining.toFixed(2)), method: "efectivo", reference: "" }); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 text-xs font-bold transition-colors"
                      >
                        <DollarSign className="h-3.5 w-3.5" /> Pagar
                      </button>
                    )}
                    <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                      {expanded === p.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button onClick={() => deletePayable(p.id)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors" title="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Payment form */}
                {showPayment === p.id && (
                  <form onSubmit={(e) => registerPayment(e, p.id)} className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-2 sm:px-4 py-2 sm:py-3 bg-primary/10 flex flex-wrap items-end gap-3">
                    <Field label="Monto (S/)" labelClassName="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">
                      <input
                        required type="number" step="0.01" min="0.01" max={remaining}
                        value={payForm.amount}
                        onChange={(e) => setPayForm(f => ({ ...f, amount: e.target.value }))}
                        className="w-28 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                      />
                    </Field>
                    <Field label="Método" labelClassName="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">
                      <select
                        value={payForm.method}
                        onChange={(e) => setPayForm(f => ({ ...f, method: e.target.value as PaymentMethod }))}
                        className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                      >
                        {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map(m => (
                          <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Referencia" labelClassName="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">
                      <input
                        value={payForm.reference}
                        onChange={(e) => setPayForm(f => ({ ...f, reference: e.target.value }))}
                        placeholder="Nº operación…"
                        className="w-32 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                      />
                    </Field>
                    <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-1 disabled:opacity-60">
                      <Check className="h-3.5 w-3.5" /> Registrar pago
                    </button>
                    <button type="button" onClick={() => setShowPayment(null)} className="px-3 py-1.5 rounded-lg bg-[var(--surface-raised)] text-[var(--text-secondary)] dark:text-muted text-xs font-semibold hover:bg-gray-50 dark:hover:bg-surface transition-colors border border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                      Cancelar
                    </button>
                  </form>
                )}

                {/* Payment history */}
                {expanded === p.id && (
                  <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-2 sm:px-4 py-2 sm:py-3 bg-gray-50 dark:bg-surface">
                    <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Historial de pagos</p>
                    {p.payments.length === 0 ? (
                      <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">Sin pagos registrados</p>
                    ) : (
                      <div className="space-y-1.5">
                        {p.payments.map((pay) => (
                          <div key={pay.id} className="flex items-center justify-between text-sm bg-[var(--surface-raised)] rounded-lg px-3 py-2">
                            <div>
                              <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{Number(pay.amount).toFixed(2)}</span>
                              <span className="text-[var(--text-tertiary)] dark:text-muted ml-2">{METHOD_LABELS[pay.method]}</span>
                              {pay.reference && <span className="text-[var(--text-tertiary)] dark:text-muted ml-2 text-xs">Ref: {pay.reference}</span>}
                            </div>
                            <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">{formatDate(pay.date)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-2">ID: {p.id}{p.purchaseOrderId ? ` · OC: ${p.purchaseOrderId}` : ""}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* ── Add payable modal ── */}
      {showAdd && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
        <div className="bg-[var(--surface-raised)] w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl overflow-y-auto max-h-[90dvh]">
          <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-[var(--surface-raised)] z-10">
            <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Nueva cuenta por pagar</CardTitle>
            <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"><X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" /></button>
          </div>
          <form onSubmit={addPayable} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
              <Field label="Proveedor *" labelClassName="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">
                <select required value={addForm.supplierId} onChange={(e) => setAddForm(f => ({ ...f, supplierId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none text-sm">
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Monto (S/) *" labelClassName="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">
                <input required type="number" step="0.01" min="0.01" value={addForm.amount} onChange={(e) => setAddForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none text-sm" />
              </Field>
              <Field label="Descripción" labelClassName="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">
                <input value={addForm.description} onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))} placeholder="Factura #001…" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none text-sm" />
              </Field>
              <Field label="Fecha de vencimiento" labelClassName="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">
                <input type="date" value={addForm.dueDate} onChange={(e) => setAddForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none text-sm" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60">
                {saving ? "Guardando…" : "Crear cuenta"}
              </button>
            </div>
          </form>
        </div>
      </div>
      )}
    </div>
  );
}

