"use client";

import { LoadingState } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useEffect, useState } from "react";
import {
  Boxes,
  Plus,
  Trash2,
  Save,
  Loader2,
  Package,
} from "@buleje/design-system/icons";
import AdminTabShell from "../../_components/_shared/AdminTabShell";
import AdminEmptyState from "../../_components/_shared/AdminEmptyState";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";

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
  const [products, setProducts] = useState<
    { id: number; name: string; price: number }[]
  >([]);
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
      setProducts(
        Array.isArray(p)
          ? p.map((x: { id: number; name: string; price: number }) => ({
              id: x.id,
              name: x.name,
              price: Number(x.price),
            }))
          : [],
      );
      setLoading(false);
    });
  }, []);

  const discount =
    form.items.length > 0
      ? Math.round(
          (1 -
            form.comboPrice /
              form.items.reduce(
                (s, i) =>
                  s +
                  (products.find((p) => p.id === i.productId)?.price ?? 0) *
                    i.quantity,
                0,
              )) *
            100,
        )
      : 0;

  return (
    <AdminTabShell
      title="Combos de tu tienda"
      description="Agrupa productos con precio especial para aumentar el ticket promedio."
      icon={Boxes}
      actions={
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY);
            setShowForm(true);
          }}
          className={ADMIN_TOKENS.btnPrimary}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nuevo combo
        </button>
      }
    >
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {/* Combo list */}
          {combos.length === 0 && !showForm && (
            <AdminEmptyState
              icon={Boxes}
              title="Sin combos creados"
              description="Crea tu primer combo agrupando productos con un precio especial. Los clientes ven el ahorro al instante."
              action={{
                label: "Crear primer combo",
                onClick: () => {
                  setForm(EMPTY);
                  setShowForm(true);
                },
              }}
            />
          )}

          {combos.map((combo) => (
            <div
              key={combo.id}
              className={`${ADMIN_TOKENS.card} p-4 flex items-start gap-4`}
            >
              <div className="h-12 w-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
                <Boxes className="h-6 w-6 text-[var(--accent)]" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={ADMIN_TOKENS.headingH3}>{combo.name}</h3>
                  <span
                    className={`text-[length:var(--ts-2xs)] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      combo.active
                        ? "bg-emerald-50 text-[var(--data-success-700)] dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {combo.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <p className={`${ADMIN_TOKENS.hint} mt-0.5`}>
                  {combo.items.length} productos
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-bold text-[var(--text-primary)]">
                    S/ {Number(combo.comboPrice).toFixed(2)}
                  </span>
                  <span className="text-sm text-[var(--text-tertiary)] line-through">
                    S/ {Number(combo.originalPrice).toFixed(2)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label={`Eliminar ${combo.name}`}
                className="text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors p-1"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}

          {/* Create form */}
          {showForm && (
            <div className={`${ADMIN_TOKENS.cardPadded}`}>
              <h3 className={ADMIN_TOKENS.headingH3}>Nuevo combo</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`${ADMIN_TOKENS.label} block mb-1`}>
                    Nombre del combo
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej: Canasta Familiar"
                    className={ADMIN_TOKENS.input}
                  />
                </div>
                <div>
                  <label className={`${ADMIN_TOKENS.label} block mb-1`}>
                    Precio del combo (S/)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.comboPrice || ""}
                    onChange={(e) =>
                      setForm({ ...form, comboPrice: Number(e.target.value) })
                    }
                    placeholder="Ej: 45.00"
                    className={ADMIN_TOKENS.input}
                  />
                </div>
              </div>
              <div>
                <label className={`${ADMIN_TOKENS.label} block mb-1`}>
                  Descripción
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Describe el combo para tus clientes..."
                  rows={2}
                  className={ADMIN_TOKENS.input}
                />
              </div>

              {/* Product selector */}
              <div>
                <label className={`${ADMIN_TOKENS.label} block mb-2`}>
                  Productos en el combo
                </label>
                {form.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <Package
                      className="h-4 w-4 text-[var(--text-tertiary)] shrink-0"
                      aria-hidden
                    />
                    <span className="text-sm flex-1 text-[var(--text-primary)]">
                      {item.productName}
                    </span>
                    <span className={ADMIN_TOKENS.hint}>x{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Quitar ${item.productName}`}
                      onClick={() =>
                        setForm({
                          ...form,
                          items: form.items.filter((_, j) => j !== i),
                        })
                      }
                      className="text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
                <select
                  onChange={(e) => {
                    const p = products.find(
                      (x) => x.id === Number(e.target.value),
                    );
                    if (p)
                      setForm({
                        ...form,
                        items: [
                          ...form.items,
                          {
                            productId: p.id,
                            productName: p.name,
                            quantity: 1,
                          },
                        ],
                      });
                    e.target.value = "";
                  }}
                  className={ADMIN_TOKENS.input}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Agregar producto al combo...
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — S/ {Number(p.price).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {discount > 0 && (
                <div className={ADMIN_TOKENS.successBanner}>
                  Descuento: {discount}% de ahorro para el cliente
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={saving || !form.name || form.items.length === 0}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await fetch("/api/store-page/combos", {
                        method: "POST",
                        headers: csrfHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify(form),
                      });
                    } catch {
                      /* silent — el siguiente reload reconcilia */
                    }
                    setShowForm(false);
                    setSaving(false);
                  }}
                  className={ADMIN_TOKENS.btnPrimary}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden />
                  )}
                  Guardar combo
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className={ADMIN_TOKENS.btnGhost}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminTabShell>
  );
}
