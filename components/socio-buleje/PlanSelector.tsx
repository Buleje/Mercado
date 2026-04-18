"use client";

/**
 * PlanSelector — Toggle Mensual / Anual con badge de ahorro.
 *
 * Uso en Hero y CTA Final. Controla el plan que se pasa a subscribe().
 */

import { cn } from "@buleje/design-system";
import { Caption, Kicker } from "@buleje/design-system";
import { PLAN_PRICES } from "@/lib/validators/socio-buleje";
import type { SocioPlan } from "@/lib/validators/socio-buleje";

export interface PlanSelectorProps {
  value: SocioPlan;
  onChange: (plan: SocioPlan) => void;
  className?: string;
}

export function PlanSelector({ value, onChange, className }: PlanSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Plan de suscripción"
      className={cn(
        "inline-flex items-center gap-1 p-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]",
        className,
      )}
    >
      <PlanOption
        active={value === "monthly"}
        onClick={() => onChange("monthly")}
        price={PLAN_PRICES.monthly}
        period="/mes"
        label="Mensual"
      />
      <PlanOption
        active={value === "yearly"}
        onClick={() => onChange("yearly")}
        price={PLAN_PRICES.yearly}
        period="/año"
        label="Anual"
        badge="Ahorrás 2 meses"
      />
    </div>
  );
}

function PlanOption({
  active,
  onClick,
  price,
  period,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  price: number;
  period: string;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "relative rounded-lg px-4 py-2.5 text-left transition-colors min-w-[140px]",
        active
          ? "bg-[var(--surface-raised)] border border-[var(--rule-base)] elev-1"
          : "hover:bg-[var(--surface-raised)]/60",
      )}
    >
      <Kicker
        className={cn(active ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}
      >
        {label}
      </Kicker>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={cn(
            "text-[length:var(--ts-lg)] font-extrabold tabular-nums",
            active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
          )}
        >
          S/ {price}
        </span>
        <Caption className="text-[var(--text-tertiary)]">{period}</Caption>
      </div>
      {badge && (
        <span className="mt-1 inline-block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success)]">
          {badge}
        </span>
      )}
    </button>
  );
}
