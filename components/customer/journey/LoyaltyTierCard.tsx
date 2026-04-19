"use client";

import { memo } from "react";
import NumberFlow from "@number-flow/react";
import { Star, Award, Trophy, Sparkles } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { IconBadge } from "@buleje/design-system";

/**
 * LoyaltyTierCard — fidelidad gamificada Bronce/Plata/Oro.
 *
 * Cialdini Commitment & Social Proof. Progreso visible hacia siguiente nivel.
 *
 * Niveles (tomados de research report):
 *   - Bronce: 0-499 puntos — 2% cashback
 *   - Plata:  500-1,499 — 4% + delivery gratis
 *   - Oro:    1,500+ — 6% + prioridad delivery
 *
 * @example
 * <LoyaltyTierCard
 *   currentPoints={418}
 *   totalSpent={4180}
 *   customerName="Brandon"
 * />
 */

const TIERS = [
  { key: "bronce", label: "Bronce", Icon: Star, minPoints: 0, maxPoints: 499, cashback: 2, perks: ["2% cashback", "Ofertas exclusivas"] },
  { key: "plata", label: "Plata", Icon: Award, minPoints: 500, maxPoints: 1499, cashback: 4, perks: ["4% cashback", "Delivery gratis desde S/30", "Soporte prioritario"] },
  { key: "oro", label: "Oro", Icon: Trophy, minPoints: 1500, maxPoints: Infinity, cashback: 6, perks: ["6% cashback", "Delivery siempre gratis", "Acceso anticipado a ofertas", "Regalo de cumpleaños"] },
] as const;

interface Props {
  currentPoints: number;
  totalSpent?: number;
  customerName?: string;
  className?: string;
}

export const LoyaltyTierCard = memo(function LoyaltyTierCard({
  currentPoints,
  totalSpent,
  customerName,
  className,
}: Props) {
  const currentTier = TIERS.find((t) => currentPoints >= t.minPoints && currentPoints <= t.maxPoints) ?? TIERS[0];
  const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];

  const progressPercent = nextTier
    ? Math.min(100, ((currentPoints - currentTier.minPoints) / (nextTier.minPoints - currentTier.minPoints)) * 100)
    : 100;

  const pointsToNext = nextTier ? nextTier.minPoints - currentPoints : 0;
  // Estimar pedidos a siguiente nivel (promedio S/47 por pedido = ~4.7 puntos)
  const ordersToNext = Math.ceil(pointsToNext / 5);

  const CurrentIcon = currentTier.Icon;

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}
      aria-labelledby="loyalty-tier-title"
    >
      {/* Hero */}
      <div className="p-6 sm:p-8 border-b border-[var(--rule-soft)]" style={{ background: "var(--brand-ink)" }}>
        {customerName && (
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/55 mb-3">
            Hola, {customerName}
          </p>
        )}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 border border-white/15 text-white">
                <CurrentIcon className="h-5 w-5" strokeWidth={1.5} />
              </span>
              <h2
                id="loyalty-tier-title"
                className="text-xl sm:text-2xl font-extrabold tracking-[var(--ls-tight)] text-white"
              >
                Nivel {currentTier.label}
              </h2>
            </div>
            <p className="text-white/60 text-sm leading-relaxed max-w-sm">
              {currentTier.cashback}% de vuelta en cada compra.
              {nextTier && ` Subí a ${nextTier.label} para más beneficios.`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/55 mb-1">
              Tus puntos
            </p>
            <NumberFlow
              value={currentPoints}
              className="text-4xl sm:text-5xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-white leading-none"
            />
          </div>
        </div>
      </div>

      {/* Progress to next tier */}
      {nextTier && (
        <div className="p-5 sm:p-6 border-b border-[var(--rule-soft)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Próximo nivel
            </span>
            <span className="text-xs font-extrabold text-[var(--text-primary)] tabular-nums">
              {currentPoints} / {nextTier.minPoints}
            </span>
          </div>
          {/* Progress bar */}
          <div className="relative h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[var(--text-primary)] rounded-full"
              style={{
                width: `${progressPercent}%`,
                transition: "width 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
          </div>
          {/* Copy accionable */}
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            Te faltan{" "}
            <span className="font-extrabold text-[var(--text-primary)] tabular-nums">{pointsToNext} puntos</span>
            {" "}·{" "}
            <span className="text-[var(--text-tertiary)]">
              {ordersToNext} {ordersToNext === 1 ? "pedido" : "pedidos"} promedio
            </span>
          </p>
        </div>
      )}

      {/* Perks list */}
      <div className="p-5 sm:p-6">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
          Tus beneficios activos
        </p>
        <ul className="space-y-2">
          {currentTier.perks.map((perk) => (
            <li key={perk} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <IconBadge size="sm"><Sparkles className="h-2.5 w-2.5" strokeWidth={2} /></IconBadge>
              {perk}
            </li>
          ))}
        </ul>
        {totalSpent != null && (
          <p className="mt-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] tabular-nums">
            Llevás gastado S/ {totalSpent.toLocaleString("es-PE")} en Buleje
          </p>
        )}
      </div>

      {/* All tiers strip */}
      <div className="grid grid-cols-3 divide-x divide-[var(--rule-soft)] border-t border-[var(--rule-soft)]">
        {TIERS.map((t) => {
          const TIcon = t.Icon;
          const isCurrent = t.key === currentTier.key;
          const isPast = TIERS.findIndex((x) => x.key === t.key) < TIERS.findIndex((x) => x.key === currentTier.key);
          return (
            <div
              key={t.key}
              className={cn(
                "p-4 text-center",
                isCurrent && "bg-[var(--surface-sunken)]",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full mb-2",
                  (isCurrent || isPast)
                    ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                    : "bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-tertiary)]",
                )}
                aria-hidden
              >
                <TIcon className="h-3 w-3" strokeWidth={1.75} />
              </span>
              <p className={cn(
                "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)]",
                isCurrent ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
              )}>
                {t.label}
              </p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-semibold tabular-nums">
                {t.minPoints.toLocaleString("es-PE")}+
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
});
