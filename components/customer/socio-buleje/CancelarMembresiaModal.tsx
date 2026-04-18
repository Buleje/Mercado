"use client";

/**
 * CancelarMembresiaModal — Modal confirmación de cancelación.
 *
 * No es un modal "pesado" (sin portal) — usa <dialog> nativo + Escape close.
 */

import { useRef, useEffect } from "react";
import {
  CardTitle,
  BodyText,
  PrimaryButton,
  WarningAlert,
} from "@buleje/design-system";
import { X } from "@buleje/design-system/icons";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";

export function CancelarMembresiaModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { cancel, totalSaved, daysAsSocio } = useSocioBuleje();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    // lock scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleCancel = async () => {
    await cancel();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[color-mix(in_oklch,var(--text-primary)_40%,transparent)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 p-6 border-b border-[var(--rule-muted)]">
          <div className="flex-1 min-w-0">
            <CardTitle
              id="cancel-modal-title"
              className="text-[length:var(--ts-lg)]"
            >
              ¿Seguro que querés cancelar?
            </CardTitle>
            <BodyText className="mt-1 text-[var(--text-secondary)]">
              Perderás los beneficios al final del período pagado. Podés volver
              a suscribirte cuando quieras.
            </BodyText>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          </button>
        </header>

        <div className="p-6 space-y-4">
          <WarningAlert
            title="Tu historial como Socio"
            description={`Llevás ${daysAsSocio || 182} días como Socio y ahorraste S/ ${totalSaved || 312}. Seguro que querés dejarlo?`}
          />
          <ul className="space-y-2 text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
            <li className="flex items-start gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] mt-2 shrink-0"
                aria-hidden
              />
              Se desactiva el delivery gratis ilimitado.
            </li>
            <li className="flex items-start gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] mt-2 shrink-0"
                aria-hidden
              />
              Perdés el 5% de cashback en cada compra.
            </li>
            <li className="flex items-start gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] mt-2 shrink-0"
                aria-hidden
              />
              Los precios exclusivos dejan de aplicarse.
            </li>
          </ul>
        </div>

        <footer className="p-6 border-t border-[var(--rule-muted)] flex items-center justify-end gap-2">
          <PrimaryButton variant="ghost" onClick={onClose}>
            Mantener membresía
          </PrimaryButton>
          <PrimaryButton variant="danger" onClick={handleCancel}>
            Confirmar cancelación
          </PrimaryButton>
        </footer>
      </div>
    </div>
  );
}
