/**
 * Las piezas chicas de «Nueva línea» del LO-TH (`LothEntryForm`): el campo con
 * su rótulo, la casilla de la grilla, la pastilla CITES, la clase del input y
 * el nombre del plan. Aparte para que el formulario se lea sin 90 líneas de
 * presentación al final.
 */

import type { ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { permisoConSigla } from "@/lib/forestal/loth-tipos-plan";

/**
 * «Plan PO 12 — Maderera El Aguajal SAC». El número del plan muchas veces ya
 * trae el tipo («PO 12»): `permisoConSigla` no lo repite («Plan PO PO 12»).
 */
export function etiquetaPlan(p: { planType: string; planNumber: string | null; titularName: string }): string {
  return `Plan ${permisoConSigla(p.planType, p.planNumber)} — ${p.titularName}`;
}

/**
 * Un campo con su rótulo. `min-h-6` en el rótulo: el ⓘ mide 24 px y un rótulo
 * sin ayuda, 20 — sin igualarlos, las cajas de una misma fila de la grilla
 * arrancan 4 px corridas.
 */
export function Field({ label, required, hint, className = "", children }: { label: string; required?: boolean; hint?: string; className?: string; children: ReactNode }) {
  const rotulo = (
    <>
      {label}
      {required && <span className="text-[var(--data-error-600)]">*</span>}
    </>
  );
  if (!hint) {
    return (
      <label className={`block ${className}`}>
        <span className="mb-1 flex min-h-6 items-center gap-1 text-sm font-medium text-[var(--text-primary)]">{rotulo}</span>
        {children}
      </label>
    );
  }
  /* Con ayuda, el ⓘ va FUERA del <label>: adentro, el campo se anunciaba
     «Código de troza Información: Código de troza» y buscarlo por su rótulo
     encontraba el botón. El <label> conserva el nombre para el lector. */
  return (
    <div className={`block ${className}`}>
      <div className="mb-1 flex min-h-6 items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
        <span aria-hidden="true" className="flex items-center gap-1">{rotulo}</span>
        <InfoTip icono="ayuda" title={label} what={hint} />
      </div>
      <label className="block">
        <span className="sr-only">{label}</span>
        {children}
      </label>
    </div>
  );
}

/**
 * Casilla de la grilla: la altura de un input y pegada abajo (`self-end`), para
 * que quede a la par del campo de al lado. A 400 px ocupa la fila entera: en
 * media fila el rótulo partía en tres renglones.
 */
export function Casilla({
  checked,
  onChange,
  acento = "marca",
  title,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  acento?: "marca" | "error";
  title?: string;
  children: ReactNode;
}) {
  return (
    <label
      title={title}
      className="col-span-6 flex h-10 cursor-pointer items-center gap-2 self-end rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] sm:col-span-3"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`h-4 w-4 shrink-0 ${acento === "error" ? "accent-[var(--data-error-600)]" : "accent-[var(--accent-dark)]"}`}
      />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

export function CitesPill() {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-error-700)]">
      CITES
    </span>
  );
}

export const cls = {
  input:
    "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]",
};
