﻿"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { Trash2, Pencil, Check, X, Plus, Phone, Mail, MapPin } from "lucide-react";
import type { DbSupplier } from "@/lib/jsondb";
import { useScrollLock } from "@/hooks/use-scroll-lock";

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<DbSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DbSupplier>>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", ruc: "", phone: "", email: "", address: "", notes: "" });
  useScrollLock(showAdd);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/suppliers");
      if (r.ok) setSuppliers(await r.json());
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
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-muted mt-1 flex-wrap">
                      {s.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {s.phone}</span>}
                      {s.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {s.email}</span>}
                      {s.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {s.address}</span>}
                    </div>
                    {s.notes && <p className="text-xs text-gray-400 dark:text-muted mt-1 italic">{s.notes}</p>}
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
