"use client";

import { Mic } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { POSVoiceInputProps } from "@/components/admin/pos/voz/voz-shared";
import { useDictadoVoz } from "@/components/admin/pos/voz/use-dictado-voz";
import DictadoPanel from "@/components/admin/pos/voz/DictadoPanel";

/**
 * POSVoiceInput — dictado por voz para agregar productos al carrito.
 *
 * Brandon mayo 2026 v7: rediseño estilo Google Assistant.
 *  - Panel grande centrado con bottom-sheet (modal) en vez de popover diminuto.
 *  - Ripple animado alrededor del micrófono cuando está escuchando.
 *  - Transcript en tipografía grande (lectura desde lejos del mostrador).
 *  - Empty state con sugerencias clickeables ("2 leches", "3 arroces").
 *  - Mensaje claro y CTA directo cuando el micrófono está bloqueado.
 *
 * Funciona con la Web Speech API nativa (es-PE). Si el navegador no la soporta,
 * el botón no se renderiza.
 *
 * Atajo: Ctrl+M para abrir/cerrar.
 */

export default function POSVoiceInput({ products, onAddToCart, onHighlightProduct }: POSVoiceInputProps) {
  const voz = useDictadoVoz({ products, onAddToCart, onHighlightProduct });
  const { isSupported, togglePanel, isListening, showPanel } = voz;

  if (!isSupported) return null;

  return (
    <>
      {/* Botón micrófono trigger */}
      <button
        onClick={togglePanel}
        className={cn(
          "relative h-10 w-10 rounded-full flex items-center justify-center transition-all border-2 shrink-0",
          isListening
            ? "bg-[var(--data-error-500)] border-[var(--data-error-500)] text-white"
            : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary hover:text-primary",
        )}
        title={showPanel ? "Cerrar dictado (Esc)" : "Dictar por voz (Ctrl+M)"}
        aria-label={showPanel ? "Cerrar dictado por voz" : "Abrir dictado por voz"}
      >
        {isListening ? (
          <>
            <Mic className="h-4 w-4 relative z-dropdown" />
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-[var(--data-error-500)]/60 animate-ping"
            />
          </>
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>

      {/* ── Panel estilo Google Assistant ─────────────────────────────── */}
      {showPanel && (
        <DictadoPanel voz={voz} onAddToCart={onAddToCart} onHighlightProduct={onHighlightProduct} />
      )}
    </>
  );
}
