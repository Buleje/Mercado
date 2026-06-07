"use client";

import { Hash, User, Phone, Loader2, CheckCircle2, AlertCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DniLookupState } from "../types";

/**
 * CustomerFormFields — los inputs DNI / Nombre / Teléfono.
 * El componente es controlado: padre maneja el state.
 *
 * Rediseño 2026-05-05: inputs h-12 con icono brand-tinted, labels más
 * legibles, estados de validación con borde brand/success/error,
 * tokens del DS (no más gray-200 hardcoded). Layout vertical en mobile
 * y 3-col en md+ para no apretar.
 */

export type PhoneValidation = {
  valid: boolean;
  hint: string;
  color: string;
};

export type CustomerFormFieldsProps = {
  dni: string;
  name: string;
  phone: string;
  dniLookup: DniLookupState;
  phoneValidation: PhoneValidation;
  onDniChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
};

/** Wrapper de input con icono left + estado validation. */
function FieldShell({
  label,
  required,
  hint,
  hintTone = "neutral",
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  hintTone?: "neutral" | "success" | "error";
  children: React.ReactNode;
}) {
  const hintColor =
    hintTone === "error"
      ? "text-[var(--data-error-600)]"
      : hintTone === "success"
        ? "text-[var(--data-success-600)]"
        : "text-muted";
  return (
    <div className="space-y-1.5">
      <label
        className="flex items-center gap-1 text-xs font-extrabold uppercase tracking-wider"
        style={{ color: "var(--color-primary-dark, #009690)" }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--color-primary, #00A0A0)" }}>*</span>
        )}
      </label>
      {children}
      {hint && (
        <p
          className={cn(
            "text-xs font-medium flex items-center gap-1",
            hintColor,
          )}
        >
          {hintTone === "error" && (
            <AlertCircle className="h-3 w-3 shrink-0" strokeWidth={2.25} />
          )}
          {hint}
        </p>
      )}
    </div>
  );
}

export function CustomerFormFields({
  dni,
  name,
  phone,
  dniLookup,
  phoneValidation,
  onDniChange,
  onNameChange,
  onPhoneChange,
}: CustomerFormFieldsProps) {
  const dniBorder =
    dniLookup.status === "success"
      ? "border-[var(--data-success-500)]"
      : dniLookup.status === "error"
        ? "border-[var(--data-error-500)]"
        : "border-[var(--rule-soft)] focus:border-[var(--color-primary,#00A0A0)]";

  const phoneBorder =
    phone.length === 0
      ? "border-[var(--rule-soft)] focus:border-[var(--color-primary,#00A0A0)]"
      : phoneValidation.valid
        ? "border-[var(--data-success-500)]"
        : "border-[var(--rule-soft)] focus:border-[var(--color-primary,#00A0A0)]";

  const inputBase =
    "w-full h-12 rounded-xl border-2 bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-muted/60 focus:outline-none transition-colors text-base tabular-nums";

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {/* DNI */}
      <FieldShell
        label="DNI"
        hint={dniLookup.message || undefined}
        hintTone={
          dniLookup.status === "error"
            ? "error"
            : dniLookup.status === "success"
              ? "success"
              : "neutral"
        }
      >
        <div className="relative">
          <Hash
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
            strokeWidth={2}
            style={{ color: "var(--color-primary, #00A0A0)" }}
          />
          <input
            value={dni}
            onChange={(e) =>
              onDniChange(e.target.value.replace(/[^\d]/g, "").slice(0, 8))
            }
            placeholder="12345678"
            inputMode="numeric"
            maxLength={8}
            data-testid="dni-input"
            className={cn(inputBase, "pl-10 pr-10", dniBorder)}
          />
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
            {dniLookup.status === "loading" ? (
              <Loader2
                className="h-4 w-4 animate-spin"
                style={{ color: "var(--color-primary, #00A0A0)" }}
              />
            ) : dniLookup.status === "success" ? (
              <CheckCircle2
                className="h-4 w-4"
                strokeWidth={2.5}
                style={{ color: "var(--data-success-600)" }}
              />
            ) : null}
          </span>
        </div>
      </FieldShell>

      {/* Nombre */}
      <FieldShell label="Nombre completo" required>
        <div className="relative">
          <User
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
            strokeWidth={2}
            style={{ color: "var(--color-primary, #00A0A0)" }}
          />
          <input
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="María García"
            data-testid="name-input"
            className={cn(
              inputBase,
              "pl-10 pr-3",
              "border-[var(--rule-soft)] focus:border-[var(--color-primary,#00A0A0)]",
            )}
          />
        </div>
      </FieldShell>

      {/* Teléfono */}
      <FieldShell
        label="Teléfono"
        hint={
          phone.length > 0 && phoneValidation.hint
            ? phoneValidation.hint
            : undefined
        }
        hintTone={
          phone.length > 0
            ? phoneValidation.valid
              ? "success"
              : "error"
            : "neutral"
        }
      >
        <div className="relative">
          <Phone
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
            strokeWidth={2}
            style={{ color: "var(--color-primary, #00A0A0)" }}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="987 654 321"
            maxLength={9}
            data-testid="phone-input"
            className={cn(inputBase, "pl-10 pr-10", phoneBorder)}
          />
          {phone.length > 0 && phoneValidation.valid && (
            <CheckCircle2
              className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
              strokeWidth={2.5}
              style={{ color: "var(--data-success-600)" }}
            />
          )}
        </div>
      </FieldShell>
    </div>
  );
}
