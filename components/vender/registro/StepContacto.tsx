"use client";

/**
 * StepContacto — wizard step 2: WhatsApp (+51 prefix), email, responsable (nombre + DNI).
 */

import type { ContactoForm } from "@/lib/validators/vendor-registration";
import { MessageCircle, Mail, User } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";

interface StepContactoProps {
  value: Partial<ContactoForm>;
  errors: Partial<Record<keyof ContactoForm, string>>;
  onChange: (patch: Partial<ContactoForm>) => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs font-medium text-[var(--data-error)]" role="alert">
      {message}
    </p>
  );
}

const inputClass =
  "block w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors focus:border-[var(--text-primary)]";

export default function StepContacto({
  value,
  errors,
  onChange,
}: StepContactoProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <User className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.5} aria-hidden="true" />
          ¿Cómo te contactamos?
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Para avisarte de pedidos, preguntas de clientes y transferencias.
        </p>
      </header>

      <div className="space-y-4">
        {/* WhatsApp con prefix */}
        <div>
          <label
            htmlFor="whatsapp"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            <MessageCircle className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            WhatsApp
          </label>
          <div className="flex gap-2">
            <span className="inline-flex items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm font-semibold text-[var(--text-secondary)]">
              +51
            </span>
            <input
              id="whatsapp"
              type="tel"
              inputMode="numeric"
              placeholder="916409675"
              maxLength={9}
              value={value.whatsapp ?? ""}
              onChange={(e) =>
                onChange({ whatsapp: e.target.value.replace(/\D/g, "") })
              }
              className={cn(
                inputClass,
                "font-mono tabular-nums",
                errors.whatsapp && "border-[var(--data-error)]",
              )}
            />
          </div>
          <FieldError message={errors.whatsapp} />
          <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Los pedidos te llegan aquí. Tenelo siempre prendido.
          </p>
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            <Mail className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="tu@email.com"
            value={value.email ?? ""}
            onChange={(e) => onChange({ email: e.target.value })}
            className={cn(inputClass, errors.email && "border-[var(--data-error)]")}
          />
          <FieldError message={errors.email} />
        </div>

        {/* Responsable */}
        <div className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Responsable del negocio
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label
                htmlFor="responsableNombre"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
              >
                Nombre y apellidos
              </label>
              <input
                id="responsableNombre"
                type="text"
                placeholder="Pedro Ramírez"
                value={value.responsableNombre ?? ""}
                onChange={(e) =>
                  onChange({ responsableNombre: e.target.value })
                }
                className={cn(
                  inputClass,
                  errors.responsableNombre && "border-[var(--data-error)]",
                )}
              />
              <FieldError message={errors.responsableNombre} />
            </div>
            <div>
              <label
                htmlFor="responsableDni"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
              >
                DNI
              </label>
              <input
                id="responsableDni"
                type="text"
                inputMode="numeric"
                placeholder="12345678"
                maxLength={8}
                value={value.responsableDni ?? ""}
                onChange={(e) =>
                  onChange({ responsableDni: e.target.value.replace(/\D/g, "") })
                }
                className={cn(
                  inputClass,
                  "font-mono tabular-nums",
                  errors.responsableDni && "border-[var(--data-error)]",
                )}
              />
              <FieldError message={errors.responsableDni} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
