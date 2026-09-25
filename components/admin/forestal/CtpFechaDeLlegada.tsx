"use client";

/**
 * La fecha de llegada de UNA guía, con lo que esa fecha implica (ADR-434).
 *
 * La usan «Recibir en bloque» y «Corregir la recepción»: el mismo campo, la
 * misma regla (`revisarLlegada`) y los mismos avisos, así una guía no dice una
 * cosa al recibirla y otra al corregirla.
 *
 * - Rojo = no se puede guardar (futura, antes de la guía, mes cerrado, una
 *   corrida que ya aserró sus trozas).
 * - Ámbar = se puede, pero conviene mirar (corridas del permiso anteriores,
 *   plazo de registro).
 */

import { AlertCircle, AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  TEXTO_FUENTE,
  ddmm,
  type PropuestaDeLlegada,
  type RevisionDeLlegada,
} from "@/lib/forestal/fecha-de-llegada";

const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] tabular-nums transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export function CampoFechaDeLlegada({
  id,
  valor,
  onCambio,
  propuesta,
  min,
  max,
  disabled,
  invalido,
}: {
  id: string;
  valor: string;
  onCambio: (v: string) => void;
  propuesta: PropuestaDeLlegada | null;
  /** La fecha de la guía: antes no pudo llegar. */
  min?: string | null;
  /** Hoy en Lima. */
  max: string;
  disabled?: boolean;
  invalido?: boolean;
}) {
  const esPropuesta = propuesta != null && valor === propuesta.dia;
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="mb-1 flex items-center gap-1 font-bold text-[var(--text-secondary)]">
        Llegó el
        <InfoTip
          icono="ayuda"
          title="Fecha real de llegada"
          what="El día que la madera bajó en la planta. Es la fecha con la que sus trozas pueden entrar a la sierra."
          affects="Una corrida de un día anterior no puede usar trozas de esta guía."
          example={propuesta ? `Se propone ${ddmm(propuesta.dia)}: ${TEXTO_FUENTE[propuesta.fuente]}.` : undefined}
        />
      </span>
      <input
        id={id}
        type="date"
        value={valor}
        min={min ?? undefined}
        max={max}
        disabled={disabled}
        onChange={(e) => onCambio(e.target.value)}
        aria-invalid={invalido || undefined}
        className={`${CAMPO} ${invalido ? "border-[var(--data-error-500)]" : ""}`}
      />
      <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
        {esPropuesta && propuesta ? `propuesta: ${TEXTO_FUENTE[propuesta.fuente]}` : "elegida a mano"}
      </span>
    </label>
  );
}

/** El bloqueo (rojo) y los avisos (ámbar) de esa fecha. Nada que decir = nada. */
export function AvisosDeLlegada({ revision, mostrarBloqueo = true }: { revision: RevisionDeLlegada | null; mostrarBloqueo?: boolean }) {
  if (!revision) return null;
  const { bloqueo, avisos } = revision;
  if (!(bloqueo && mostrarBloqueo) && avisos.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {bloqueo && mostrarBloqueo && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg bg-[var(--data-error-500)]/12 px-2 py-1 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{bloqueo.mensaje}</span>
        </p>
      )}
      {avisos.map((a) => (
        <p
          key={a}
          className="flex items-start gap-1.5 rounded-lg bg-[var(--data-warning-500)]/15 px-2 py-1 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{a}</span>
        </p>
      ))}
    </div>
  );
}
