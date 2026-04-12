"use client";

import Link from "next/link";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  ruc: string;
  razonSocial: string;
  category: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const INITIAL: FormState = {
  ruc: "",
  razonSocial: "",
  category: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
};

const CATEGORIES: { value: string; label: string }[] = [
  { value: "abarrotes", label: "Abarrotes" },
  { value: "bebidas", label: "Bebidas" },
  { value: "limpieza", label: "Limpieza" },
  { value: "higiene", label: "Higiene" },
  { value: "snacks", label: "Snacks" },
  { value: "lacteos", label: "Lácteos" },
  { value: "panaderia", label: "Panadería" },
  { value: "otros", label: "Otros" },
];

// ─── Client validation ───────────────────────────────────────────────────────

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};

  const rucClean = form.ruc.replace(/\D/g, "");
  if (!rucClean) {
    errors.ruc = "RUC es obligatorio";
  } else if (!/^\d{11}$/.test(rucClean)) {
    errors.ruc = "RUC debe tener 11 dígitos";
  }

  if (!form.razonSocial.trim()) {
    errors.razonSocial = "Razón social es obligatoria";
  } else if (form.razonSocial.trim().length < 3) {
    errors.razonSocial = "Mínimo 3 caracteres";
  }

  if (!form.category) {
    errors.category = "Selecciona una categoría";
  }

  if (!form.contactName.trim()) {
    errors.contactName = "Nombre del contacto es obligatorio";
  } else if (form.contactName.trim().length < 2) {
    errors.contactName = "Mínimo 2 caracteres";
  }

  const phoneClean = form.contactPhone.replace(/\s/g, "");
  if (!phoneClean) {
    errors.contactPhone = "Teléfono es obligatorio";
  } else if (phoneClean.length < 9 || phoneClean.length > 15) {
    errors.contactPhone = "Teléfono inválido";
  }

  if (!form.contactEmail.trim()) {
    errors.contactEmail = "Email es obligatorio";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
    errors.contactEmail = "Email inválido";
  }

  return errors;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupplierRegisterForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const update = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const fieldErrors = validate(form);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/supplier/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruc: form.ruc.replace(/\D/g, ""),
          razonSocial: form.razonSocial.trim(),
          category: form.category,
          contactName: form.contactName.trim(),
          contactPhone: form.contactPhone.replace(/\s/g, ""),
          contactEmail: form.contactEmail.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          setSubmitError(
            data.message ?? "Ya existe una solicitud con este RUC.",
          );
        } else if (res.status === 429) {
          setSubmitError(
            "Demasiados intentos. Espera una hora e inténtalo de nuevo.",
          );
        } else if (res.status === 400 && Array.isArray(data.issues)) {
          const newErrors: FieldErrors = {};
          for (const issue of data.issues) {
            const path = issue.path?.[0];
            if (path && typeof path === "string") {
              newErrors[path as keyof FormState] = issue.message;
            }
          }
          setErrors(newErrors);
          setSubmitError("Revisa los campos marcados en rojo.");
        } else {
          setSubmitError(data.error ?? "Error al enviar la solicitud.");
        }
        return;
      }

      setSuccess(true);
      setForm(INITIAL);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Error de red. Intenta de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────
  if (success) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 shadow-xl p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-3xl">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            ¡Solicitud recibida!
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Te contactaremos en{" "}
            <strong className="text-emerald-600 dark:text-emerald-400">
              24-48 horas
            </strong>{" "}
            para coordinar los siguientes pasos y entregarte tu API key.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-3 text-sm transition"
            >
              Volver al inicio
            </Link>
            <button
              type="button"
              onClick={() => setSuccess(false)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
            >
              Registrar otro proveedor
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg">
      <div className="text-center mb-6">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg mb-3">
          B
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Regístrate como proveedor
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Únete a la red de proveedores de Buleje. Revisamos tu solicitud en
          24-48 horas.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl p-6 space-y-4"
        noValidate
      >
        <Field
          label="RUC"
          required
          error={errors.ruc}
          htmlFor="field-ruc"
          hint="11 dígitos"
        >
          <input
            id="field-ruc"
            type="text"
            inputMode="numeric"
            maxLength={11}
            value={form.ruc}
            onChange={(e) => update("ruc", e.target.value.replace(/\D/g, ""))}
            placeholder="20123456789"
            className={inputClass(!!errors.ruc)}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Razón social"
          required
          error={errors.razonSocial}
          htmlFor="field-razonSocial"
        >
          <input
            id="field-razonSocial"
            type="text"
            value={form.razonSocial}
            onChange={(e) => update("razonSocial", e.target.value)}
            placeholder="Ej: Distribuidora López SAC"
            className={inputClass(!!errors.razonSocial)}
            maxLength={200}
          />
        </Field>

        <Field
          label="Categoría principal"
          required
          error={errors.category}
          htmlFor="field-category"
        >
          <select
            id="field-category"
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
            className={inputClass(!!errors.category)}
          >
            <option value="">— Selecciona —</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Persona de contacto
          </p>

          <div className="space-y-4">
            <Field
              label="Nombre completo"
              required
              error={errors.contactName}
              htmlFor="field-contactName"
            >
              <input
                id="field-contactName"
                type="text"
                value={form.contactName}
                onChange={(e) => update("contactName", e.target.value)}
                placeholder="Juan Pérez"
                className={inputClass(!!errors.contactName)}
                maxLength={100}
              />
            </Field>

            <Field
              label="Teléfono / WhatsApp"
              required
              error={errors.contactPhone}
              htmlFor="field-contactPhone"
            >
              <input
                id="field-contactPhone"
                type="tel"
                value={form.contactPhone}
                onChange={(e) => update("contactPhone", e.target.value)}
                placeholder="961234567"
                className={inputClass(!!errors.contactPhone)}
                maxLength={15}
              />
            </Field>

            <Field
              label="Email"
              required
              error={errors.contactEmail}
              htmlFor="field-contactEmail"
            >
              <input
                id="field-contactEmail"
                type="email"
                value={form.contactEmail}
                onChange={(e) => update("contactEmail", e.target.value)}
                placeholder="contacto@empresa.pe"
                className={inputClass(!!errors.contactEmail)}
                autoComplete="email"
              />
            </Field>
          </div>
        </div>

        {submitError && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
            <p className="text-xs font-medium text-red-700 dark:text-red-300">
              {submitError}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold px-4 py-3 text-sm transition shadow-sm min-h-[48px]"
        >
          {submitting ? "Enviando…" : "Enviar solicitud"}
        </button>

        <p className="text-[11px] text-center text-gray-400 dark:text-gray-500">
          Al enviar aceptas que te contactemos por los medios indicados para
          coordinar la validación.
        </p>
      </form>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1"
      >
        {label} {required && <span className="text-red-500">*</span>}
        {hint && (
          <span className="ml-1 text-gray-400 dark:text-gray-500 font-normal">
            ({hint})
          </span>
        )}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

function inputClass(invalid: boolean): string {
  return [
    "w-full px-3 py-2.5 rounded-xl border text-sm bg-white dark:bg-gray-800",
    "text-gray-900 dark:text-white placeholder:text-gray-400",
    "focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500",
    "min-h-[44px]",
    invalid
      ? "border-red-300 dark:border-red-700"
      : "border-gray-200 dark:border-gray-700",
  ].join(" ");
}
