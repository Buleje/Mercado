"use client";

import { Mic, MicOff } from "@buleje/design-system/icons";
import type { DictadoVoz } from "@/components/admin/pos/voz/use-dictado-voz";

/** Micrófono central con ripple: habla o detiene. */
export default function DictadoMicrofono({ voz }: { voz: DictadoVoz }) {
  const { isListening, stopListening, startListening } = voz;
  return (
              <div className="flex flex-col items-center text-center mb-5">
                <button
                  onClick={() => {
                    if (isListening) stopListening();
                    else startListening();
                  }}
                  className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-full flex items-center justify-center transition-colors mb-4"
                  style={{
                    background: isListening
                      ? "var(--data-error-500)"
                      : "var(--accent)",
                    color: "white",
                  }}
                  aria-pressed={isListening}
                  aria-label={isListening ? "Detener" : "Hablar"}
                >
                  {isListening ? (
                    <>
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-[var(--data-error-500)]/40 animate-ping"
                      />
                      <span
                        aria-hidden
                        className="absolute -inset-3 rounded-full border-2 border-[var(--data-error-500)]/30"
                      />
                      <MicOff className="h-9 w-9 sm:h-10 sm:w-10 relative z-10" />
                    </>
                  ) : (
                    <Mic className="h-9 w-9 sm:h-10 sm:w-10" />
                  )}
                </button>
                <p className="text-sm font-bold text-[var(--text-secondary)]">
                  {isListening
                    ? 'Di "listo" para confirmar · "cancelar" para descartar'
                    : "Toca el micrófono o empieza a hablar"}
                </p>
              </div>
  );
}
