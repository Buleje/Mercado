import Link from "next/link";
import { ArrowUpRight } from "@buleje/design-system/icons";

/**
 * SectionHeading — encabezado ÚNICO y reutilizable de las secciones (Brandon
 * 2026-06-08). Estilo ejecutivo/profesional, minimalista:
 *   - Sans, font-extrabold, tamaño contenido (~26px máx, no 48px).
 *   - SIN serif itálico accent (era "muy llamativo"). El accent se reserva para
 *     CTAs, no para los títulos.
 *   - Eyebrow opcional (uppercase muted) + subtítulo opcional + acción "Ver todas"
 *     como pill neutro a la derecha.
 *
 * Reemplaza los headings ad-hoc dispersos (Categorías, Tiendas, Ranking, Catálogo,
 * FAQ…) por UNO solo → coherencia + reutilización en toda la home.
 */
export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  actionHref,
  headingId,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
  /** id del <h2> — para `aria-labelledby` de la sección que lo envuelve. */
  headingId?: string;
}) {
  return (
    <div className="mb-5 sm:mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            {eyebrow}
          </p>
        )}
        <h2
          id={headingId}
          className="text-xl sm:text-2xl lg:text-[26px] font-extrabold tracking-[-0.02em] text-[var(--text-primary)] leading-tight"
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)] leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] px-4 h-9 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {actionLabel}
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Link>
      )}
    </div>
  );
}
