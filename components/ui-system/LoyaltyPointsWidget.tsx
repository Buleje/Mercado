"use client";

/**
 * LoyaltyPointsWidget — Mini card con puntos del Socio Buleje.
 *
 * Se monta en header/cuenta y muestra:
 *   - Balance de puntos con CountUp anim
 *   - Tier badge (Bronce/Plata/Oro/Diamante)
 *   - Barra progreso al siguiente tier
 *   - CTA "Canjear" → /cuenta/socio-buleje
 *
 * Variantes: "compact" (header) | "full" (dashboard)
 */

import Link from "next/link";
import { Award, ChevronRight, Sparkles } from "@buleje/design-system/icons";
import CountUp from "./CountUp";
import { cn } from "@/lib/utils";

type Tier = "bronce" | "plata" | "oro" | "diamante";

interface Props {
  /** Puntos actuales */
  points: number;
  /** Tier actual */
  tier: Tier;
  /** Puntos necesarios para llegar al siguiente tier */
  pointsToNextTier?: number | null;
  /** Nombre del siguiente tier */
  nextTierName?: string | null;
  /** Variante visual */
  variant?: "compact" | "full";
  /** Href del CTA */
  href?: string;
  className?: string;
}

const TIER_CONFIG: Record<Tier, { label: string; color: string; icon: typeof Award }> = {
  bronce: { label: "Bronce", color: "text-[var(--data-warning-700)]", icon: Award },
  plata: { label: "Plata", color: "text-zinc-400", icon: Award },
  oro: { label: "Oro", color: "text-amber-400", icon: Award },
  diamante: { label: "Diamante", color: "text-cyan-400", icon: Sparkles },
};

export default function LoyaltyPointsWidget({
  points,
  tier,
  pointsToNextTier,
  nextTierName,
  variant = "full",
  href = "/cuenta/socio-buleje",
  className,
}: Props) {
  const cfg = TIER_CONFIG[tier];
  const Icon = cfg.icon;
  const progress =
    pointsToNextTier && pointsToNextTier > 0
      ? 1 - Math.min(pointsToNextTier / 1000, 1)
      : 1;

  if (variant === "compact") {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5",
          "hover:border-[var(--accent)] transition-colors",
          className,
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", cfg.color)} strokeWidth={2} aria-hidden />
        <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums">
          <CountUp to={points} duration={1000} /> pts
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        "hover:border-[var(--accent)] transition-colors",
        className,
      )}
      aria-label={`Tus puntos: ${points}, tier ${cfg.label}`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Socio Buleje
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-[var(--text-primary)] tabular-nums tracking-tight">
                <CountUp to={points} duration={1200} />
              </span>
              <span className="text-sm font-bold text-[var(--text-tertiary)]">puntos</span>
            </div>
          </div>
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold",
              cfg.color,
            )}
          >
            <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            {cfg.label}
          </div>
        </div>

        {/* Progress bar */}
        {pointsToNextTier && nextTierName && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[length:var(--ts-2xs)]">
              <span className="text-[var(--text-tertiary)]">
                Faltan {pointsToNextTier.toLocaleString("es-PE")} pts
              </span>
              <span className="font-bold text-[var(--text-secondary)]">Para {nextTierName}</span>
            </div>
            <div
              aria-hidden
              className="h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden"
            >
              <div
                className="h-full bg-[var(--accent)] transition-[width] duration-700 ease-out"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-[var(--rule-base)] pt-3">
          <span className="text-xs font-bold text-[var(--text-secondary)]">
            Canjeá por descuentos
          </span>
          <ChevronRight
            className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] group-hover:translate-x-1 transition-all"
            strokeWidth={2}
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}
