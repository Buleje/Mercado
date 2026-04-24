"use client";

/**
 * MotoDeliveryLoader — Loader contextual con motorcito (en vez de
 * spinner genérico). Alma peruana en cada espera.
 *
 * Variantes:
 *   - inline: pequeño, 32px, para inputs/botones (micro-bounces)
 *   - page: grande 120px + texto "Llega en minutos..."
 *
 * Animacion: translate horizontal izq-der + wheels rotate.
 * Respeta prefers-reduced-motion (fallback a dots simples).
 */

import { useState, useEffect } from "react";
import { MotorizadoUcayali } from "@/components/ui-system/illustrations/pucallpa-locals";
import { Bike } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "inline" | "page";
  label?: string;
  className?: string;
}

const LABELS_POOL = [
  "Preparando tu pedido…",
  "La moto está saliendo…",
  "Revisando en la bodega…",
  "Llega en minutos…",
];

export default function MotoDeliveryLoader({
  variant = "page",
  label,
  className,
}: Props) {
  // Label rotado deterministicamente sin usar Date.now en render (pureza).
  const [labelIdx, setLabelIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLabelIdx((p) => (p + 1) % LABELS_POOL.length), 2000);
    return () => clearInterval(id);
  }, []);
  const finalLabel = label ?? LABELS_POOL[labelIdx];

  if (variant === "inline") {
    return (
      <span
        className={cn("inline-flex items-center gap-2 text-[var(--text-tertiary)]", className)}
        aria-live="polite"
      >
        <Bike
          className="h-4 w-4 animate-[motoRide_1.2s_infinite] motion-reduce:animate-pulse"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="text-xs font-bold">{finalLabel}</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-12",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {/* Pista animada */}
      <div className="relative w-40 h-24 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-4 h-px bg-linear-to-r from-transparent via-[var(--rule-base)] to-transparent"
        />
        <div
          className="absolute inset-0 flex items-end justify-center animate-[motoRide_2s_infinite_ease-in-out] motion-reduce:animate-pulse"
          aria-hidden
        >
          <MotorizadoUcayali
            size={90}
            className="text-[var(--accent)]"
          />
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm font-extrabold text-[var(--text-primary)]">{finalLabel}</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          Esto toma unos segundos
        </p>
      </div>
    </div>
  );
}
