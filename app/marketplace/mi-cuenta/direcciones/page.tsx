"use client";

import { useState, useCallback } from "react";
import { z } from "zod/v4";
import { useCustomer } from "@/contexts/customer-context";
import type { SavedLocation } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";

// ── Zod schema ────────────────────────────────────────────────────────────────

const DireccionSchema = z.object({
  location: z.string().min(5, "Minimo 5 caracteres").max(200),
  reference: z.string().min(3, "Minimo 3 caracteres").max(200),
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
        <h2 className="text-base font-medium text-gray-700 dark:text-gray-300">
          Mis direcciones
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
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
          className="mb-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="space-y-3">
            <div>
              <label
                htmlFor="location"
                className="block text-xs font-medium text-gray-600 dark:text-gray-400"
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
                  "mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 dark:bg-gray-800 dark:text-gray-100",
                  errors.location
                    ? "border-red-300 dark:border-red-700"
                    : "border-gray-200 dark:border-gray-700",
                )}
                aria-describedby={errors.location ? "location-error" : undefined}
              />
              {errors.location && (
                <p id="location-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.location}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="reference"
                className="block text-xs font-medium text-gray-600 dark:text-gray-400"
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
                  "mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 dark:bg-gray-800 dark:text-gray-100",
                  errors.reference
                    ? "border-red-300 dark:border-red-700"
                    : "border-gray-200 dark:border-gray-700",
                )}
                aria-describedby={errors.reference ? "reference-error" : undefined}
              />
              {errors.reference && (
                <p id="reference-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
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
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Aun no tienes direcciones guardadas.
          </p>
        </div>
      )}

      {/* List */}
      {locations.length > 0 && (
        <ul className="space-y-3" aria-label="Direcciones guardadas">
          {locations.map((loc) => {
            const isActive = customer?.activeLocationId === loc.id;
            return (
              <li
                key={loc.id}
                className={cn(
                  "rounded-lg border p-4",
                  isActive
                    ? "border-[#2d6a4f]/30 bg-[#2d6a4f]/5 dark:border-[#52b788]/20 dark:bg-[#2d6a4f]/10"
                    : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {loc.location}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {loc.reference}
                    </p>
                    {isActive && (
                      <span className="mt-1 inline-block text-xs font-medium text-[#2d6a4f] dark:text-[#52b788]">
                        Principal
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => handleSetActive(loc.id)}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        aria-label={`Usar ${loc.location} como direccion principal`}
                      >
                        Usar
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(loc.id)}
                      className="text-xs text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
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
