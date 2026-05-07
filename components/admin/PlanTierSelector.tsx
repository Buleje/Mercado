"use client";

/**
 * components/admin/PlanTierSelector.tsx
 *
 * Selector visual de los 4 planes (Básico / Pro / Enterprise / Max).
 *
 * Diseñado para vivir dentro de SettingsModule como sección "Plan",
 * pero también puede usarse standalone en `/admin/plan`.
 *
 * Comportamiento al elegir plan:
 *   - **Upgrade** (a un plan mayor) → redirige a `/admin/plan/checkout?plan=X`
 *     donde el dueño elige método de pago (Yape, Stripe, transferencia).
 *     Solo después del pago confirmado se activa el nuevo plan.
 *   - **Downgrade** (a un plan menor) → cambio inmediato vía `setCurrentPlan`
 *     (no requiere pago). Se dispara `buleje-plan-change` para que el
 *     AdminSidebar reordene los tabs sin reload.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, Sparkles, Zap, Crown, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { PLANS, PLAN_ORDER, type PlanTier } from "@/lib/billing/plan-tiers";

const ACCENT_CLASSES: Record<
  PlanTier,
  { ring: string; badge: string; icon: string; iconBg: string; button: string }
> = {
  basico: {
    ring: "border-[var(--rule-base)]",
    badge: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
    icon: "text-[var(--text-secondary)]",
    iconBg: "bg-[var(--surface-sunken)]",
    button:
      "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90",
  },
  pro: {
    ring: "border-[var(--accent)] ring-2 ring-[var(--accent)]/20",
    badge: "bg-[var(--accent-soft)] text-[var(--accent)]",
    icon: "text-[var(--accent)]",
    iconBg: "bg-[var(--accent-soft)]",
    button: "bg-[var(--accent)] text-white hover:scale-[1.02] hover:shadow-lg",
  },
  enterprise: {
    ring:
      "border-indigo-300 dark:border-indigo-500/40 ring-2 ring-indigo-500/15",
    badge:
      "bg-indigo-50 text-[var(--text-primary)] dark:bg-indigo-500/10",
    icon: "text-[var(--text-primary)]",
    iconBg: "bg-indigo-50 dark:bg-indigo-500/10",
    button:
      "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02] hover:shadow-lg",
  },
  max: {
    ring:
      "border-amber-400 dark:border-[var(--data-warning-500)]/40 ring-2 ring-[var(--data-warning-500)]/15",
    badge:
      "bg-amber-50 text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-amber-400",
    icon: "text-[var(--data-warning-600)] dark:text-amber-400",
    iconBg: "bg-amber-50 dark:bg-[var(--data-warning-500)]/10",
    button:
      "bg-[var(--accent)] text-white hover:scale-[1.02] hover:shadow-lg",
  },
};

const PLAN_ICONS: Record<PlanTier, typeof Sparkles> = {
  basico: Sparkles,
  pro: Zap,
  enterprise: Rocket,
  max: Crown,
};

const PLAN_HIGHLIGHTS: Record<PlanTier, readonly string[]> = {
  basico: [
    "POS digital y pedidos básicos",
    "Hasta 50 productos",
    "Fiados y clientes",
    "Mi tienda online",
    "Soporte por WhatsApp",
  ],
  pro: [
    "Todo lo de Básico, sin límite de productos",
    "Facturación SUNAT (boletas + facturas)",
    "Compras y contratos a proveedor",
    "Analytics Pro + control de tesorería",
    "Marketplace y delivery integrado",
  ],
  enterprise: [
    "Todo lo de Pro + IA Command Center",
    "Forecasting y sugerencias IA",
    "Multi-sucursal (hasta 10)",
    "Subscriptions, gift cards, programa Socio",
    "API y webhooks personalizados",
  ],
  max: [
    "Todo desbloqueado, sin límites",
    "Lives streaming en vivo",
    "White-label / dominio propio",
    "Soporte prioritario 24/7",
    "Onboarding premium con capacitación",
  ],
};

interface PlanTierSelectorProps {
  /** Compact mode: oculta highlights, muestra solo título + price + CTA. */
  compact?: boolean;
  /** Callback opcional al cambiar de plan. */
  onChange?: (plan: PlanTier) => void;
}

export default function PlanTierSelector({
  compact = false,
  onChange,
}: PlanTierSelectorProps) {
  const router = useRouter();
  const { plan: currentPlan, setPlan } = usePlanTier();
  const [justChangedTo, setJustChangedTo] = useState<PlanTier | null>(null);

  const handleSelect = (next: PlanTier) => {
    if (next === currentPlan) return;
    const currentIdx = PLAN_ORDER.indexOf(currentPlan);
    const nextIdx = PLAN_ORDER.indexOf(next);
    const isUpgrade = nextIdx > currentIdx;

    // Upgrade: a una página de pago (Yape / Stripe / transferencia / efectivo).
    // Solo después de que el pago se confirme, el plan se activa.
    if (isUpgrade) {
      router.push(`/admin/plan/checkout?plan=${next}`);
      return;
    }

    // Downgrade o cambio lateral: aplicación inmediata sin pago.
    setPlan(next);
    setJustChangedTo(next);
    onChange?.(next);
    setTimeout(() => setJustChangedTo(null), 2500);
  };

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--surface-canvas)] to-[var(--surface-sunken)] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-md">
            <Crown className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Plan actual
            </p>
            <h3 className="mt-1 text-xl sm:text-2xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight">
              {PLANS[currentPlan].label}
              <span className="ml-2 text-sm font-bold text-[var(--text-tertiary)]">
                {PLANS[currentPlan].price}
                {PLANS[currentPlan].period}
              </span>
            </h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {PLANS[currentPlan].tagline}. {PLANS[currentPlan].unlockedTabs.size}{" "}
              módulos desbloqueados.
            </p>
          </div>
        </div>

        {justChangedTo && (
          <div
            role="status"
            className="mt-4 flex items-center gap-2 rounded-xl border-2 border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/8 px-3 py-2 text-sm font-bold text-[var(--data-success-500)]"
          >
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
            Plan cambiado a <strong>{PLANS[justChangedTo].label}</strong> · el
            sidebar se actualizó automáticamente
          </div>
        )}
      </div>

      {/* ── Grid de planes ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLAN_ORDER.map((tier) => {
          const def = PLANS[tier];
          const Icon = PLAN_ICONS[tier];
          const accent = ACCENT_CLASSES[tier];
          const isCurrent = tier === currentPlan;
          const tierIdx = PLAN_ORDER.indexOf(tier);
          const currentIdx = PLAN_ORDER.indexOf(currentPlan);
          const isUpgrade = tierIdx > currentIdx;
          const isDowngrade = tierIdx < currentIdx;

          return (
            <article
              key={tier}
              className={cn(
                "relative rounded-2xl border-2 bg-[var(--surface-canvas)] p-5 transition-all flex flex-col",
                accent.ring,
                isCurrent && "shadow-md",
                !isCurrent && "hover:-translate-y-0.5 hover:shadow-md",
              )}
            >
              {isCurrent && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)] px-3 py-1 text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-white shadow-sm">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                  Activo
                </span>
              )}

              <div className="flex items-center gap-3 mb-3">
                <span
                  className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-xl",
                    accent.iconBg,
                    accent.icon,
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "inline-flex items-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] rounded-full px-2 py-0.5",
                      accent.badge,
                    )}
                  >
                    {def.label}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)] line-clamp-1">
                    {def.tagline}
                  </p>
                </div>
              </div>

              <div className="mb-3 pb-3 border-b-2 border-[var(--rule-base)]">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black tabular-nums text-[var(--text-primary)] leading-none">
                    {def.price}
                  </span>
                  {def.period && (
                    <span className="text-xs font-bold text-[var(--text-tertiary)]">
                      {def.period}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs font-bold text-[var(--text-secondary)]">
                  {def.unlockedTabs.size} módulos ·{" "}
                  {def.limits.maxProducts === null
                    ? "Productos ∞"
                    : `${def.limits.maxProducts} productos`}
                </p>
              </div>

              {!compact && (
                <ul className="flex-1 space-y-2 mb-5">
                  {PLAN_HIGHLIGHTS[tier].map((h) => (
                    <li
                      key={h}
                      className="flex items-start gap-2 text-xs font-semibold text-[var(--text-primary)]"
                    >
                      <Check
                        className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", accent.icon)}
                        strokeWidth={3}
                      />
                      <span className="leading-tight">{h}</span>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => handleSelect(tier)}
                disabled={isCurrent}
                className={cn(
                  "mt-auto inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-black transition-all",
                  isCurrent
                    ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
                    : accent.button,
                )}
              >
                {isCurrent ? (
                  <>
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    Plan activo
                  </>
                ) : isUpgrade ? (
                  <>
                    Subir a {def.label}
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </>
                ) : isDowngrade ? (
                  <>Cambiar a {def.label}</>
                ) : (
                  <>Elegir {def.label}</>
                )}
              </button>
            </article>
          );
        })}
      </div>

      {/* ── Disclaimer ───────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
        <Lock className="h-5 w-5 shrink-0 mt-0.5 text-[var(--text-tertiary)]" strokeWidth={2.25} />
        <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong className="text-[var(--text-primary)]">
            Cambio inmediato.
          </strong>{" "}
          Al elegir un plan nuevo, los módulos del sidebar se actualizan al
          instante. Subís y bajás cuando quieras, sin permanencia ni penalidades.
          La facturación real se gestiona desde Stripe en producción.
        </div>
      </div>
    </div>
  );
}
