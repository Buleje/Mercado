"use client";

/**
 * Aviso ANTES de guardar una tala que deja a su especie por encima del cupo
 * (T9). No bloquea sin salida: el libro tiene que reflejar lo que pasó en el
 * monte.
 *  · Contra lo AUTORIZADO (`obligatorio`): casilla + motivo, que quedan en la
 *    línea y en la auditoría.
 *  · Contra el CENSO: aviso en ámbar, motivo opcional. El censo puede estar
 *    incompleto; la ruta lo audita igual.
 * La ruta recalcula el cupo: esto sólo pregunta.
 */

import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { MOTIVO_CUPO_MIN, limpiarMotivo, motivoCupoValido } from "@/lib/forestal/loth-cupo-especie";

interface Props {
  /** «Con este árbol, Tornillo llega a 154 % de lo censado (9.537 de 6.200 m³).» */
  mensaje: string;
  /** Contra lo autorizado: casilla y motivo obligatorios. */
  obligatorio: boolean;
  confirmado: boolean;
  onConfirmado: (v: boolean) => void;
  motivo: string;
  onMotivo: (v: string) => void;
}

const CAJA_ROJA =
  "border-[var(--data-error-500)]/60 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]";
const CAJA_AMBAR =
  "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";

export default function LothAvisoCupo({ mensaje, obligatorio, confirmado, onConfirmado, motivo, onMotivo }: Props) {
  // El mismo criterio que la ruta: letras de verdad, no «.....» ni invisibles.
  const corto = limpiarMotivo(motivo).length > 0 && !motivoCupoValido(motivo);
  return (
    <div
      role={obligatorio ? "alert" : "status"}
      data-aviso-cupo={obligatorio ? "autorizado" : "censo"}
      className={`space-y-2 rounded-xl border-2 px-3 py-2.5 text-sm ${obligatorio ? CAJA_ROJA : CAJA_AMBAR}`}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <b>{obligatorio ? "Pasa lo autorizado para la especie." : "Pasa lo censado de la especie."}</b> {mensaje}
        </div>
        <InfoTip
          title="Cupo de la especie"
          what="El cupo es el volumen que el plan autoriza para la especie; si el plan no lo trae, lo que estimó el censo."
          affects="Talar por encima es lo que cruza OSINFOR contra el plan. Si igual pasó en el monte, se registra con el motivo: el libro no puede callarlo."
          example="Tornillo: 2 árboles censados con 6,2 m³; talados con 9,537 m³ → 154 %."
        />
      </div>
      {obligatorio && (
        <label className="flex items-start gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(e) => onConfirmado(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--data-error-500)]"
          />
          <span>Confirmo que este árbol se taló así y lo registro por encima de lo autorizado</span>
        </label>
      )}
      <input
        value={motivo}
        onChange={(e) => onMotivo(e.target.value)}
        maxLength={500}
        placeholder={obligatorio ? "Motivo (ej. ampliación de volumen en trámite N°…)" : "Motivo, si lo sabes (ej. el censo no incluyó todos los árboles)"}
        aria-label="Motivo de la tala por encima del cupo de la especie"
        aria-invalid={corto || undefined}
        className={`h-10 w-full rounded-lg border-2 bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] ${obligatorio ? "border-[var(--data-error-500)]/50" : "border-[var(--data-warning-500)]/50"}`}
      />
      <p className="text-xs font-semibold opacity-80">
        {corto
          ? `Escribe un motivo de ${MOTIVO_CUPO_MIN} letras o más.`
          : obligatorio
            ? "Con la casilla y el motivo la línea se registra, y el motivo queda en el libro y en la auditoría."
            : "Se registra igual. El censo puede no tener todos los árboles; el aviso queda en la auditoría."}
      </p>
    </div>
  );
}
