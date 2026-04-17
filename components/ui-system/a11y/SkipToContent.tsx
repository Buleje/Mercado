"use client";

import Link from "next/link";

/**
 * SkipToContent — link para saltar directo al contenido principal.
 *
 * WCAG 2.4.1 Bypass Blocks. Invisible hasta que recibe focus via Tab.
 * Debe ser el primer elemento tabulable del body.
 *
 * @example
 * // En app/layout.tsx al top:
 * <SkipToContent />
 * <main id="main-content">...</main>
 */

interface Props {
  targetId?: string;
  label?: string;
  className?: string;
}

export function SkipToContent({
  targetId = "main-content",
  label = "Saltar al contenido principal",
  className,
}: Props) {
  return (
    <Link
      href={`#${targetId}`}
      className={
        className ||
        "sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:rounded-full focus:bg-[var(--text-primary)] focus:text-[var(--surface-canvas)] focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:shadow-xl focus:outline-2 focus:outline-offset-2 focus:outline-white"
      }
    >
      {label}
    </Link>
  );
}
