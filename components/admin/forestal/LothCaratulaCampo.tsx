"use client";

/**
 * Un campo de la carátula: etiqueta, control, y debajo lo que hay que saber —
 * el error que bloquea, el aviso que no, y de dónde salió el dato si vino
 * propuesto. El mensaje va enlazado con `aria-describedby` y el error también
 * en texto (nunca sólo el borde rojo).
 */

import { useId } from "react";
import { Sparkles } from "@buleje/design-system/icons";
import { ETIQUETA_ORIGEN, ETIQUETA_ORIGEN_CORTA, type OrigenPropuesta } from "@/lib/forestal/loth-caratula-pasos";

export const CLS_CONTROL =
  "w-full h-11 sm:h-10 rounded-lg border bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20 placeholder:text-[var(--text-tertiary)]";

interface CampoProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  aviso?: string | null;
  propuesto?: OrigenPropuesta;
  /** Recibe lo que el control necesita para quedar enlazado (id y descripción). */
  children: (a: { id: string; describedBy?: string; className: string; invalid: boolean }) => React.ReactNode;
}

export function Campo({ label, required, hint, error, aviso, propuesto, children }: CampoProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  const mensaje = error ?? aviso ?? hint ?? null;
  const invalid = Boolean(error);
  const borde = invalid
    ? "border-[var(--data-error-600)]"
    : propuesto
      ? "border-[var(--accent)]/60"
      : "border-[var(--rule-base)]";
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-[var(--text-primary)]">
        <span>
          {label}
          {required && <span className="ml-1 text-[var(--data-error-600)]" aria-hidden="true">*</span>}
        </span>
        {propuesto && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-dark)] dark:text-[var(--accent)]"
            title={ETIQUETA_ORIGEN[propuesto]}
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {ETIQUETA_ORIGEN_CORTA[propuesto]}
          </span>
        )}
      </label>
      {children({ id, describedBy: mensaje ? msgId : undefined, className: `${CLS_CONTROL} ${borde}`, invalid })}
      {mensaje && (
        <span
          id={msgId}
          className={`mt-1 block text-xs ${
            error
              ? "font-semibold text-[var(--data-error-700)]"
              : aviso
                ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                : "text-[var(--text-tertiary)]"
          }`}
        >
          {mensaje}
        </span>
      )}
    </div>
  );
}
