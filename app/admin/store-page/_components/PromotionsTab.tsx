"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Power, PowerOff } from "lucide-react";

type Promotion = {
  id: string;
  title: string;
  description: string | null;
  discountType: "percent" | "amount" | "fixed";
  discountValue: number;
  bannerImageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  active: boolean;
  position: number;
};

const EMPTY_FORM: Omit<Promotion, "id" | "position"> = {
  title: "",
  description: "",
  discountType: "percent",
  discountValue: 10,
  bannerImageUrl: "",
  ctaLabel: "",
  ctaUrl: "",
  startAt: null,
  endAt: null,
  active: true,
};

export default function PromotionsTab() {
  const [list, setList] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/store-page/promotions");
      if (res.ok) setList(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        description: form.description || null,
        bannerImageUrl: form.bannerImageUrl || null,
        ctaLabel: form.ctaLabel || null,
        ctaUrl: form.ctaUrl || null,
      };
      const res = await fetch("/api/store-page/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Error al crear");
      } else {
        setForm(EMPTY_FORM);
        setShowForm(false);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Promotion) {
    await fetch(`/api/store-page/promotions/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta promoción?")) return;
    await fetch(`/api/store-page/promotions/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Promociones de la página individual</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm"
        >
          <Plus className="w-4 h-4" />
          Nueva promoción
        </button>
      </div>

      {showForm && (
        <section className="p-5 rounded-xl border-2 border-teal-500 bg-teal-50 dark:bg-teal-900/10 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Título
              </span>
              <input
                type="text"
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
                placeholder="Oferta del mes"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Tipo de descuento
              </span>
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discountType: e.target.value as Promotion["discountType"],
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
              >
                <option value="percent">Porcentaje (%)</option>
                <option value="amount">Monto fijo (S/)</option>
                <option value="fixed">Precio fijo (S/)</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Valor del descuento
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.discountValue}
                onChange={(e) =>
                  setForm({ ...form, discountValue: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-mono"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Banner (URL)
              </span>
              <input
                type="url"
                value={form.bannerImageUrl ?? ""}
                onChange={(e) =>
                  setForm({ ...form, bannerImageUrl: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Inicio (opcional)
              </span>
              <input
                type="datetime-local"
                value={form.startAt?.slice(0, 16) ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    startAt: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Fin (opcional)
              </span>
              <input
                type="datetime-local"
                value={form.endAt?.slice(0, 16) ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    endAt: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Descripción
            </span>
            <textarea
              rows={3}
              maxLength={1000}
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold"
            >
              Cancelar
            </button>
            <button
              onClick={create}
              disabled={saving || !form.title.trim()}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-sm"
            >
              {saving ? "Creando…" : "Crear promoción"}
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          Sin promociones activas. Creá la primera con el botón arriba.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <div
              key={p.id}
              className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center gap-4 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold">{p.title}</p>
                  {p.active ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                      Activa
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600">
                      Pausada
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-sm text-gray-500 truncate">
                    {p.description}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {p.discountType === "percent"
                    ? `${p.discountValue}% OFF`
                    : p.discountType === "amount"
                    ? `-S/${p.discountValue}`
                    : `S/${p.discountValue}`}
                  {p.startAt && ` · desde ${p.startAt.slice(0, 10)}`}
                  {p.endAt && ` · hasta ${p.endAt.slice(0, 10)}`}
                </p>
              </div>
              <button
                onClick={() => toggleActive(p)}
                title={p.active ? "Pausar" : "Activar"}
                className={`p-2 rounded-lg ${
                  p.active
                    ? "bg-green-100 text-green-600"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {p.active ? (
                  <Power className="w-4 h-4" />
                ) : (
                  <PowerOff className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => remove(p.id)}
                className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
