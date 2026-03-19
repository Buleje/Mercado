"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  Trash2, Plus, ChevronDown, ChevronUp, X,
  DollarSign, CreditCard, Check,
} from "lucide-react";
import type { DbPayable, DbSupplier, PaymentMethod } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";

const PAY_STATUS_LABELS = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado" } as const;
const PAY_STATUS_COLORS = {
  pendiente: "bg-amber-100 text-amber-700",
  parcial: "bg-blue-100 text-blue-700",
  pagado: "bg-emerald-100 text-emerald-700",
} as const;
const METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo", yape: "Yape", plin: "Plin", transferencia: "Transferencia",
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const addPayable = async (e: FormEvent) => {
    e.preventDefault();
    if (!addForm.supplierId || !addForm.amount) return;
    const sup = suppliers.find(s => s.id === addForm.supplierId);
    setSaving(true);
    await fetch("/api/payables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: addForm.supplierId,
        supplierName: sup?.name || "",
        description: addForm.description,
        amount: Number(addForm.amount),
        dueDate: addForm.dueDate ? new Date(addForm.dueDate).toISOString() : new Date().toISOString(),
      }),
    });
    setSaving(false);
    setShowAdd(false);
    setAddForm({ supplierId: "", description: "", amount: "", dueDate: "" });
    load();
  };

  const registerPayment = async (e: FormEvent, payableId: string) => {
    e.preventDefault();
    if (!payForm.amount || Number(payForm.amount) <= 0) return;
    setSaving(true);
    await fetch(`/api/payables/${payableId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(payForm.amount),
        method: payForm.method,
        reference: payForm.reference || undefined,
      }),
    });
    setSaving(false);
    setShowPayment(null);
    setPayForm({ amount: "", method: "efectivo", reference: "" });
    load();
  };

  const deletePayable = async (id: string) => {
    if (!confirm("¿Eliminar esta cuenta por pagar?")) return;
    await fetch(`/api/payables/${id}`, { method: "DELETE" });
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Cuentas por Pagar</h2>
          <p className="text-sm text-gray-500 dark:text-muted">
            {filtered.length} cuentas · <span className="text-red-500 font-bold">S/{totalDebt.toFixed(2)}</span> por pagar · <span className="text-emerald-600 font-bold">S/{totalPaid.toFixed(2)}</span> pagado
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary-dark px-4 py-2 rounded-lg transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Nueva cuenta
          </button>
        </div>
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
                  : "border-gray-200 dark:border-card-border bg-white dark:bg-card hover:border-gray-300"
              )}
            >
              <p className="font-bold text-gray-900 dark:text-foreground text-sm truncate">{s.name}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-red-500 font-bold">Debe: S/{s.pending.toFixed(2)}</span>
                <span className="text-xs text-emerald-600">Pagado: S/{s.totalPaid.toFixed(2)}</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{s.count} factura{s.count !== 1 ? "s" : ""}</p>
            </button>
          ))}
        </div>
      )}

      {/* Payables list */}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
          {filterSupplier ? "Este proveedor no tiene cuentas" : "No hay cuentas por pagar"}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const remaining = p.amount - p.paidAmount;
            const pct = p.amount > 0 ? (p.paidAmount / p.amount) * 100 : 0;
            return (
              <div key={p.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 dark:text-foreground">{p.supplierName}</span>
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", PAY_STATUS_COLORS[p.status])}>
                        {PAY_STATUS_LABELS[p.status]}
                      </span>
                    </div>
                    {p.description && <p className="text-sm text-gray-600 dark:text-muted mt-0.5">{p.description}</p>}
                    <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-muted mt-1">
                      <span>Total: <span className="font-bold text-gray-700 dark:text-foreground">S/{p.amount.toFixed(2)}</span></span>
                      <span>Pagado: <span className="font-bold text-emerald-600">S/{p.paidAmount.toFixed(2)}</span></span>
                      <span>Restante: <span className="font-bold text-red-500">S/{remaining.toFixed(2)}</span></span>
                      <span>Vence: {formatDate(p.dueDate)}</span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-gray-100 dark:bg-accent rounded-full h-1.5 mt-2">
                      <div
                        className={cn("h-1.5 rounded-full transition-all", pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-blue-500" : "bg-gray-200")}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {p.status !== "pagado" && (
                      <button
                        onClick={() => { setShowPayment(showPayment === p.id ? null : p.id); setPayForm({ amount: String(remaining.toFixed(2)), method: "efectivo", reference: "" }); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs font-bold transition-colors"
                      >
                        <DollarSign className="h-3.5 w-3.5" /> Pagar
                      </button>
                    )}
                    <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                      {expanded === p.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button onClick={() => deletePayable(p.id)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Payment form */}
                {showPayment === p.id && (
                  <form onSubmit={(e) => registerPayment(e, p.id)} className="border-t border-gray-100 dark:border-card-border px-4 py-3 bg-emerald-50 flex flex-wrap items-end gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Monto (S/)</label>
                      <input
                        required type="number" step="0.01" min="0.01" max={remaining}
                        value={payForm.amount}
                        onChange={(e) => setPayForm(f => ({ ...f, amount: e.target.value }))}
                        className="w-28 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Método</label>
                      <select
                        value={payForm.method}
                        onChange={(e) => setPayForm(f => ({ ...f, method: e.target.value as PaymentMethod }))}
                        className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary"
                      >
                        {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map(m => (
                          <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Referencia</label>
                      <input
                        value={payForm.reference}
                        onChange={(e) => setPayForm(f => ({ ...f, reference: e.target.value }))}
                        placeholder="Nº operación…"
                        className="w-32 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1 disabled:opacity-60">
                      <Check className="h-3.5 w-3.5" /> Registrar pago
                    </button>
                    <button type="button" onClick={() => setShowPayment(null)} className="px-3 py-1.5 rounded-lg bg-white dark:bg-card text-gray-600 dark:text-muted text-xs font-semibold hover:bg-gray-50 dark:hover:bg-surface transition-colors border border-gray-200 dark:border-card-border">
                      Cancelar
                    </button>
                  </form>
                )}

                {/* Payment history */}
                {expanded === p.id && (
                  <div className="border-t border-gray-100 dark:border-card-border px-4 py-3 bg-gray-50 dark:bg-surface">
                    <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide mb-2">Historial de pagos</p>
                    {p.payments.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-muted">Sin pagos registrados</p>
                    ) : (
                      <div className="space-y-1.5">
                        {p.payments.map((pay) => (
                          <div key={pay.id} className="flex items-center justify-between text-sm bg-white dark:bg-card rounded-lg px-3 py-2">
                            <div>
                              <span className="font-semibold text-gray-900 dark:text-foreground">S/{pay.amount.toFixed(2)}</span>
                              <span className="text-gray-400 dark:text-muted ml-2">{METHOD_LABELS[pay.method]}</span>
                              {pay.reference && <span className="text-gray-400 dark:text-muted ml-2 text-xs">Ref: {pay.reference}</span>}
                            </div>
                            <span className="text-xs text-gray-400 dark:text-muted">{formatDate(pay.date)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 dark:text-muted mt-2">ID: {p.id}{p.purchaseOrderId ? ` · OC: ${p.purchaseOrderId}` : ""}</p>
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
        <div className="bg-white dark:bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-y-auto max-h-[90dvh]">
          <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white dark:bg-card z-10">
            <h3 className="font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Nueva cuenta por pagar</h3>
            <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"><X className="h-5 w-5 text-gray-500 dark:text-muted" /></button>
          </div>
          <form onSubmit={addPayable} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Proveedor *</label>
                <select required value={addForm.supplierId} onChange={(e) => setAddForm(f => ({ ...f, supplierId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm">
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Monto (S/) *</label>
                <input required type="number" step="0.01" min="0.01" value={addForm.amount} onChange={(e) => setAddForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Descripción</label>
                <input value={addForm.description} onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))} placeholder="Factura #001…" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Fecha de vencimiento</label>
                <input type="date" value={addForm.dueDate} onChange={(e) => setAddForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-card-border text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60">
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

