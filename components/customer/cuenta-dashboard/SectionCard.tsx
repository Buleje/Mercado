"use client";

/**
 * SectionCard — tarjeta reusable de una sub-seccion de /cuenta.
 *
 * Muestra icono + titulo + metric principal + subvalor + link "Ver ->".
 * Si metric es 0/empty, muestra empty state mini con CTA.
 */

import Link from "next/link";
import { memo } from "react";
import {
  CardTitle,
  Caption,
  IconBadge,
} from "@buleje/design-system";
import { ChevronRight, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  metric: string;
  detail?: string;
  href: string;
  isEmpty?: boolean;
  emptyLabel?: string;
  emptyHref?: string;
  /** Intent visual (solo accent cuando es informacion positiva clave). */
  accent?: "urgent" | "accent" | null;
  className?: string;
}

export const SectionCard = memo(function SectionCard({
  icon: Icon,
  title,
  metric,
  detail,
  href,
  isEmpty = false,
  emptyLabel,
  emptyHref,
  accent,
  className,
}: SectionCardProps) {
  const ctaHref = isEmpty && emptyHref ? emptyHref : href;

  return (
    <Link
      href={ctaHref}
      className={cn(
        "group block rounded-xl border bg-[var(--surface-raised)] p-4 transition-colors",
        accent === "urgent"
          ? "border-[color-mix(in_oklch,var(--data-warning)_40%,transparent)] bg-[color-mix(in_oklch,var(--data-warning)_5%,var(--surface-raised))]"
          : accent === "accent"
            ? "border-[color-mix(in_oklch,var(--accent)_30%,transparent)]"
            : "border-[var(--rule-base)] hover:border-[var(--rule-strong)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <IconBadge
          size="md"
          shape="square"
          intent={accent === "urgent" ? "warning" : "muted"}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </IconBadge>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="leading-tight truncate">{title}</CardTitle>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all mt-0.5"
              aria-hidden
            />
          </div>
          {isEmpty ? (
            <Caption className="block mt-1 text-[var(--text-tertiary)] leading-snug">
              {emptyLabel ?? "Sin datos aun"}
            </Caption>
          ) : (
            <>
              <p className="mt-1 text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] leading-tight tabular-nums">
                {metric}
              </p>
              {detail && (
                <Caption className="block mt-0.5 text-[var(--text-secondary)] leading-snug">
                  {detail}
                </Caption>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
});

export default SectionCard;
