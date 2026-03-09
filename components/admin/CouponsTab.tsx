"use client";

import { useState, useEffect, useCallback } from "react";
import { Ticket, Plus, Trash2, Check, X, Loader2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type Coupon = {
  id: string; code: string; description: string;
  discountType: "percent" | "fixed"; discountValue: number;
  minPurchase?: number; maxUses?: number; usedCount: number;
  active: boolean; expiresAt?: string; createdAt: string;
};

export default function CouponsTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", description: "", discountType: "percent" as "percent" | "fixed", discountValue: 10, minPurchase: 0, maxUses: 0, expiresAt: "" });

  const load = useCallback(() => {
    fetch("/api/coupons").then(r => r.json()).then(setCoupons).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.code.trim() || !form.discountValue) return;
    const res = await fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        minPurchase: form.minPurchase || undefined,
        maxUses: form.maxUses || undefined,
        expiresAt: form.expiresAt || undefined,
      }),
    });
    if (res.ok) { load(); setShowForm(false); setForm({ code: "", description: "", discountType: "percent", discountValue: 10, minPurchase: 0, maxUses: 0, expiresAt: "" }); }
  };

  const toggleActive = async (c: Coupon) => {
    await fetch(`/api/coupons/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !c.active }) });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar cupón?")) return;
    await fetch(`/api/coupons/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><Ticket className="h-6 w-6 text-primary" />Cupones</h2>
        <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition">
          <Plus className="h-4 w-4" />Nuevo Cupón
        </button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-muted">Código *</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="DESCUENTO10" className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-muted">Descripción</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="10% de descuento" className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-muted">Tipo</label>
              <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as "percent" | "fixed" }))} className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm">
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-muted">Valor *</label>
              <input type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))} className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-muted">Compra mínima (S/)</label>
              <input type="number" value={form.minPurchase} onChange={e => setForm(f => ({ ...f, minPurchase: Number(e.target.value) }))} className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-muted">Usos máximos (0 = ilimitado)</label>
              <input type="number" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))} className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-muted">Fecha expiración</label>
              <input type="date" value={form.expiresAt ? form.expiresAt.slice(0, 10) : ""} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "" }))} className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreate} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition"><Check className="h-4 w-4" />Crear</button>
            <button onClick={() => setShowForm(false)} className="flex items-center gap-2 bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-200 transition"><X className="h-4 w-4" />Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {coupons.length === 0 && <p className="text-center text-gray-400 dark:text-muted py-8">No hay cupones creados</p>}
        {coupons.map(c => (
          <div key={c.id} className={cn("bg-white dark:bg-card border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3", c.active ? "border-gray-200 dark:border-card-border" : "border-red-200 dark:border-red-900/30 opacity-60")}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-extrabold text-primary text-lg">{c.code}</span>
                <button onClick={() => navigator.clipboard.writeText(c.code)} className="text-gray-400 hover:text-primary"><Copy className="h-3.5 w-3.5" /></button>
                {!c.active && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Inactivo</span>}
              </div>
              <p className="text-sm text-gray-500 dark:text-muted">{c.description || "Sin descripción"}</p>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400 dark:text-muted">
                <span className="font-bold text-emerald-600">{c.discountType === "percent" ? `${c.discountValue}%` : `S/${c.discountValue}`}</span>
                {c.minPurchase ? <span>Min: S/{c.minPurchase}</span> : null}
                {c.maxUses ? <span>Usos: {c.usedCount}/{c.maxUses}</span> : <span>Usos: {c.usedCount}/∞</span>}
                {c.expiresAt && <span>Exp: {new Date(c.expiresAt).toLocaleDateString()}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggleActive(c)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition", c.active ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200")}>
                {c.active ? "Desactivar" : "Activar"}
              </button>
              <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
