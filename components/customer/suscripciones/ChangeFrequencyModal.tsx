"use client";

/**
 * ChangeFrequencyModal — Modal para cambiar la frecuencia de una suscripcion.
 *
 * Usa el patron overlay minimalista del DS. Permite elegir entre 4 frecuencias
 * predefinidas y muestra preview del impacto (cuando llega la próxima entrega).
 */

import { useEffect, useMemo, useState } from "react";
import { X, CheckCircle2 } from "@buleje/design-system/icons";
import { CardTitle, BodyText, Caption } from "@buleje/design-system";
import {
  FREQUENCY_DAYS,
  FREQUENCY_LABEL,
  type SubscriptionFrequency,
  type SubscriptionPlan,
} from "@/contexts/subscription-context";
import { cn } from "@/lib/utils";

const FREQUENCIES: SubscriptionFrequency[] = [
  "weekly",
  "biweekly",
  "monthly",
  "bimonthly",
];

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function previewNext(frequency: SubscriptionFrequency): string {
  const d = new Date();
  d.setDate(d.getDate() + FREQUENCY_DAYS[frequency]);
  return d.toISOString();
}

export interface ChangeFrequencyModalProps {
  subscription: SubscriptionPlan;
  onClose: () => void;
  onConfirm: (frequency: SubscriptionFrequency) => void;
}

export default function ChangeFrequencyModal({
  subscription,
  onClose,
  onConfirm,
}: ChangeFrequencyModalProps) {
  const [selected, setSelected] = useState<SubscriptionFrequency>(
    subscription.frequency,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const previewIso = useMemo(() => previewNext(selected), [selected]);
  const hasChange = selected !== subscription.frequency;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-freq-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl overflow-hidden",
          "bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-xl",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--rule-soft)]">
          <div className="flex-1 min-w-0">
            <CardTitle id="change-freq-title">Cambiar frecuencia</CardTitle>
            <Caption className="mt-0.5 text-[var(--text-tertiary)] line-clamp-1">
              {subscription.productName}
            </Caption>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
              "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
              "hover:bg-[var(--surface-sunken)] transition-colors",
            )}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Frequencies */}
        <div className="p-4 space-y-2">
          {FREQUENCIES.map((freq) => {
            const isSel = freq === selected;
            const isCurrent = freq === subscription.frequency;
            return (
              <button
                key={freq}
                type="button"
                onClick={() => setSelected(freq)}
                className={cn(
                  "w-full flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors text-left",
                  isSel
                    ? "border-[var(--rule-strong)] bg-[var(--surface-sunken)]"
                    : "border-[var(--rule-base)] hover:border-[var(--rule-strong)]",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
                      {FREQUENCY_LABEL[freq]}
                    </span>
                    {isCurrent && (
                      <span
                        className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          color: "var(--text-tertiary)",
                          backgroundColor: "var(--surface-sunken)",
                          border: "1px solid var(--rule-base)",
                        }}
                      >
                        Actual
                      </span>
                    )}
                  </div>
                  <Caption className="mt-0.5 text-[var(--text-tertiary)]">
                    Cada {FREQUENCY_DAYS[freq]} dias
                  </Caption>
                </div>
                {isSel && (
                  <CheckCircle2
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--data-success)" }}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Preview */}
        {hasChange && (
          <div className="mx-4 mb-4 p-3 rounded-lg bg-[var(--surface-sunken)]">
            <BodyText className="text-[var(--text-secondary)] text-[length:var(--ts-xs)]">
              Tu próxima entrega sera el{" "}
              <strong className="text-[var(--text-primary)]">
                {fmtDate(previewIso)}
              </strong>
              .
            </BodyText>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 p-4 border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex-1 py-2.5 rounded-lg font-semibold text-[length:var(--ts-sm)]",
              "border border-[var(--rule-base)] text-[var(--text-secondary)]",
              "hover:text-[var(--text-primary)] hover:border-[var(--rule-strong)] transition-colors",
            )}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={!hasChange}
            className={cn(
              "flex-1 py-2.5 rounded-lg font-semibold text-[length:var(--ts-sm)] transition-opacity",
              "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
              hasChange ? "hover:opacity-90" : "opacity-40 cursor-not-allowed",
            )}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
