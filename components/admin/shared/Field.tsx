"use client";

/**
 * Field — asocia un <label> con su control de forma accesible (a11y).
 *
 * Raíz del fix de los ~726 warnings `jsx-a11y/label-has-associated-control`
 * del admin: el patrón histórico era `<label>Texto</label><input/>` (label
 * suelto, hermano del input → screen readers no lo asocian, click en el label
 * no enfoca el input). Este componente genera un id con useId() y lo cablea
 * tanto al <label htmlFor> como al control, sin cambiar nada visual.
 *
 * Dos formas de uso:
 *   1. Render-prop (robusto, para controles envueltos o múltiples):
 *        <Field label="Nombre">{(id) => <input id={id} className={...} />}</Field>
 *   2. Drop-in de un solo control (se le inyecta el id por cloneElement):
 *        <Field label="Nombre"><input className={...} value={...} onChange={...} /></Field>
 *
 * El default de `labelClassName` calca el FIELD_LABEL estándar del admin
 * (block text-xs font-semibold mb-1.5) → migración sin cambio visual.
 */

import {
  useId,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
import { cn } from "@/lib/utils";

/** Clase de label estándar del admin (calca el FIELD_LABEL histórico). */
export const FIELD_LABEL_CLASS =
  "block text-xs font-semibold text-[var(--text-secondary)] mb-1.5";

interface FieldProps {
  /** Texto (o nodo) del label. */
  label: ReactNode;
  /** id explícito; si se omite se genera con useId(). */
  htmlFor?: string;
  /** Marca el campo como requerido (asterisco + aria). */
  required?: boolean;
  /** Texto de ayuda debajo del control (se cablea con aria-describedby). */
  hint?: ReactNode;
  /** Mensaje de error (role="alert"); tiene prioridad sobre hint. */
  error?: ReactNode;
  /** Clase del wrapper externo. */
  className?: string;
  /** Override del label (default = FIELD_LABEL_CLASS). */
  labelClassName?: string;
  /**
   * Control del campo. Función `(id) => ReactNode` (preferido) o un único
   * elemento al que se le inyecta `id` + `aria-describedby` por cloneElement.
   */
  children: ReactNode | ((id: string) => ReactNode);
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  labelClassName,
  children,
}: FieldProps) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  const descId = hint || error ? `${id}-desc` : undefined;

  let control: ReactNode;
  if (typeof children === "function") {
    control = children(id);
  } else if (isValidElement(children)) {
    const child = children as ReactElement<{
      id?: string;
      "aria-describedby"?: string;
    }>;
    control = cloneElement(child, {
      id: child.props.id ?? id,
      "aria-describedby": child.props["aria-describedby"] ?? descId,
    });
  } else {
    control = children;
  }

  return (
    <div className={className}>
      <label htmlFor={id} className={cn(labelClassName ?? FIELD_LABEL_CLASS)}>
        {label}
        {required && (
          <span className="text-[var(--data-error)] ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <div id={descId} className="mt-1 text-xs text-[var(--text-tertiary)]">
          {hint}
        </div>
      )}
      {error && (
        <div
          id={descId}
          role="alert"
          className="mt-1 text-xs text-[var(--data-error)]"
        >
          {error}
        </div>
      )}
    </div>
  );
}

export default Field;
