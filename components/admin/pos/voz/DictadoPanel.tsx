"use client";

import { Mic, X, Plus } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { POSVoiceInputProps } from "@/components/admin/pos/voz/voz-shared";
import type { DictadoVoz } from "@/components/admin/pos/voz/use-dictado-voz";
import DictadoMicrofono from "@/components/admin/pos/voz/DictadoMicrofono";
import DictadoAvisos from "@/components/admin/pos/voz/DictadoAvisos";
import DictadoLineas from "@/components/admin/pos/voz/DictadoLineas";
import DictadoReconocidos from "@/components/admin/pos/voz/DictadoReconocidos";

/** Panel del dictado estilo Google Assistant: cabecera, cuerpo y pie. */
export default function DictadoPanel({
  voz,
  onAddToCart,
  onHighlightProduct,
}: {
  voz: DictadoVoz;
  onAddToCart: POSVoiceInputProps["onAddToCart"];
  onHighlightProduct?: POSVoiceInputProps["onHighlightProduct"];
}) {
  const { isListening, processing, items, panelRef, cerrarPanel, stopListening, setShowPanel, addAllItems } = voz;
  return (
        <div
          className="fixed inset-0 z-system bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
          onClick={cerrarPanel}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Dictado por voz"
            aria-modal="true"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-[36rem] bg-[var(--surface-raised)] rounded-3xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)] overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <header className="px-5 sm:px-6 py-4 flex items-start justify-between gap-3 border-b border-[var(--rule-soft)]">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "h-11 w-11 rounded-2xl flex items-center justify-center shrink-0",
                    isListening
                      ? "bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]"
                      : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
                  )}
                >
                  <Mic className="h-5 w-5" strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
                    Dictado por voz
                  </p>
                  <div className="flex items-center gap-1">
                  <SectionTitle as="h2" className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)] leading-tight">
                    {isListening
                      ? "Escuchando…"
                      : processing
                        ? "Procesando…"
                        : items.length > 0
                          ? "Productos reconocidos"
                          : 'Di los productos que necesitas'}
                  </SectionTitle>
                  <InfoTip
                    ariaLabel="Qué puedes decir"
                    what="Di cantidad y producto: cada frase se busca en tu inventario al instante y aparece abajo, lista para agregar."
                    affects="«listo» termina · «borra eso» quita lo último · «cancelar» descarta todo."
                    example="«2 leches y 3 arroces» → 2 Leche Gloria y 3 Arroz Costeño. Ctrl+M abre y cierra el dictado."
                  />
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  stopListening();
                  setShowPanel(false);
                  onHighlightProduct?.(null);
                }}
                className="h-10 w-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Body — scroll si hay muchos items */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 sm:py-6">
              <DictadoMicrofono voz={voz} />
              <DictadoAvisos voz={voz} />
              <DictadoLineas voz={voz} onAddToCart={onAddToCart} />
              <DictadoReconocidos voz={voz} />
            </div>

            {/* Footer */}
            <footer className="px-5 sm:px-6 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[var(--text-tertiary)] hidden sm:block">
                <kbd className="rounded bg-[var(--surface-raised)] border border-[var(--rule-base)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs,0.6875rem)]">
                  Ctrl+M
                </kbd>{" "}
                abre · <kbd className="rounded bg-[var(--surface-raised)] border border-[var(--rule-base)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs,0.6875rem)]">Esc</kbd> cierra
              </p>
              {items.some((i) => i.matchedProductId) ? (
                <button
                  onClick={addAllItems}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[var(--accent)] text-white text-sm font-extrabold hover:opacity-90 transition-opacity"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Agregar todo al carrito
                </button>
              ) : (
                <span className="text-xs font-semibold text-[var(--text-tertiary)] sm:hidden">
                  Esc cierra
                </span>
              )}
            </footer>
          </div>
        </div>
  );
}
