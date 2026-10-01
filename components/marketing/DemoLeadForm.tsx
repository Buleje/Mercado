"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

interface FormState {
  name: string;
  whatsapp: string;
  businessType: "bodega" | "pizzeria" | "ferreteria" | "minimarket" | "otro";
  businessName: string;
  city: string;
  monthlyRevenuePEN: "" | "<15k" | "15k-40k" | "40k-80k" | ">80k";
  painPoint: string;
  preferredDemoTime: string;
}

const INITIAL: FormState = {
  name: "",
  whatsapp: "",
  businessType: "bodega",
  businessName: "",
  city: "Pucallpa",
  monthlyRevenuePEN: "",
  painPoint: "",
  preferredDemoTime: "",
};

export default function DemoLeadForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const source = searchParams.get("source") ?? "direct";
  const ref = searchParams.get("ref") ?? undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/lead/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          monthlyRevenuePEN: form.monthlyRevenuePEN || undefined,
          painPoint: form.painPoint || undefined,
          preferredDemoTime: form.preferredDemoTime || undefined,
          source,
          ref,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Algo salió mal");
      }
      setSuccess(data.message ?? "¡Listo! Te contacto por WhatsApp.");
      setForm(INITIAL);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl bg-primary/10 border-2 border-[var(--accent)] p-6 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-base font-extrabold text-[var(--text-primary)] mb-2">
          ¡Listo!
        </p>
        <p className="text-sm text-[var(--text-secondary)]">{success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tu nombre" required>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Carlos Mendoza"
            className={inputClass}
          />
        </Field>
        <Field label="WhatsApp" required hint="9 dígitos sin +51">
          <input
            type="tel"
            required
            pattern="9\d{8}"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value.replace(/\D/g, "").slice(0, 9) })}
            placeholder="994123456"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tipo de negocio" required>
          <select
            value={form.businessType}
            onChange={(e) => setForm({ ...form, businessType: e.target.value as FormState["businessType"] })}
            className={inputClass}
          >
            <option value="bodega">Bodega / Minimarket</option>
            <option value="pizzeria">Pizzería / Restaurante</option>
            <option value="ferreteria">Ferretería</option>
            <option value="minimarket">Minimarket grande</option>
            <option value="otro">Otro</option>
          </select>
        </Field>
        <Field label="Ciudad">
          <input
            type="text"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="Pucallpa"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Nombre del negocio (opcional)">
        <input
          type="text"
          value={form.businessName}
          onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          placeholder="Bodega San Martín"
          className={inputClass}
        />
      </Field>

      <Field label="¿Cuánto facturás al mes? (opcional, ayuda a personalizar el demo)">
        <select
          value={form.monthlyRevenuePEN}
          onChange={(e) => setForm({ ...form, monthlyRevenuePEN: e.target.value as FormState["monthlyRevenuePEN"] })}
          className={inputClass}
        >
          <option value="">Prefiero no decir</option>
          <option value="<15k">Menos de S/15,000/mes</option>
          <option value="15k-40k">S/15,000 - S/40,000/mes</option>
          <option value="40k-80k">S/40,000 - S/80,000/mes</option>
          <option value=">80k">Más de S/80,000/mes</option>
        </select>
      </Field>

      <Field label="¿Cuál es tu mayor dolor hoy? (opcional)" hint="Ej: pierdo plata en mermas, no cobro fiados, cliente no vuelve">
        <textarea
          rows={3}
          value={form.painPoint}
          onChange={(e) => setForm({ ...form, painPoint: e.target.value.slice(0, 500) })}
          placeholder="Cuéntame en 1-2 líneas..."
          className={inputClass + " resize-none"}
        />
      </Field>

      <Field label="¿Cuándo te queda bien la demo de 10 min? (opcional)">
        <input
          type="text"
          value={form.preferredDemoTime}
          onChange={(e) => setForm({ ...form, preferredDemoTime: e.target.value })}
          placeholder="Ej: viernes 6pm, sábado por la mañana, etc."
          className={inputClass}
        />
      </Field>

      {error && (
        <div className="rounded-xl bg-[var(--data-error-50)] border-2 border-[var(--data-error-500)] p-3 text-sm font-bold text-[var(--data-error-500)]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-white h-14 text-base font-extrabold shadow-[var(--shadow-md)] disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {submitting ? "Enviando..." : "Reservar mi demo gratis"}
      </button>

      <p className="text-xs text-center text-[var(--text-tertiary)]">
        Al enviar aceptás que Brandon te contacte por WhatsApp en las próximas 24h.
        Sin spam — un solo mensaje, vos decidís.
      </p>
    </form>
  );
}

const inputClass =
  "w-full h-12 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-[var(--text-primary)] mb-1.5 block">
        {label}
        {required && <span className="text-[var(--data-error-500)] ml-1">*</span>}
      </span>
      {children}
      {hint && (
        <span className="text-xs text-[var(--text-tertiary)] mt-1 block">{hint}</span>
      )}
    </label>
  );
}
