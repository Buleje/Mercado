"use client";

/**
 * CheckoutStepHeader — header compartido de los 3 pasos del checkout
 * (datos · entrega · confirmar). Brandon 2026-06-01: antes cada página tenía
 * su propio header con tamaños, padding y estilo de "volver" distintos. Este
 * componente fija UN formato para que el flujo se sienta armonioso:
 *   - Back link sutil (texto + flecha), mismo tamaño en todos.
 *   - h1 text-2xl (mobile) / text-4xl (desktop), font-black.
 *   - Subtítulo con un "lead" en negrita opcional ("Paso 2 de 3.", "Último paso.").
 *   - Mismo padding vertical (pt-4 sm:pt-8 pb-4 sm:pb-6).
 */

import Link from "next/link";
import { ArrowLeft } from "@buleje/design-system/icons";

export default function CheckoutStepHeader({
  backHref,
  backLabel,
  title,
  lead,
  subtitle,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  /** Frase en negrita al inicio del subtítulo (ej. "Último paso."). */
  lead?: string;
  subtitle: string;
}) {
  return (
    <div className="pt-4 sm:pt-8 pb-4 sm:pb-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] sm:text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:gap-2 transition-all mb-2 sm:mb-3"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        {backLabel}
      </Link>
      <h1 className="text-xl sm:text-3xl font-bold tracking-[-0.02em] text-[var(--text-primary)] leading-tight">
        {title}
      </h1>
      <p className="mt-1.5 sm:mt-2 text-[length:var(--ts-xs)] sm:text-base text-[var(--text-secondary)] leading-snug">
        {lead && (
          <span className="font-semibold text-[var(--text-primary)]">{lead} </span>
        )}
        {subtitle}
      </p>
    </div>
  );
}
