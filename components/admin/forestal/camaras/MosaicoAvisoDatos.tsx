"use client";

/**
 * El aviso de batería y datos del mosaico «Ver todas en vivo» (sale de
 * `MosaicoNube`, que pasaba las 300 líneas): cuánto gasta, «No pausar» y el
 * enlace al Modo TV.
 */

import { Battery, Tv } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DATOS_POR_HORA, MINUTOS_SIN_TOCAR } from "./hik-connect-teams";
import { vecesMas } from "./use-mosaico-nube";

/** El aviso de batería y datos; con «No pausar», el de datos por hora. */
export default function AvisoDatos({
  camaras,
  sinPausa,
  onVerEnTv,
}: {
  camaras: number;
  sinPausa: boolean;
  onVerEnTv?: () => void;
}) {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
      <Battery className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
      <span className="min-w-0 flex-1">
        {sinPausa
          ? `Sin pausa: cada cámara gasta ${DATOS_POR_HORA} de su chip hasta que cierres.`
          : `Gasta ${vecesMas(camaras)} de batería y datos mientras está abierto.`}
      </span>
      <InfoTip
        title="Batería y datos"
        what={`Cada cámara transmite a la vez y gasta ${DATOS_POR_HORA} de su chip (SD gasta menos que HD).`}
        affects={`Si nadie toca el mosaico por ${MINUTOS_SIN_TOCAR} minutos, se pausan todas (salvo con «No pausar»). Minimizar NO corta: cerrar sí.`}
        example="Para mirar una sola con calma, cierra esto y usa «En vivo» de esa cámara."
      />
      {onVerEnTv && (
        <button
          type="button"
          onClick={onVerEnTv}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-[var(--accent-ink)] underline-offset-4 hover:underline dark:text-[var(--accent)]"
          title="El Modo TV muestra las cámaras en el navegador del televisor"
        >
          <Tv className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Verlo en el televisor</span>
        </button>
      )}
    </p>
  );
}
