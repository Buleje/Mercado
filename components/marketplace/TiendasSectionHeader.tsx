"use client";

/**
 * TiendasSectionHeader — Cabecera unificada para todas las secciones
 * de `/tiendas`. Garantiza coherencia visual: misma altura, mismo
 * tracking del eyebrow, misma escala tipográfica, mismo espaciado.
 *
 * Patrón visual armónico con el hero principal:
 *   - Eyebrow accent + accent line decorativa (3px x 8w rounded-full)
 *   - H2 escala 2xl-3xl con tracking apretado y leading 1.05
 *   - Subtítulo en text-secondary
 *   - Action a la derecha alineada al baseline
 */

import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";

interface TiendasSectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Acción opcional al lado derecho (ej: "Ver todas") */
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export default function TiendasSectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: TiendasSectionHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-6 mb-5 sm:mb-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2.5">
            <span
              aria-hidden
              className="inline-block h-[3px] w-10 rounded-full bg-[var(--accent)]"
            />
            {eyebrow}
          </p>
        )}
        {/* Title v2: clamp fluid + italic serif accent en el split de la
            primera palabra. Antes era plano; ahora editorial al estilo del
            hero principal para coherencia visual en toda la página. */}
        <h2 className="text-[clamp(1.5rem,3.5vw,2.25rem)] font-black tracking-tight text-[var(--text-primary)] leading-[1.05]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {action &&
        (action.href ? (
          <Link
            href={action.href}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 h-10 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 h-10 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        ))}
    </div>
  );
}
