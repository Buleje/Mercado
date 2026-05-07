"use client";

/**
 * AdminField — wrapper canonico de label + control + hint + error.
 *
 * Acepta un solo hijo (input/textarea/select/etc) y le pone label encima,
 * hint o mensaje de error debajo.
 *
 * Tambien expone primitives `AdminInput`, `AdminTextarea` y `AdminSelect`
 * que ya vienen con la clase `ADMIN_TOKENS.input` aplicada — para no tener
 * que repetir el className en cada uso.
 */

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ADMIN_TOKENS } from "./admin-tokens";

interface AdminFieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function AdminField({
  label,
  hint,
  error,
  required,
  htmlFor,
  className = "",
  children,
}: AdminFieldProps) {
  return (
    <div className={`block ${className}`.trim()}>
      {label && (
        <label
          htmlFor={htmlFor}
          className={`${ADMIN_TOKENS.label} block mb-1.5`}
        >
          {label}
          {required && (
            <span className="text-[var(--data-error-500)] ml-1" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-[var(--data-error-500)] mt-1">{error}</p>
      ) : hint ? (
        <p className={`${ADMIN_TOKENS.hint} mt-1`}>{hint}</p>
      ) : null}
    </div>
  );
}

export function AdminInput({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...rest} className={`${ADMIN_TOKENS.input} ${className}`.trim()} />
  );
}

export function AdminTextarea({
  className = "",
  rows = 3,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      rows={rows}
      className={`${ADMIN_TOKENS.input} resize-y ${className}`.trim()}
    />
  );
}

export function AdminSelect({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`${ADMIN_TOKENS.input} ${className}`.trim()}>
      {children}
    </select>
  );
}

export default AdminField;
