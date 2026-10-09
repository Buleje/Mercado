"use client";

import { CardTitle } from "@buleje/design-system";
import { m, AnimatePresence } from "@/components/admin/providers";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { X, CreditCard } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { WizardProgress } from "@/components/admin/notas-credito/NcWizardPiezas";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";
import NcPasoDocumento from "@/components/admin/notas-credito/NcPasoDocumento";
import NcPasoMotivo from "@/components/admin/notas-credito/NcPasoMotivo";
import NcPasoConfirmar from "@/components/admin/notas-credito/NcPasoConfirmar";

/** Ventana «Nueva nota de crédito» (asistente de 3 pasos). Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcAsistente({ nc }: { nc: NotasCreditoVista }) {
  const {
    showNew, wizardStep, wizardTitleId, wizardPanelRef, resetWizard, ventanaWizard,
  } = nc;
  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── NEW NC WIZARD — Visual Document Picker ────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showNew && (
          <>
            <m.div key="nnc-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={() => resetWizard()} />
            <m.div key="nnc-modal" initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-modal flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && !ventanaWizard.fijado && resetWizard()}>
              <div
                ref={wizardPanelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={wizardTitleId}
                tabIndex={-1}
                className={cn(
                "relative w-full bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden",
                wizardStep === 0 ? "max-w-3xl" : "max-w-xl"
              )}>
                {/* Wizard Header */}
                <div className="px-5 pt-5 pb-0">
                  <div {...ventanaWizard.asaProps} className="flex items-center justify-between mb-4">
                    <CardTitle id={wizardTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CreditCard className="h-4 w-4 text-primary" />
                      </div>
                      Nueva Nota de Cr{"\u00e9"}dito
                    </CardTitle>
                    <span className="ml-auto flex items-center gap-1">
                      <ControlesDeVentana ventana={ventanaWizard} />
                    </span>
                    <button onClick={resetWizard} aria-label="Cerrar" className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <WizardProgress step={wizardStep} />
                </div>

                <div className="px-5 pb-5 max-h-[70vh] overflow-y-auto">
                  {/* ═══════════════════════════════════════════════════════ */}
                  {/* STEP 0: Visual Document Picker Gallery                */}
                  {/* ═══════════════════════════════════════════════════════ */}
                  <NcPasoDocumento nc={nc} />

                  {/* ═══════════════════════════════════════════════════════ */}
                  {/* STEP 1: Motivo, Items & Amounts                       */}
                  {/* ═══════════════════════════════════════════════════════ */}
                  <NcPasoMotivo nc={nc} />

                  {/* ═══════════════════════════════════════════════════════ */}
                  {/* STEP 2: Confirmation & Summary                        */}
                  {/* ═══════════════════════════════════════════════════════ */}
                  <NcPasoConfirmar nc={nc} />
                </div>
                <TiradorDeVentana ventana={ventanaWizard} />
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
