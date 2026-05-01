"use client";

/**
 * MiniHero — Hero pattern editorial reusable para páginas satélite de /cuenta.
 *
 * Layout: 2 columnas (mobile: stacked) con kicker + título + descripción a la
 * izquierda, ilustración medium-size a la derecha, y stat chips opcionales.
 *
 * Coherente con el DS: usa tokens CSS (surface, text, rule) y tipografía DS.
 *
 * @example
 * <MiniHero
 *   kicker="GIFT CARDS"
 *   title="Tus tarjetas de regalo"
 *   description="Recibe y enviá, sin vencimiento."
 *   illustration={<GiftCardIlustrada size={140} />}
 *   stats={[
 *     { label: "Activas", value: 3 },
 *     { label: "Saldo total", value: "S/ 150" },
 *   ]}
 * />
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MiniHeroStat {
  label: string;
  value: string | number;
}

export interface MiniHeroProps {
  /** Texto pequeño uppercase arriba del título (ej. "GIFT CARDS"). */
  kicker?: string;
  /** Título principal del hero. */
  title: string;
  /** Descripción corta (1-2 líneas). */
  description?: string;
  /** Ilustración custom SVG. Tamaño sugerido: 120-160px. */
  illustration: ReactNode;
  /** Stats opcionales mostradas como chips debajo del título. */
  stats?: MiniHeroStat[];
  /** Acción opcional a la derecha del contenido principal. */
  action?: ReactNode;
  className?: string;
}

export function MiniHero({
  kicker,
  title,
  description,
  illustration,
  stats,
  action,
  className,
}: MiniHeroProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--rule-soft)]",
        "bg-[var(--surface-raised)]",
        "px-5 sm:px-7 py-6 sm:py-8",
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        {/* Izquierda — Texto */}
        <div className="flex-1 min-w-0">
          {kicker && (
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
              {kicker}
            </p>
          )}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed max-w-lg">
              {description}
            </p>
          )}

          {/* Stats chips */}
          {stats && stats.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {stats.map((stat) => (
                <span
                  key={stat.label}
                  className={cn(
                    "inline-flex items-baseline gap-1.5 rounded-full",
                    "bg-[var(--surface-canvas)] border border-[var(--rule-soft)]",
                    "px-3 py-1 text-xs",
                  )}
                >
                  <span className="font-bold text-[var(--text-primary)] tabular-nums">
                    {stat.value}
                  </span>
                  <span className="text-[var(--text-tertiary)]">{stat.label}</span>
                </span>
              ))}
            </div>
          )}

          {action && <div className="mt-5">{action}</div>}
        </div>

        {/* Derecha — Ilustración */}
        <div
          className="hidden sm:flex shrink-0 items-center justify-center text-[var(--text-secondary)]"
          aria-hidden="true"
        >
          {illustration}
        </div>

        {/* Mobile — Ilustración chica arriba */}
        <div
          className="sm:hidden absolute top-4 right-4 text-[var(--text-secondary)] opacity-60"
          aria-hidden="true"
        >
          <div className="scale-[0.55] origin-top-right">{illustration}</div>
        </div>
      </div>
    </section>
  );
}
