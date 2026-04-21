"use client";

/**
 * CheckoutHero — Hero editorial compartido por las 4 pantallas del checkout.
 *
 * Vocabulario canónico Buleje:
 *   - Kicker con línea accent `h-[3px] w-10`
 *   - Título clamp fluido (`text-[clamp(2rem,5vw,3.5rem)]`)
 *   - Segunda línea en italic serif accent
 *   - Asimetría 7fr/5fr cuando hay `rightSlot`
 *   - Blobs decorativos accent/[0.05]
 *
 * Se usa DENTRO del `CheckoutShell` (no reemplaza) — el shell aporta el
 * header sticky con logo y stepper; el hero aporta la voz editorial del paso.
 */

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ArrowLeft } from "@buleje/design-system/icons";

type LucideProps = { className?: string; strokeWidth?: number; "aria-hidden"?: boolean };
type IconComponent = ComponentType<LucideProps>;

export interface CheckoutHeroProps {
  /** Línea superior uppercase (ej: "Paso 1 · Carrito"). */
  kicker: string;
  /** Primera línea del título (regular). */
  titleLine1: string;
  /** Segunda línea — se renderiza italic serif accent. */
  titleLine2: string;
  /** Párrafo debajo del título. */
  subtitle?: string;
  /** Icono opcional al lado del kicker. */
  icon?: IconComponent;
  /** Slot para una card / chip / stats a la derecha. Si existe, se activa grid 7fr/5fr. */
  rightSlot?: ReactNode;
  /** Link "Volver a …" arriba del kicker. */
  backHref?: string;
  backLabel?: string;
}

export default function CheckoutHero({
  kicker,
  titleLine1,
  titleLine2,
  subtitle,
  icon: Icon,
  rightSlot,
  backHref,
  backLabel,
}: CheckoutHeroProps) {
  const hasRightSlot = Boolean(rightSlot);

  return (
    <section
      aria-labelledby="checkout-hero-heading"
      className="relative w-full overflow-hidden"
    >
      {/* Blobs decorativos accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-32 h-[420px] w-[420px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 -left-28 h-[320px] w-[320px] rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
      />

      <div className="relative pt-6 sm:pt-10 pb-8 sm:pb-12">
        <div
          className={
            hasRightSlot
              ? "grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-10 lg:gap-14 items-center"
              : "max-w-3xl"
          }
        >
          {/* ── LEFT — título editorial ──────────────────────────────── */}
          <div>
            {backHref && (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors mb-3"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                {backLabel ?? "Volver"}
              </Link>
            )}

            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-5">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
              {kicker}
            </p>

            <h1
              id="checkout-hero-heading"
              className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]"
            >
              {titleLine1}
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                {titleLine2}
              </span>
            </h1>

            {subtitle && (
              <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] leading-[1.45] max-w-xl">
                {subtitle}
              </p>
            )}
          </div>

          {/* ── RIGHT — stats / chip / card ──────────────────────────── */}
          {hasRightSlot && <div>{rightSlot}</div>}
        </div>
      </div>
    </section>
  );
}
