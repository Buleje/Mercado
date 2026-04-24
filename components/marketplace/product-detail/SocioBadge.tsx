"use client";

/**
 * SocioBadge — Badge prominente "Precio Socio" en el PDP.
 *
 * Se muestra si el usuario es Socio Y el producto tiene socioPrice < regularPrice.
 * Usa DS tokens (surface + data-success) — sin colores saturados.
 */

import Link from "next/link";
import { Sparkles, ArrowRight } from "@buleje/design-system/icons";
import { CardTitle, BodyText, Caption } from "@buleje/design-system";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";

export interface SocioBadgeProps {
  regularPrice: number;
  socioPrice: number;
  className?: string;
}

function fmt(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

/**
 * Render rules:
 * - Si user es Socio y hay precio Socio más bajo: mostrar CTA "Aplicado" con ahorro.
 * - Si user NO es Socio pero hay precio Socio: CTA "Conocer el plan".
 */
export function SocioBadge({ regularPrice, socioPrice, className }: SocioBadgeProps) {
  const { isSocio } = useSocioBuleje();
  const savings = regularPrice - socioPrice;
  if (savings <= 0) return null;
  const pct = Math.round((savings / regularPrice) * 100);

  if (isSocio) {
    return (
      <div
        className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex items-start gap-3 ${className ?? ""}`}
        style={{
          borderColor: "var(--data-success)",
          backgroundColor:
            "color-mix(in oklch, var(--data-success) 6%, var(--surface-raised))",
        }}
      >
        <div
          className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--data-success)" }}
        >
          <Sparkles className="h-4 w-4 text-white" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-[length:var(--ts-sm)]">
            Precio Socio {fmt(socioPrice)}
          </CardTitle>
          <Caption className="mt-0.5 text-[var(--text-secondary)]">
            Ahorrás {fmt(savings)} sobre {fmt(regularPrice)} ({pct}% menos)
          </Caption>
        </div>
      </div>
    );
  }

  return (
    <Link
      href="/socio-buleje"
      className={`group rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex items-start gap-3 transition-colors hover:border-[var(--rule-strong)] ${className ?? ""}`}
    >
      <div className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center bg-[var(--surface-sunken)]">
        <Sparkles className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <CardTitle className="text-[length:var(--ts-sm)]">
          Con Socio Buleje: {fmt(socioPrice)}
        </CardTitle>
        <BodyText className="mt-0.5 text-[var(--text-secondary)]">
          Ahorrarías {fmt(savings)} en este producto ({pct}% menos). Conoce el
          plan →
        </BodyText>
      </div>
      <ArrowRight
        className="shrink-0 h-4 w-4 text-[var(--text-tertiary)] group-hover:translate-x-0.5 transition-transform"
        aria-hidden
      />
    </Link>
  );
}
