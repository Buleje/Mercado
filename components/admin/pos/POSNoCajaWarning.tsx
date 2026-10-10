"use client";

import { CardTitle } from "@buleje/design-system";
import { AlertTriangle } from "@buleje/design-system/icons";

interface POSNoCajaWarningProps {
  turnoAbierto: boolean | null;
  cashRegisterOpen: boolean | null;
  setShowNoCajaWarning: (v: boolean) => void;
  setShowPayment: (v: boolean) => void;
}

/** Aviso antes de cobrar sin turno o sin caja abierta. */
export default function POSNoCajaWarning({ turnoAbierto, cashRegisterOpen, setShowNoCajaWarning, setShowPayment }: POSNoCajaWarningProps) {
  return (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={turnoAbierto === false && cashRegisterOpen === false ? "Turno y caja sin abrir" : turnoAbierto === false ? "Turno sin abrir" : "Caja sin abrir"}
          className="modal-backdrop p-4"
          onClick={(e) => e.target === e.currentTarget && setShowNoCajaWarning(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowNoCajaWarning(false); }}
        >
          <div
            className="bg-[var(--surface-raised)] rounded-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--data-warning-50)] text-[var(--data-warning-500)]">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <CardTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                  {turnoAbierto === false && cashRegisterOpen === false
                    ? "Sin turno ni caja abiertos"
                    : turnoAbierto === false
                      ? "Sin turno abierto"
                      : "Caja sin abrir"}
                </CardTitle>
                <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                  {cashRegisterOpen === false && (
                    <>
                      El dinero <strong>no quedará controlado en ninguna caja</strong>: no aparecerá en el arqueo ni en el cuadre.{" "}
                    </>
                  )}
                  {turnoAbierto === false && (
                    <>
                      La venta <strong>no tendrá cajero responsable</strong>: no entra en su turno ni en sus comisiones, y si al cierre
                      falta plata no hay a quién preguntarle.{" "}
                    </>
                  )}
                  ¿Continuar de todas formas?
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNoCajaWarning(false);
                  window.dispatchEvent(new CustomEvent(turnoAbierto === false ? "buleje:navigate-turnos" : "buleje:navigate-caja"));
                }}
                className="flex-1 min-h-11 rounded-xl bg-[var(--text-primary)] text-[var(--surface-raised)] font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                {turnoAbierto === false ? "Abrir turno primero" : "Abrir caja primero"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNoCajaWarning(false);
                  setShowPayment(true);
                }}
                className="flex-1 min-h-11 rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] font-semibold text-sm hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
              >
                {turnoAbierto === false && cashRegisterOpen === false
                  ? "Vender sin turno ni caja"
                  : turnoAbierto === false
                    ? "Vender sin turno"
                    : "Vender sin caja"}
              </button>
            </div>
          </div>
        </div>
  );
}
