"use client";

/**
 * Los campos chicos que se corrigen en la vista previa de «Importar guías
 * despachadas» antes de agregar algo al directorio (nombre, documento, placa).
 * Cada uno con su rótulo atado por `useId` (un rótulo que envuelve un
 * `<select>` le daba de nombre accesible todas sus opciones).
 */

import { useId } from "react";

const CAMPO =
  "h-11 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] sm:h-10 sm:text-sm";
const ROTULO = "mb-1 block text-xs font-semibold text-[var(--text-tertiary)]";

export function CampoTexto({
  label,
  value,
  onChange,
  mono,
  numerico,
  error,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  numerico?: boolean;
  error?: string | null;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className={ROTULO}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={numerico ? "numeric" : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${CAMPO} ${mono ? "font-mono" : ""} ${error ? "border-[var(--data-error-500)]" : ""}`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function CampoDocTipo({ value, onChange }: { value: "RUC" | "DNI" | null; onChange: (v: "RUC" | "DNI" | null) => void }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={ROTULO}>
        Documento
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "RUC" || e.target.value === "DNI" ? e.target.value : null)}
        className={CAMPO}
      >
        <option value="">Sin documento</option>
        <option value="RUC">RUC</option>
        <option value="DNI">DNI</option>
      </select>
    </div>
  );
}
