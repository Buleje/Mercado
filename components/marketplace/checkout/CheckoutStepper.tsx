"use client";

/**
 * CheckoutStepper — barra horizontal de progreso entre las 4 páginas del
 * checkout: Carrito → Datos → Entrega y Pago → Confirmar.
 *
 * Versión editorial:
 *   - Bullets circulares h-9 w-9 (antes h-7 w-7)
 *   - Progress bar de gradiente accent fluida entre pasos completados
 *   - Estado current con ring accent-soft
 *   - Estado done con check icon y bg accent-soft
 *   - Label en font-bold tracking tight debajo del bullet (desktop)
 */

import Link from "next/link";
import { Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type CheckoutStep = "carrito" | "datos" | "entrega" | "confirmar";

const STEPS: { key: CheckoutStep; label: string; href: string }[] = [
  { key: "carrito", label: "Carrito", href: "/marketplace/carrito" },
  { key: "datos", label: "Datos", href: "/checkout/datos" },
  { key: "entrega", label: "Entrega y pago", href: "/checkout/entrega" },
  { key: "confirmar", label: "Confirmar", href: "/checkout/confirmar" },
];

export default function CheckoutStepper({ current }: { current: CheckoutStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <nav aria-label="Progreso del checkout" className="w-full">
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isClickable = isDone;
          const NumberContent = isDone ? (
            <Check className="h-4 w-4" strokeWidth={2.75} aria-hidden />
          ) : (
            <span aria-hidden className="tabular-nums">{idx + 1}</span>
          );

          const bulletCls = cn(
            "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            "text-[length:var(--ts-xs)] font-bold transition-all duration-200",
            isCurrent &&
              "bg-[var(--accent)] text-white ring-4 ring-[var(--accent-soft)] scale-105",
            isDone && "bg-[var(--accent-soft)] text-[var(--accent)]",
            !isCurrent &&
              !isDone &&
              "border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]",
          );

          const labelCls = cn(
            "text-[length:var(--ts-xs)] font-bold tracking-[var(--ls-tight)] whitespace-nowrap transition-colors",
            isCurrent && "text-[var(--text-primary)]",
            isDone && "text-[var(--text-secondary)]",
            !isCurrent && !isDone && "text-[var(--text-tertiary)]",
          );

          return (
            <li key={step.key} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {isClickable ? (
                <Link
                  href={step.href}
                  className="inline-flex items-center gap-2 rounded-full px-1 py-1 hover:bg-[var(--surface-sunken)] transition-colors"
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span className={bulletCls}>{NumberContent}</span>
                  <span className={cn(labelCls, "hidden md:inline")}>{step.label}</span>
                </Link>
              ) : (
                <span
                  className="inline-flex items-center gap-2 px-1 py-1"
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span className={bulletCls}>{NumberContent}</span>
                  <span className={cn(labelCls, "hidden md:inline")}>{step.label}</span>
                </span>
              )}
              {idx < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "relative h-1 w-6 sm:w-12 rounded-full overflow-hidden bg-[var(--rule-soft)]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-0 origin-left transition-transform duration-500 ease-out",
                      "bg-linear-to-r from-[var(--accent)] to-[var(--accent)]/70",
                      isDone ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
