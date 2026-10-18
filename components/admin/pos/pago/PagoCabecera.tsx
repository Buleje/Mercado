"use client";

import { X, Volume2, VolumeX } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { CabeceraPropia } from "@/components/admin/shared/AdminModal";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

const BOTON_ICONO =
  "grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

/**
 * Cabecera fina del cobro (56 px): voz del total, «Cobrar» y la X. El total ya
 * no va acá — se dice una sola vez, grande, en «La venta». Es el asa para mover
 * la ventana (`CabeceraPropia`) y queda pegada arriba si el cuerpo scrollea.
 */
export default function PagoCabecera({ p }: { p: PagoModal }) {
  const { onCancel, voiceEnabled, setVoiceEnabled } = p;
  return (
    <CabeceraPropia
      className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 sm:px-4"
      acciones={
        <button type="button" onClick={onCancel} aria-label="Cerrar" title="Cerrar (Esc)" className={BOTON_ICONO}>
          <X className="h-5 w-5" />
        </button>
      }
    >
      <button
        type="button"
        onClick={() => {
          const next = !voiceEnabled;
          setVoiceEnabled(next);
          try {
            localStorage.setItem("pos-voice-total", String(next));
          } catch {
            /* sin almacenamiento: la voz vale sólo para esta ventana */
          }
        }}
        className={BOTON_ICONO}
        title={voiceEnabled ? "Desactivar voz" : "Activar voz"}
        aria-label={voiceEnabled ? "Desactivar voz del total" : "Activar voz del total"}
        aria-pressed={voiceEnabled}
      >
        {voiceEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </button>
      <CardTitle as="h2" className="min-w-0 flex-1 truncate">
        Cobrar
      </CardTitle>
    </CabeceraPropia>
  );
}
