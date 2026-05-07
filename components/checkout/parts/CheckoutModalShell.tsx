"use client";

import { type ReactNode } from "react";
import { m, AnimatePresence } from "framer-motion";
import { CheckoutModalHeader } from "./CheckoutModalHeader";
import { StepBar } from "..";
import type { Step } from "../types";
import type { StoreTheme } from "@/contexts/settings-context";

/**
 * CheckoutModalShell — chrome del modal: overlay, animación,
 * dialog container, header y stepper. Recibe el contenido del paso
 * actual como children. Mantener libre de lógica.
 */

export type CheckoutModalShellProps = {
  open: boolean;
  step: Step;
  itemCount: number;
  businessName: string;
  storeTheme: StoreTheme | null;
  onClose: () => void;
  topSlot?: ReactNode;
  footerSlot?: ReactNode;
  /** CK-2: Footer sticky visible solo en mobile (sm:hidden) para steps
   *  datos/pago/confirmar. Muestra total + CTA "Confirmar". */
  mobileFooterSlot?: ReactNode;
  children: ReactNode;
};

export function CheckoutModalShell({
  open,
  step,
  itemCount,
  businessName,
  storeTheme,
  onClose,
  topSlot,
  footerSlot,
  mobileFooterSlot,
  children,
}: CheckoutModalShellProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            id="checkout-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-md"
            style={{
              zIndex: 2147483640,
              pointerEvents: "auto",
              backgroundColor: "rgba(15, 23, 42, 0.65)",
              transform: "translateZ(0)",
            }}
            onClick={onClose}
          />
          <m.div
            id="checkout-modal-container"
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 sm:inset-0 flex items-end sm:items-center justify-center sm:p-6"
            style={{
              zIndex: 2147483645,
              pointerEvents: "auto",
              transform: "translateZ(1px)",
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Completar pedido"
              data-testid="checkout-modal"
              className={`relative bg-white dark:bg-background rounded-t-3xl sm:rounded-[28px] w-full max-h-[95svh] flex flex-col overflow-hidden transition-all duration-300 ${
                step === "pago"
                  ? "sm:max-w-5xl"
                  : step === "confirmar"
                    ? "sm:max-w-lg"
                    : "sm:max-w-2xl"
              }`}
              style={{
                boxShadow: "0 30px 70px -15px rgba(0, 0, 0, 0.45), 0 8px 20px -6px rgba(0, 0, 0, 0.20)",
              }}
            >
              <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
                <div className="h-1.5 w-12 rounded-full bg-[var(--rule-base)]" />
              </div>

              <CheckoutModalHeader
                businessName={businessName}
                storeTheme={storeTheme}
                itemCount={itemCount}
                onClose={onClose}
              />

              <StepBar current={step} />

              {topSlot}

              <div className="flex-1 overflow-y-auto">{children}</div>

              {footerSlot && (
                <div className="shrink-0 border-t border-[var(--rule-soft)] bg-white/95 dark:bg-card/95 backdrop-blur-md">
                  {footerSlot}
                </div>
              )}

              {/* CK-2: Footer sticky mobile — solo visible en pantallas < sm */}
              {mobileFooterSlot && (
                <div className="sm:hidden shrink-0 border-t border-[var(--rule-soft)] bg-white/95 dark:bg-card/95 backdrop-blur-md">
                  {mobileFooterSlot}
                </div>
              )}
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
