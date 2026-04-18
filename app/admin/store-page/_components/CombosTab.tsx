"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useEffect, useState } from "react";
import { Boxes, Plus, Trash2, Save, Loader2, Package } from "@buleje/design-system/icons";

type ComboItem = { productId: number; productName: string; quantity: number };
type Combo = {
  id: string;
  name: string;
  description: string;
  items: ComboItem[];
  originalPrice: number;
  comboPrice: number;
  active: boolean;
  imageUrl: string;
};

const EMPTY: Omit<Combo, "id" | "originalPrice"> = {
  name: "",
  description: "",
  items: [],
  comboPrice: 0,
  active: true,
  imageUrl: "",
};

export default function CombosTab() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [products, setProducts] = useState<{ id: number; name: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/store-page/combos").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/products").then((r) => (r.ok ? r.json() : [])),
    ]).then(([c, p]) => {
      setCombos(Array.isArray(c) ? c : []);
      setProducts(Array.isArray(p) ? p.map((x: { id: number; name: string; price: number }) => ({ id: x.id, name: x.name, price: Number(x.price) })) : []);
      setLoading(false);
    });
  }, []);

  const discount = form.items.length > 0
    ? Math.round((1 - form.comboPrice / form.items.reduce((s, i) => s + (products.find((p) => p.id === i.productId)?.price ?? 0) * i.quantity, 0)) * 100)
    : 0;

  if (loading) {
    return (
      <LoadingState />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-lg font-bold text-[var(--text-primary)]">Combos de tu tienda</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)]">Agrupa productos con precio especial para aumentar el ticket promedio</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo combo
        </button>
      </div>

      {/* Combo list */}
      {combos.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Boxes className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-sm font-semibold text-[var(--text-secondary)] mb-1">Sin combos creados</CardTitle>
          <p className="text-xs text-[var(--text-tertiary)] max-w-xs">Crea tu primer combo agrupando productos con un precio especial. Los clientes ven el ahorro al instante.</p>
        </div>
      )}

      {combos.map((combo) => (
        <div key={combo.id} className="rounded-xl border border-[var(--rule-base)] p-4 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Boxes className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="font-semibold text-[var(--text-primary)]">{combo.name}</CardTitle>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${combo.active ? "bg-[var(--accent-soft)] text-[var(--data-success)]" : "bg-gray-100 text-[var(--text-secondary)]"}`}>
                {combo.active ? "Activo" : "Inactivo"}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{combo.items.length} productos</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-lg font-bold text-primary">S/{combo.comboPrice.toFixed(2)}</span>
              <span className="text-sm text-[var(--text-tertiary)] line-through">S/{combo.originalPrice.toFixed(2)}</span>
            </div>
          </div>
          <button className="text-[var(--data-error)] hover:text-[var(--data-error)] transition-colors p-1">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-6 space-y-4">
          <CardTitle className="font-bold text-[var(--text-primary)]">Nuevo combo</CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Nombre del combo</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Canasta Familiar"
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Precio del combo (S/)</label>
              <input
                type="number"
                step="0.01"
                value={form.comboPrice || ""}
                onChange={(e) => setForm({ ...form, comboPrice: Number(e.target.value) })}
                placeholder="Ej: 45.00"
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Descripcion</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe el combo para tus clientes..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Product selector */}
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-2">Productos en el combo</label>
            {form.items.map((item, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                <span className="text-sm flex-1">{item.productName}</span>
                <span className="text-xs text-[var(--text-tertiary)]">x{item.quantity}</span>
                <button onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })} className="text-[var(--data-error)] hover:text-[var(--data-error)]">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <select
              onChange={(e) => {
                const p = products.find((x) => x.id === Number(e.target.value));
                if (p) setForm({ ...form, items: [...form.items, { productId: p.id, productName: p.name, quantity: 1 }] });
                e.target.value = "";
              }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm text-[var(--text-secondary)]"
              defaultValue=""
            >
              <option value="" disabled>+ Agregar producto al combo...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — S/{p.price.toFixed(2)}</option>
              ))}
            </select>
          </div>

          {discount > 0 && (
            <div className="bg-[var(--accent-soft)] border border-[var(--data-success)]/30 rounded-lg px-3 py-2 text-sm text-[var(--data-success)] font-medium">
              Descuento: {discount}% de ahorro para el cliente
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              disabled={saving || !form.name || form.items.length === 0}
              onClick={async () => {
                setSaving(true);
                await fetch("/api/store-page/combos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => {});
                setShowForm(false);
                setSaving(false);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar combo
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
