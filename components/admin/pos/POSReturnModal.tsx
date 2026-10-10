"use client";

import { CardTitle } from "@buleje/design-system";
import { useId, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { m, AnimatePresence } from "@/components/admin/providers";
import { X, RotateCcw } from "@buleje/design-system/icons";
import { useDevolucion } from "@/components/admin/pos/devolucion/use-devolucion";
import DevolucionPasoBuscar from "@/components/admin/pos/devolucion/DevolucionPasoBuscar";
import DevolucionPasoItems from "@/components/admin/pos/devolucion/DevolucionPasoItems";
import DevolucionResultado from "@/components/admin/pos/devolucion/DevolucionResultado";

export default function POSReturnModal({
  isOpen,
  onClose,
  onReturnComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onReturnComplete?: () => void;
}) {
  const dev = useDevolucion({ isOpen, onClose, onReturnComplete });
  const { step, resetAndClose } = dev;

  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccesible(modalRef, { onCerrar: resetAndClose, cerrarConEscape: false, activo: isOpen });
  const ventana = useVentanaDeModal(isOpen, { ref: modalRef, aplicarTranslate: true, claveMemoria: "pos-devolucion" });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <m.div
        key="return-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="modal-backdrop"
        onClick={resetAndClose}
      />
      <m.div
        key="return-modal"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed inset-0 z-modal flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && !ventana.fijado && resetAndClose()}
      >
        <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative w-full max-w-[36rem] bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div {...ventana.asaProps} className="flex items-center justify-between p-4 border-b border-[var(--rule-soft)]">
            <CardTitle id={titleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-secondary" />
              Devolución
              {step < 3 && <span className="text-xs font-normal text-[var(--text-tertiary)]">Paso {step}/2</span>}
            </CardTitle>
            <span className="ml-auto flex items-center gap-1">
              <ControlesDeVentana ventana={ventana} />
              <button onClick={resetAndClose} aria-label="Cerrar" className="p-1.5 rounded-xl hover:bg-[var(--rule-soft)] transition-colors">
                <X className="h-4 w-4 text-[var(--text-secondary)]" />
              </button>
            </span>
          </div>

          {/* Step 1: Search sale */}
          {step === 1 && <DevolucionPasoBuscar dev={dev} />}

          {/* Step 2: Select items to return */}
          {step === 2 && dev.selectedSale && <DevolucionPasoItems dev={dev} selectedSale={dev.selectedSale} />}

          {/* Step 3: Result */}
          {step === 3 && dev.result && <DevolucionResultado dev={dev} result={dev.result} />}
          <TiradorDeVentana ventana={ventana} />
        </div>
      </m.div>
    </AnimatePresence>
  );
}
