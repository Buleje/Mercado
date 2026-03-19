﻿"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { Trash2, Pencil, Check, X, Plus, Phone, Mail, MapPin, AlertTriangle, Clock, DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import type { DbSupplier } from "@/lib/jsondb";
import { useScrollLock } from "@/hooks/use-scroll-lock";

type Payable = {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  dueDate?: string;
  status: string;
  description: string;
  createdAt: string;
};

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<DbSupplier[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DbSupplier>>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", ruc: "", phone: "", email: "", address: "", notes: "" });
  useScrollLock(showAdd);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [suppliersRes, payablesRes] = await Promise.all([
        fetch("/api/suppliers"),
        fetch("/api/payables")
      ]);
      if (suppliersRes.ok) setSuppliers(await suppliersRes.json());
      if (payablesRes.ok) setPayables(await payablesRes.json());
    } catch {}
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const startEdit = (s: DbSupplier) => {
    setEditingId(s.id);
    setEditForm({ name: s.name, ruc: s.ruc, phone: s.phone, email: s.email, address: s.address, notes: s.notes });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    await fetch(`/api/suppliers/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setSaving(false);
    setEditingId(null);
    load();
  };

  const deleteSupplier = async (id: string) => {
    if (!confirm("¿Eliminar este proveedor permanentemente?")) return;
    await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    load();
  };

  const addSupplier = async (e: FormEvent) => {
    e.preventDefault();
    if (!addForm.name) return;
    setSaving(true);
    await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    setSaving(false);
    setShowAdd(false);
    setAddForm({ name: "", ruc: "", phone: "", email: "", address: "", notes: "" });
    load();
  };

  // Payment alerts calculations
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const pendingPayables = payables.filter(p => p.status !== "pagado");
  
  const overduePayables = pendingPayables.filter(p => {
    if (!p.dueDate) return false;
    const due = new Date(p.dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today;
  });
  
  const approachingPayables = pendingPayables.filter(p => {
    if (!p.dueDate) return false;
    const due = new Date(p.dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  });
  
  const getSupplierDebt = (supplierId: string) => {
    const supplierPayables = payables.filter(
      p => p.supplierId === supplierId && p.status !== "pagado"
    );
    const totalDebt = supplierPayables.reduce(
      (sum, p) => sum + (p.amount - p.paidAmount),
      0
    );
    const overdue = supplierPayables.some(p => {
      if (!p.dueDate) return false;
      const due = new Date(p.dueDate);
      due.setHours(0, 0, 0, 0);
      return due < today;
    });
    const approaching = !overdue && supplierPayables.some(p => {
      if (!p.dueDate) return false;
      const due = new Date(p.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    });
    return { totalDebt, count: supplierPayables.length, overdue, approaching };
  };
  
  const totalOverdueAmount = overduePayables.reduce(
    (sum, p) => sum + (p.amount - p.paidAmount),
    0
  );
  
  const totalApproachingAmount = approachingPayables.reduce(
    (sum, p) => sum + (p.amount - p.paidAmount),
    0
  );
  
  const getDaysInfo = (dueDate: string) => {
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { text: `${Math.abs(diffDays)} días vencido`, overdue: true };
    if (diffDays === 0) return { text: "Vence hoy", overdue: true };
    return { text: `Vence en ${diffDays} días`, overdue: false };
  };

  const getMonthlyHistory = (supplierId: string) => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const total = payables
        .filter((p) => {
          const created = new Date(p.createdAt);
          return (
            p.supplierId === supplierId &&
            created.getMonth() === d.getMonth() &&
            created.getFullYear() === d.getFullYear()
          );
        })
        .reduce((s, p) => s + p.amount, 0);
      return { label: d.toLocaleDateString("es-PE", { month: "short" }), total };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Proveedores</h2>
          <p className="text-sm text-gray-500 dark:text-muted">{suppliers.length} registrados</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary-dark px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" /> Nuevo proveedor
          </button>
        </div>
      </div>

      {/* Payment Alerts Banner */}
      {(overduePayables.length > 0 || approachingPayables.length > 0) && (
        <div className="bg-linear-to-r from-red-50 to-amber-50 dark:from-red-950/20 dark:to-amber-950/20 border-l-4 border-red-500 dark:border-red-600 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500" />
                <h3 className="font-bold text-gray-900 dark:text-foreground">Alertas de Pagos</h3>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {overduePayables.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      {overduePayables.length} vencido{overduePayables.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-600 dark:text-muted">
                      S/ {totalOverdueAmount.toFixed(2)}
                    </span>
                  </div>
                )}
                {approachingPayables.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                      <Clock className="h-4 w-4" />
                      {approachingPayables.length} próximo{approachingPayables.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-600 dark:text-muted">
                      S/ {totalApproachingAmount.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowAlerts(!showAlerts)}
              className="flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-card/50"
            >
              Ver alertas
              {showAlerts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
          
          {/* Expandable Alerts Detail */}
          {showAlerts && (
            <div className="mt-4 pt-4 border-t border-red-200 dark:border-red-900/30 space-y-2">
              {[...overduePayables, ...approachingPayables].map(p => {
                const daysInfo = p.dueDate ? getDaysInfo(p.dueDate) : null;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-lg ${
                      daysInfo?.overdue
                        ? 'bg-red-100 dark:bg-red-950/30 border border-red-200 dark:border-red-900'
                        : 'bg-amber-100 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 dark:text-foreground">
                          {p.supplierName}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-muted truncate">
                          {p.description}
                        </span>
                      </div>
                      {daysInfo && (
                        <p className={`text-xs font-medium mt-0.5 ${
                          daysInfo.overdue ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                        }`}>
                          {daysInfo.text}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-gray-900 dark:text-foreground">
                        S/ {(p.amount - p.paidAmount).toFixed(2)}
                      </div>
                      {p.dueDate && (
                        <div className="text-xs text-gray-500 dark:text-muted">
                          {new Date(p.dueDate).toLocaleDateString('es-PE')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Suppliers list */}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">Cargando…</div>
      ) : suppliers.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">No hay proveedores registrados</div>
      ) : (
        <div className="space-y-3">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 shadow-sm">
              {editingId === s.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={editForm.name ?? ""} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                    <input value={editForm.ruc ?? ""} onChange={(e) => setEditForm(f => ({ ...f, ruc: e.target.value }))} placeholder="RUC" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm font-mono" />
                    <input value={editForm.phone ?? ""} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="Teléfono" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                    <input value={editForm.email ?? ""} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                    <input value={editForm.address ?? ""} onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="Dirección" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm sm:col-span-2" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-sm font-bold transition-colors">
                      <Check className="h-4 w-4 inline mr-1" /> Guardar
                    </button>
                    <button onClick={cancelEdit} className="px-4 py-2 rounded-lg bg-gray-50 dark:bg-surface text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent text-sm font-semibold transition-colors">
                      <X className="h-4 w-4 inline mr-1" /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 dark:text-foreground">{s.name}</span>
                      {s.ruc && <span className="text-xs font-mono text-gray-400 dark:text-muted bg-gray-100 dark:bg-accent px-2 py-0.5 rounded">RUC: {s.ruc}</span>}
                      
                      {/* Per-Supplier Payment Status */}
                      {(() => {
                        const debt = getSupplierDebt(s.id);
                        if (debt.count === 0) return null;
                        return (
                          <>
                            {debt.overdue && (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/30 px-2 py-0.5 rounded border border-red-300 dark:border-red-900">
                                <AlertTriangle className="h-3 w-3" />
                                Deuda vencida
                              </span>
                            )}
                            {debt.approaching && !debt.overdue && (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-900">
                                <Clock className="h-3 w-3" />
                                Próximo a vencer
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-muted mt-1 flex-wrap">
                      {s.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {s.phone}</span>}
                      {s.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {s.email}</span>}
                      {s.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {s.address}</span>}
                      
                      {/* Supplier Debt Summary */}
                      {(() => {
                        const debt = getSupplierDebt(s.id);
                        if (debt.count === 0) return null;
                        return (
                          <span className="flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                            <DollarSign className="h-3.5 w-3.5" />
                            Deuda: S/ {debt.totalDebt.toFixed(2)} ({debt.count} {debt.count === 1 ? 'factura' : 'facturas'})
                          </span>
                        );
                      })()}
                    </div>
                    {s.notes && <p className="text-xs text-gray-400 dark:text-muted mt-1 italic">{s.notes}</p>}
                    {/* Purchase history mini chart */}
                    {(() => {
                      const history = getMonthlyHistory(s.id);
                      if (!history.some((h) => h.total > 0)) return null;
                      const maxVal = Math.max(...history.map((h) => h.total), 1);
                      return (
                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-card-border">
                          <p className="text-[10px] font-bold text-gray-400 dark:text-muted mb-1.5 uppercase tracking-wide">Compras últimos 6 meses</p>
                          <div className="flex items-end gap-1 h-10">
                            {history.map((h, i) => (
                              <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                                <div
                                  className="w-full bg-primary/60 hover:bg-primary rounded-sm transition-all"
                                  style={{ height: h.total > 0 ? `${Math.max((h.total / maxVal) * 28, 3)}px` : "3px", opacity: h.total > 0 ? 1 : 0.2 }}
                                  title={`S/ ${h.total.toFixed(0)}`}
                                />
                                <p className="text-[8px] text-gray-400 dark:text-muted leading-none">{h.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(s)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-primary hover:bg-primary/8 transition-colors" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteSupplier(s.id)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add supplier modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="bg-white dark:bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-y-auto max-h-[90dvh]">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white dark:bg-card z-10">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Nuevo proveedor</h3>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"><X className="h-5 w-5 text-gray-500 dark:text-muted" /></button>
            </div>
            <form onSubmit={addSupplier} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Nombre / Razón social *</label>
                  <input required value={addForm.name} onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Distribuidora Lima S.A.C." className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">RUC</label>
                  <input value={addForm.ruc} onChange={(e) => setAddForm(f => ({ ...f, ruc: e.target.value }))} placeholder="20xxxxxxxxx" maxLength={11} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Teléfono</label>
                  <input value={addForm.phone} onChange={(e) => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="999 999 999" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Email</label>
                  <input type="email" value={addForm.email} onChange={(e) => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="ventas@empresa.com" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Dirección</label>
                  <input value={addForm.address} onChange={(e) => setAddForm(f => ({ ...f, address: e.target.value }))} placeholder="Av. Colonial 1234, Lima" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Notas</label>
                  <textarea value={addForm.notes} onChange={(e) => setAddForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Información adicional…" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm resize-none" />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-card-border text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60">
                  {saving ? "Guardando…" : "Agregar proveedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

