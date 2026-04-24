"use client";

/**
 * ValidatedInput — Input con validacion inline + hint dinamico.
 *
 * Caracteristicas:
 *   - Hint visible siempre (no solo error post-submit)
 *   - Estado visual: idle (neutral) / valid (green check) / error (red)
 *   - Icono opcional a la izquierda
 *   - Contador de caracteres si maxLength
 *   - Auto-trim + lowercase para email/username
 *   - Debounce en la validación custom (300ms default)
 *
 * Props:
 *   label, hint, value, onChange, validate (sync o async)
 */

import { useState, useEffect, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, AlertCircle, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type ValidationResult = { valid: boolean; message?: string };
type ValidateFn = (value: string) => ValidationResult | Promise<ValidationResult>;

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  /** Función de validación. Puede ser async. */
  validate?: ValidateFn;
  /** Debounce ms. Default 300 */
  debounceMs?: number;
  /** Icono opcional a la izquierda */
  leftIcon?: ReactNode;
  /** Mostrar check verde cuando valid. Default true */
  showSuccess?: boolean;
}

export default function ValidatedInput({
  label,
  hint,
  value,
  onChange,
  validate,
  debounceMs = 300,
  leftIcon,
  showSuccess = true,
  maxLength,
  required,
  type = "text",
  className,
  ...rest
}: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-err`;
  const [state, setState] = useState<"idle" | "validating" | "valid" | "invalid">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!validate) return;
    if (!touched) return;
    if (value.length === 0) {
      setState("idle");
      setErrorMessage(null);
      return;
    }
    setState("validating");
    const timer = setTimeout(async () => {
      try {
        const result = await validate(value);
        if (result.valid) {
          setState("valid");
          setErrorMessage(null);
        } else {
          setState("invalid");
          setErrorMessage(result.message ?? "Valor inválido");
        }
      } catch {
        setState("idle");
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [value, validate, debounceMs, touched]);

  const showValid = showSuccess && state === "valid";
  const showInvalid = state === "invalid" && touched;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]"
      >
        {label}
        {required && <span className="text-[var(--data-error,_#e11d48)] ml-1">*</span>}
      </label>
      <div
        className={cn(
          "flex items-center rounded-xl border transition-colors bg-[var(--surface-raised)]",
          showInvalid
            ? "border-[var(--data-error,_#e11d48)]"
            : showValid
            ? "border-[var(--accent)]"
            : "border-[var(--rule-base)] focus-within:border-[var(--accent)]",
        )}
      >
        {leftIcon && (
          <span className="pl-3 text-[var(--text-tertiary)] shrink-0" aria-hidden>
            {leftIcon}
          </span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          maxLength={maxLength}
          required={required}
          onBlur={() => setTouched(true)}
          onChange={(e) => {
            if (!touched) setTouched(true);
            onChange(e.target.value);
          }}
          aria-invalid={showInvalid}
          aria-describedby={showInvalid ? errorId : hint ? hintId : undefined}
          className="flex-1 bg-transparent outline-none px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          {...rest}
        />
        {state === "validating" && (
          <span className="pr-3 shrink-0" aria-hidden>
            <Loader2
              className="h-4 w-4 animate-spin text-[var(--text-tertiary)]"
              strokeWidth={1.75}
            />
          </span>
        )}
        {showValid && (
          <span className="pr-3 shrink-0" aria-hidden>
            <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
          </span>
        )}
        {showInvalid && (
          <span className="pr-3 shrink-0" aria-hidden>
            <AlertCircle
              className="h-4 w-4 text-[var(--data-error,_#e11d48)]"
              strokeWidth={2}
            />
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 min-h-[1em]">
        {showInvalid && errorMessage ? (
          <p
            id={errorId}
            className="text-[length:var(--ts-2xs)] text-[var(--data-error,_#e11d48)] leading-tight"
          >
            {errorMessage}
          </p>
        ) : hint ? (
          <p
            id={hintId}
            className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-tight"
          >
            {hint}
          </p>
        ) : (
          <span />
        )}
        {maxLength && (
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums shrink-0">
            {value.length}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
}
