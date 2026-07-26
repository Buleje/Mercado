"use client";

import { LoadingState } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Power,
  PowerOff,
  Megaphone,
  Save,
} from "@buleje/design-system/icons";
import {
  ADMIN_TOKENS,
  AdminTabShell,
  AdminEmptyState,
  AdminButton,
  AdminField,
  AdminInput,
  AdminTextarea,
  AdminSelect,
} from "../../_components/_shared";

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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
      headers: csrfHeaders({ "Content-Type": "application/json" }),
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
    <AdminTabShell
      title="Promociones"
      description="Banners y promociones que aparecen en tu página pública. Pueden tener fecha de inicio y fin."
      icon={Megaphone}
      actions={
        <AdminButton
          variant="primary"
          icon={Plus}
          onClick={() => setShowForm((v) => !v)}
        >
          Nueva promoción
        </AdminButton>
      }
    >
      {showForm && (
        <section className={ADMIN_TOKENS.cardPadded}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AdminField label="Título" required>
              <AdminInput
                type="text"
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Oferta del mes"
              />
            </AdminField>
            <AdminField label="Tipo de descuento">
              <AdminSelect
                value={form.discountType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discountType: e.target.value as Promotion["discountType"],
                  })
                }
              >
                <option value="percent">Porcentaje (%)</option>
                <option value="amount">Monto fijo (S/)</option>
                <option value="fixed">Precio fijo (S/)</option>
              </AdminSelect>
            </AdminField>
            <AdminField label="Valor del descuento">
              <AdminInput
                type="number"
                step="0.01"
                min="0"
                value={form.discountValue}
                onChange={(e) =>
                  setForm({ ...form, discountValue: Number(e.target.value) })
                }
                className="font-mono"
              />
            </AdminField>
            <AdminField label="Banner (URL)" hint="Imagen de fondo opcional">
              <AdminInput
                type="url"
                value={form.bannerImageUrl ?? ""}
                onChange={(e) =>
                  setForm({ ...form, bannerImageUrl: e.target.value })
                }
              />
            </AdminField>
            <AdminField label="Inicio" hint="Opcional">
              <AdminInput
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
              />
            </AdminField>
            <AdminField label="Fin" hint="Opcional">
              <AdminInput
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
              />
            </AdminField>
          </div>
          <AdminField label="Descripción">
            <AdminTextarea
              rows={3}
              maxLength={1000}
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </AdminField>
          {error && <div className={ADMIN_TOKENS.errorBanner}>{error}</div>}
          <div className="flex gap-2 justify-end">
            <AdminButton variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </AdminButton>
            <AdminButton
              variant="primary"
              icon={Save}
              loading={saving}
              disabled={!form.title.trim()}
              onClick={create}
            >
              {saving ? "Creando…" : "Crear promoción"}
            </AdminButton>
          </div>
        </section>
      )}

      {loading ? (
        <LoadingState />
      ) : list.length === 0 ? (
        <AdminEmptyState
          icon={Megaphone}
          title="Sin promociones activas"
          description="Crea tu primera promoción con el botón de arriba para que aparezca destacada en tu tienda."
          action={{ label: "Nueva promoción", onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <div
              key={p.id}
              className={`${ADMIN_TOKENS.card} p-4 flex items-center gap-4 flex-wrap`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold">{p.title}</p>
                  {p.active ? (
                    <span className="px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                      Activa
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-gray-200 text-[var(--text-secondary)]">
                      Pausada
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-sm text-[var(--text-secondary)] truncate">
                    {p.description}
                  </p>
                )}
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
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
                    ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                    : "bg-gray-100 text-[var(--text-secondary)]"
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
                className="p-2 rounded-lg bg-[var(--data-error-50)] text-[var(--data-error-500)] hover:bg-[var(--data-error-100)]"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminTabShell>
  );
}
