"use client";

import { LoadingState } from "@buleje/design-system";
import { useEffect, useState } from "react";
import {
  Percent,
  Plus,
  Trash2,
  Save,
  Loader2,
  Clock,
  Tag,
} from "@buleje/design-system/icons";
import AdminTabShell from "./_shared/AdminTabShell";
import AdminEmptyState from "./_shared/AdminEmptyState";
import { ADMIN_TOKENS } from "./_shared/admin-tokens";

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
      .then((d) => {
        setDiscounts(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <AdminTabShell
      title="Descuentos activos"
      description="Crea descuentos por porcentaje, monto fijo o tipo 2x1 para atraer clientes."
      icon={Percent}
      actions={
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className={ADMIN_TOKENS.btnPrimary}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nuevo descuento
        </button>
      }
    >
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {/* Discount types info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { type: "percentage", icon: Percent, label: "Porcentaje", desc: "Ej: 15% de descuento" },
              { type: "fixed", icon: Tag, label: "Monto fijo", desc: "Ej: S/ 5 menos" },
              { type: "buy_x_get_y", icon: Plus, label: "Lleva X paga Y", desc: "Ej: 3x2, 2x1" },
            ].map((t) => (
              <div key={t.type} className={`${ADMIN_TOKENS.card} p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <t.icon
                    className="h-4 w-4 text-[var(--accent)]"
                    aria-hidden
                  />
                  <span className={ADMIN_TOKENS.headingH3}>{t.label}</span>
                </div>
                <p className={ADMIN_TOKENS.hint}>{t.desc}</p>
              </div>
            ))}
          </div>

          {/* Discount list */}
          {discounts.length === 0 && !showForm && (
            <AdminEmptyState
              icon={Percent}
              title="Sin descuentos creados"
              description="Los descuentos aparecen automáticamente en tu tienda con badge visual y precio tachado."
              action={{
                label: "Crear primer descuento",
                onClick: () => setShowForm(true),
              }}
            />
          )}

          {discounts.map((d) => (
            <div
              key={d.id}
              className={`${ADMIN_TOKENS.card} p-4 flex items-center gap-4`}
            >
              <div className="h-12 w-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
                <Percent className="h-6 w-6 text-[var(--accent)]" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={ADMIN_TOKENS.headingH3}>{d.name}</h3>
                  <span
                    className={`text-[length:var(--ts-2xs)] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      d.active
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {d.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <p className="text-sm text-[var(--accent)] font-bold">
                  {d.type === "percentage"
                    ? `${d.value}% off`
                    : d.type === "fixed"
                      ? `S/ ${d.value} menos`
                      : `${d.value}x1`}
                </p>
                {d.endsAt && (
                  <p className={`${ADMIN_TOKENS.hint} flex items-center gap-1 mt-0.5`}>
                    <Clock className="h-3 w-3" aria-hidden />
                    Hasta {new Date(d.endsAt).toLocaleDateString("es-PE")}
                  </p>
                )}
              </div>
              <span className={ADMIN_TOKENS.hint}>{d.usageCount} usos</span>
              <button
                type="button"
                aria-label={`Eliminar ${d.name}`}
                className="text-[var(--text-tertiary)] hover:text-rose-600 p-1"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}

          {/* Create form */}
          {showForm && (
            <div className={ADMIN_TOKENS.cardPadded}>
              <h3 className={ADMIN_TOKENS.headingH3}>Nuevo descuento</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`${ADMIN_TOKENS.label} block mb-1`}>
                    Nombre
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej: Descuento Fin de Semana"
                    className={ADMIN_TOKENS.input}
                  />
                </div>
                <div>
                  <label className={`${ADMIN_TOKENS.label} block mb-1`}>
                    Tipo
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({ ...form, type: e.target.value as Discount["type"] })
                    }
                    className={ADMIN_TOKENS.input}
                  >
                    <option value="percentage">Porcentaje (%)</option>
                    <option value="fixed">Monto fijo (S/)</option>
                    <option value="buy_x_get_y">Lleva X paga Y</option>
                  </select>
                </div>
                <div>
                  <label className={`${ADMIN_TOKENS.label} block mb-1`}>Valor</label>
                  <input
                    type="number"
                    value={form.value}
                    onChange={(e) =>
                      setForm({ ...form, value: Number(e.target.value) })
                    }
                    className={ADMIN_TOKENS.input}
                  />
                </div>
                <div>
                  <label className={`${ADMIN_TOKENS.label} block mb-1`}>
                    Válido hasta
                  </label>
                  <input
                    type="date"
                    value={form.endsAt}
                    onChange={(e) =>
                      setForm({ ...form, endsAt: e.target.value })
                    }
                    className={ADMIN_TOKENS.input}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={saving || !form.name}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await fetch("/api/store-page/discounts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(form),
                      });
                    } catch {
                      /* siguiente reload reconcilia */
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
                  Crear descuento
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
