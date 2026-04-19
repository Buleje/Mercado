"use client";

import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";
import { GiftCardIlustrada } from "@/components/ui-system/illustrations";

type Props = {
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
  /**
   * Variante visual para distinguir "recibidas" vs "enviadas".
   *  - `received`: ilustración centrada al tamaño normal.
   *  - `sent`: ilustración con opacity leve (regalo en tránsito).
   */
  variant?: "received" | "sent";
};

export default function GiftCardEmpty({
  title,
  description,
  ctaHref = "/marketplace/gift-cards",
  ctaLabel = "Explorar gift cards",
  variant = "received",
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-6 py-16 text-center">
      {/* Ilustración custom — sobre abriendo con card */}
      <div
        className={
          variant === "sent"
            ? "text-[var(--text-secondary)] opacity-75"
            : "text-[var(--text-secondary)]"
        }
        aria-hidden="true"
      >
        <GiftCardIlustrada size={180} />
      </div>

      <h3 className="mt-4 text-lg font-extrabold tracking-tight text-[var(--text-primary)] max-w-sm">
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-tertiary)] leading-relaxed">
        {description}
      </p>
      <Link
        href={ctaHref}
        className="mt-6 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--surface-canvas)] transition-opacity hover:opacity-90"
      >
        {ctaLabel}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
