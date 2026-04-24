"use client";

/**
 * StepPlan — wizard step 5: radio plan gratis vs plan Pro.
 */

import type { PlanForm } from "@/lib/validators/vendor-registration";
import { Check, Wallet, Sparkles } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";

interface StepPlanProps {
  value: PlanForm;
  onChange: (patch: Partial<PlanForm>) => void;
}

const PLAN_OPTIONS = [
  {
    id: "gratis" as const,
    tag: "Primer mes gratis",
    title: "Plan Gratis",
    price: "S/ 0",
    period: "el primer mes",
    subprice: "Después: 5% por venta",
    Icon: Wallet,
    features: [
      "Hasta 50 productos activos",
      "Pagos Yape, Plin y efectivo",
      "Soporte por WhatsApp",
      "Aparecé en el marketplace",
      "Delivery coordinado por Buleje",
    ],
    highlight: false,
  },
  {
    id: "pro" as const,
    tag: "Recomendado",
    title: "Plan Pro",
    price: "S/ 29",
    period: "/mes",
    subprice: "0% comisión por venta",
    Icon: Sparkles,
    features: [
      "Productos ilimitados",
      "Facturación electrónica SUNAT",
      "Estadísticas y reportes avanzados",
      "Promociones y cupones",
      "Soporte prioritario + onboarding 1:1",
    ],
    highlight: true,
  },
] as const;

export default function StepPlan({ value, onChange }: StepPlanProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <Wallet className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.5} aria-hidden="true" />
          Elige tu plan
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Puedes cambiar cuando quieras. Sin multas ni trámites escondidos.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PLAN_OPTIONS.map((plan) => {
          const selected = value.plan === plan.id;
          const Icon = plan.Icon;
          return (
            <label
              key={plan.id}
              className={cn(
                "relative flex cursor-pointer flex-col gap-4 rounded-2xl border-2 bg-[var(--surface-canvas)] p-6 transition-all",
                selected
                  ? "border-[var(--text-primary)] bg-[var(--surface-raised)]"
                  : plan.highlight
                    ? "border-[var(--rule-strong)] hover:border-[var(--text-primary)]"
                    : "border-[var(--rule-base)] hover:border-[var(--rule-strong)]",
              )}
            >
              <input
                type="radio"
                name="plan"
                value={plan.id}
                checked={selected}
                onChange={() => onChange({ plan: plan.id })}
                className="sr-only"
              />
              {/* Tag */}
              <span
                className={cn(
                  "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.15em]",
                  plan.highlight
                    ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                    : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
                )}
              >
                {plan.tag}
              </span>

              {/* Header plan */}
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                  <Icon className="h-5 w-5 text-[var(--text-primary)]" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    {plan.title}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                      {plan.price}
                    </span>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {plan.period}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {plan.subprice}
                  </p>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-2 border-t border-[var(--rule-base)] pt-4">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
                  >
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-primary)]"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Selected indicator */}
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              )}
            </label>
          );
        })}
      </div>

      <p className="text-center text-xs text-[var(--text-tertiary)]">
        Puedes cambiar o cancelar desde tu panel cuando quieras.
      </p>
    </div>
  );
}
