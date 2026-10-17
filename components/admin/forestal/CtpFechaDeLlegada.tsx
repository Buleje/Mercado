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
 * - Rojo con casilla = la guía ya había vencido (ADR-434 §Vencimiento): se
 *   guarda sólo tildando «Confirmo que llegó después del vencimiento» y
 *   diciendo por qué (`ConfirmarVencida`).
 * - Ámbar = se puede, pero conviene mirar (corridas del permiso anteriores,
 *   plazo de registro).
 */

import { AlertCircle, AlertTriangle, CalendarOff } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  MIN_MOTIVO_VENCIDA,
  TEXTO_FUENTE,
  ddmm,
  type PropuestaDeLlegada,
  type RevisionDeLlegada,
  type VencidaAlLlegar,
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
  vencimiento,
  rotulo = "Llegó el",
  nota,
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
  /** El vencimiento de la guía, si el papel lo trae: se muestra, no limita el campo. */
  vencimiento?: string | null;
  /** El título del campo; «Misma fecha para todas» lo usa arriba del bloque. */
  rotulo?: string;
  /** Reemplaza la línea de abajo («propuesta: …» / «elegida a mano»). */
  nota?: string;
}) {
  const esPropuesta = propuesta != null && valor === propuesta.dia;
  return (
    <div className="block text-sm">
      <span className="mb-1 flex items-center gap-1 font-bold text-[var(--text-secondary)]">
        <label htmlFor={id}>{rotulo}</label>
        <InfoTip
          icono="ayuda"
          title="Fecha real de llegada"
          what="El día que la madera bajó en la planta. Es la fecha con la que sus trozas pueden entrar a la sierra."
          affects="Una corrida de un día anterior no puede usar trozas de esta guía."
          example={
            propuesta
              ? `Se propone ${ddmm(propuesta.dia)}: ${TEXTO_FUENTE[propuesta.fuente]}.`
              : undefined
          }
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
        {nota ??
          (esPropuesta && propuesta
            ? `propuesta: ${TEXTO_FUENTE[propuesta.fuente]}`
            : "elegida a mano")}
        {vencimiento ? ` · la guía vence el ${ddmm(vencimiento)}` : ""}
      </span>
    </div>
  );
}

/**
 * La llegada cae después del vencimiento de la guía (ADR-434 §Vencimiento).
 * No es un bloqueo mudo: si la madera de verdad llegó así, el libro tiene que
 * poder decirlo. Pero no en silencio —se tilda y se escribe por qué— y el
 * servidor pide lo mismo (`aceptaVencida` + motivo) y lo deja auditado.
 */
export function ConfirmarVencida({
  id,
  vencida,
  acepta,
  motivo,
  onCambio,
  disabled,
}: {
  id: string;
  vencida: VencidaAlLlegar;
  acepta: boolean;
  motivo: string;
  onCambio: (parche: { aceptaVencida?: boolean; motivoVencida?: string }) => void;
  disabled?: boolean;
}) {
  const faltaMotivo = acepta && motivo.trim().length < MIN_MOTIVO_VENCIDA;
  return (
    <div className="mt-2 space-y-2 rounded-lg border-2 border-[var(--data-error-500)]/60 bg-[var(--data-error-500)]/10 p-2">
      <p
        role="alert"
        className="flex items-start gap-1.5 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
      >
        <CalendarOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{vencida.mensaje}</span>
      </p>
      <div className="flex min-h-11 items-center gap-2">
        <label
          className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 text-sm font-bold text-[var(--text-primary)]"
          htmlFor={`${id}-acepta`}
        >
          <input
            id={`${id}-acepta`}
            type="checkbox"
            checked={acepta}
            disabled={disabled}
            onChange={(e) => onCambio({ aceptaVencida: e.target.checked })}
            className="h-5 w-5 shrink-0 accent-[var(--data-error-500)]"
          />
          Confirmo que llegó después del vencimiento
        </label>
        <InfoTip
          icono="ayuda"
          title="Qué confirmas"
          what={`Que la madera bajó después del ${ddmm(vencida.vencimiento)}, con la guía ya vencida. Queda así en el libro y en el rastro, a tu nombre, con el motivo.`}
          affects={
            vencida.expedicion
              ? `Si llegó antes, no tildes: pon la fecha real, entre el ${ddmm(vencida.expedicion)} y el ${ddmm(vencida.vencimiento)}.`
              : `Si llegó antes, no tildes: pon la fecha real, hasta el ${ddmm(vencida.vencimiento)}.`
          }
          example="El camión se quedó varado dos días por la lluvia en la carretera."
        />
      </div>
      {acepta && (
        <label className="block text-sm" htmlFor={`${id}-motivo`}>
          <span className="mb-1 block font-bold text-[var(--text-secondary)]">
            Por qué llegó después (obligatorio)
          </span>
          <input
            id={`${id}-motivo`}
            type="text"
            value={motivo}
            maxLength={300}
            disabled={disabled}
            onChange={(e) => onCambio({ motivoVencida: e.target.value })}
            placeholder="ej: el camión se quedó varado por la lluvia"
            aria-invalid={faltaMotivo || undefined}
            className={`${CAMPO} ${faltaMotivo ? "border-[var(--data-error-500)]" : ""}`}
          />
        </label>
      )}
    </div>
  );
}

/** El bloqueo (rojo) y los avisos (ámbar) de esa fecha. Nada que decir = nada. */
export function AvisosDeLlegada({
  revision,
  mostrarBloqueo = true,
}: {
  revision: RevisionDeLlegada | null;
  mostrarBloqueo?: boolean;
}) {
  if (!revision) return null;
  const { avisos } = revision;
  /* La vencida sin confirmar la dice `ConfirmarVencida`, con su casilla: acá se repetiría. */
  const bloqueo = revision.bloqueo?.codigo === "GUIA_VENCIDA" ? null : revision.bloqueo;
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
