"use client";

import { useState, useCallback } from "react";
import { z } from "zod/v4";
import { Home, Briefcase, Heart, MapPin, Star } from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import type { SavedLocation } from "@/contexts/customer-context";
import { EmptyState } from "@/components/ui-system/EmptyState";
import { cn } from "@/lib/utils";

// MK-33: detección heurística de etiqueta + icono según el nombre.
// Sin cambios de schema — funciona client-only sobre el campo `location`.
function getLocationKind(label: string): {
  Icon: React.ElementType;
  tag: string;
  color: string;
} {
  const t = label.toLowerCase();
  if (/\bcasa\b|\bhome\b|\bdepa\b|\bdepartamento\b/.test(t)) {
    return { Icon: Home, tag: "Casa", color: "text-[var(--data-success-500)]" };
  }
  if (/\boficina\b|\btrabajo\b|\boffice\b|\bwork\b/.test(t)) {
    return { Icon: Briefcase, tag: "Trabajo", color: "text-blue-600" };
  }
  if (/\bmam[aá]\b|\bpap[aá]\b|\babuel[oa]\b|\bfamilia\b/.test(t)) {
    return { Icon: Heart, tag: "Familia", color: "text-pink-600" };
  }
  return { Icon: MapPin, tag: "Otro", color: "text-[var(--text-tertiary)]" };
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const DireccionSchema = z.object({
  location: z.string().min(5, "Mínimo 5 caracteres").max(200),
  reference: z.string().min(3, "Mínimo 3 caracteres").max(200),
});

type DireccionForm = z.infer<typeof DireccionSchema>;
type FormErrors = Partial<Record<keyof DireccionForm, string>>;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DireccionesPage() {
  const { customer, register } = useCustomer();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DireccionForm>({ location: "", reference: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const locations: SavedLocation[] = customer?.locations ?? [];

  // ── Form handlers ─────────────────────────────────────────────────────────

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!customer) return;

      const result = DireccionSchema.safeParse(form);
      if (!result.success) {
        const fieldErrors: FormErrors = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0] as keyof DireccionForm;
          fieldErrors[field] = issue.message;
        }
        setErrors(fieldErrors);
        return;
      }

      setSaving(true);

      const newLocation: SavedLocation = {
        id: `loc-${Date.now()}`,
        location: result.data.location,
        reference: result.data.reference,
      };

      const updatedLocations = [...(customer.locations ?? []), newLocation];

      register({
        ...customer,
        locations: updatedLocations,
        activeLocationId: customer.activeLocationId ?? newLocation.id,
      });

      setSaving(false);
      setForm({ location: "", reference: "" });
      setErrors({});
      setShowForm(false);
    },
    [customer, form, register],
  );

  const handleSetActive = useCallback(
    (id: string) => {
      if (!customer) return;
      register({ ...customer, activeLocationId: id });
    },
    [customer, register],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!customer) return;
      const updatedLocations = (customer.locations ?? []).filter((l) => l.id !== id);
      const newActiveId =
        customer.activeLocationId === id
          ? (updatedLocations[0]?.id ?? null)
          : customer.activeLocationId;
      register({
        ...customer,
        locations: updatedLocations,
        activeLocationId: newActiveId ?? undefined,
      });
    },
    [customer, register],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-medium text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]">
          Mis direcciones
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] dark:border-[var(--rule-base)] dark:bg-[var(--surface-canvas)] dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800"
        >
          {showForm ? "Cancelar" : "Agregar"}
        </button>
      </div>

      {/* Form agregar */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label="Agregar nueva direccion"
          className="mb-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-[var(--rule-base)] dark:bg-[var(--surface-canvas)]"
        >
          <div className="space-y-3">
            <div>
              <label
                htmlFor="location"
                className="block text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]"
              >
                Direccion
              </label>
              <input
                id="location"
                name="location"
                type="text"
                value={form.location}
                onChange={handleChange}
                placeholder="Av. Lima 123, Pucallpa"
                className={cn(
                  "mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 dark:bg-[var(--surface-sunken)] dark:text-[var(--text-primary)]",
                  errors.location
                    ? "border-red-300 dark:border-[var(--data-error-700)]"
                    : "border-gray-200 dark:border-[var(--rule-base)]",
                )}
                aria-describedby={errors.location ? "location-error" : undefined}
              />
              {errors.location && (
                <p id="location-error" className="mt-1 text-xs text-[var(--data-error-600)] dark:text-red-400">
                  {errors.location}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="reference"
                className="block text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]"
              >
                Referencia
              </label>
              <input
                id="reference"
                name="reference"
                type="text"
                value={form.reference}
                onChange={handleChange}
                placeholder="Frente al parque"
                className={cn(
                  "mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 dark:bg-[var(--surface-sunken)] dark:text-[var(--text-primary)]",
                  errors.reference
                    ? "border-red-300 dark:border-[var(--data-error-700)]"
                    : "border-gray-200 dark:border-[var(--rule-base)]",
                )}
                aria-describedby={errors.reference ? "reference-error" : undefined}
              />
              {errors.reference && (
                <p id="reference-error" className="mt-1 text-xs text-[var(--data-error-600)] dark:text-red-400">
                  {errors.reference}
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-4 w-full rounded-lg bg-[#2d6a4f] px-4 py-2 text-sm font-medium text-white hover:bg-[#245a41] disabled:opacity-60 dark:hover:bg-[#3d8a6f]"
          >
            {saving ? "Guardando..." : "Guardar direccion"}
          </button>
        </form>
      )}

      {/* Empty */}
      {locations.length === 0 && !showForm && (
        <EmptyState
          eyebrow="Direcciones"
          title="Aún no tienes direcciones guardadas"
          description="Agrega al menos una dirección para que tus pedidos lleguen al lugar correcto sin escribirla cada vez."
          action={
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Agregar dirección
            </button>
          }
        />
      )}

      {/* List */}
      {locations.length > 0 && (
        <ul className="space-y-3" aria-label="Direcciones guardadas">
          {locations.map((loc) => {
            const isActive = customer?.activeLocationId === loc.id;
            const kind = getLocationKind(loc.location);
            const KindIcon = kind.Icon;
            return (
              <li
                key={loc.id}
                className={cn(
                  "rounded-lg border p-4",
                  isActive
                    ? "border-[#2d6a4f]/30 bg-[#2d6a4f]/5 dark:border-[#52b788]/20 dark:bg-[#2d6a4f]/10"
                    : "border-gray-200 bg-white dark:border-[var(--rule-base)] dark:bg-[var(--surface-canvas)]",
                )}
              >
                <div className="flex items-start gap-3">
                  {/* MK-33: icono por tipo de dirección */}
                  <div className={cn(
                    "shrink-0 h-10 w-10 rounded-xl border flex items-center justify-center",
                    isActive
                      ? "bg-white border-[#2d6a4f]/30 dark:bg-[var(--surface-canvas)]"
                      : "bg-[var(--surface-sunken)] border-gray-200 dark:bg-[var(--surface-sunken)] dark:border-[var(--rule-base)]",
                  )}>
                    <KindIcon className={cn("h-4 w-4", kind.color)} strokeWidth={1.75} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                        {loc.location}
                      </p>
                      <span className={cn(
                        "inline-flex items-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider rounded-full px-2 py-0.5",
                        kind.color,
                        "bg-current/10",
                      )}>
                        {kind.tag}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
                      {loc.reference}
                    </p>
                    {isActive && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#2d6a4f] dark:text-[#52b788]">
                        <Star className="h-3 w-3 fill-current" strokeWidth={1.75} aria-hidden />
                        Principal
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => handleSetActive(loc.id)}
                        className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] dark:hover:text-gray-200"
                        aria-label={`Usar ${loc.location} como direccion principal`}
                      >
                        Usar
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(loc.id)}
                      className="text-xs text-[var(--text-tertiary)] hover:text-[var(--data-error-600)] dark:text-[var(--text-tertiary)] dark:hover:text-red-400"
                      aria-label={`Eliminar ${loc.location}`}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
