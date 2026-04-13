"use client";

import { useEffect, useState } from "react";
import { Percent, Plus, Trash2, Save, Loader2, Clock, Tag } from "lucide-react";

type Discount = {
  id: string;
  name: string;
  type: "percentage" | "fixed" | "buy_x_get_y";
  value: number;
  minPurchase: number | null;
  productIds: number[];
  categoryFilter: string | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  usageCount: number;
};

export default function DiscountsTab() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "percentage" as Discount["type"],
    value: 10,
    minPurchase: "",
    categoryFilter: "",
    endsAt: "",
    active: true,
  });

  useEffect(() => {
    fetch("/api/store-page/discounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setDiscounts(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Descuentos activos</h2>
          <p className="text-sm text-gray-500">Crea descuentos por porcentaje, monto fijo o tipo 2x1 para atraer clientes</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo descuento
        </button>
      </div>

      {/* Discount types info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { type: "percentage", icon: Percent, label: "Porcentaje", desc: "Ej: 15% de descuento", color: "bg-blue-50 text-blue-600 border-blue-200" },
          { type: "fixed", icon: Tag, label: "Monto fijo", desc: "Ej: S/5 menos", color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
          { type: "buy_x_get_y", icon: Plus, label: "Lleva X paga Y", desc: "Ej: 3x2, 2x1", color: "bg-violet-50 text-violet-600 border-violet-200" },
        ].map((t) => (
          <div key={t.type} className={`rounded-xl border p-3 ${t.color}`}>
            <div className="flex items-center gap-2 mb-1">
              <t.icon className="h-4 w-4" />
              <span className="text-sm font-semibold">{t.label}</span>
            </div>
            <p className="text-xs opacity-70">{t.desc}</p>
          </div>
        ))}
      </div>

      {/* Discount list */}
      {discounts.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Percent className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin descuentos creados</h3>
          <p className="text-xs text-gray-400 max-w-xs">Los descuentos aparecen automaticamente en tu tienda con badge visual y precio tachado.</p>
        </div>
      )}

      {discounts.map((d) => (
        <div key={d.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Percent className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">{d.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {d.active ? "Activo" : "Inactivo"}
              </span>
            </div>
            <p className="text-sm text-primary font-bold">
              {d.type === "percentage" ? `${d.value}% off` : d.type === "fixed" ? `S/${d.value} menos` : `${d.value}x1`}
            </p>
            {d.endsAt && (
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" />
                Hasta {new Date(d.endsAt).toLocaleDateString("es-PE")}
              </p>
            )}
          </div>
          <span className="text-xs text-gray-400">{d.usageCount} usos</span>
          <button className="text-red-400 hover:text-red-600 p-1"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-6 space-y-4">
          <h3 className="font-bold text-gray-900 dark:text-white">Nuevo descuento</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nombre</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Descuento Fin de Semana" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Tipo</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Discount["type"] })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                <option value="percentage">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
                <option value="buy_x_get_y">Lleva X paga Y</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Valor</label>
              <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Valido hasta</label>
              <input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              disabled={saving || !form.name}
              onClick={async () => {
                setSaving(true);
                await fetch("/api/store-page/discounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => {});
                setShowForm(false);
                setSaving(false);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Crear descuento
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
