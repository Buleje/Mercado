"use client";

/**
 * TiendasSectionHeader — Cabecera unificada para todas las secciones
 * de `/tiendas`. Garantiza coherencia visual: misma altura, mismo
 * tracking del eyebrow, misma escala tipográfica, mismo espaciado.
 *
 * Reemplaza los cabezales inline duplicados que iban variando.
 */

import Link from "next/link";

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
    <div className="flex items-end justify-between gap-6 mb-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)] mb-1.5">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl sm:text-2xl font-black tracking-[-0.015em] text-[var(--text-primary)] leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">{subtitle}</p>
        )}
      </div>
      {action &&
        (action.href ? (
          <Link
            href={action.href}
            className="shrink-0 text-xs font-bold text-[var(--accent)] hover:underline"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
