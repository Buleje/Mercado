"use client";

/**
 * PlansToggle — selector mensual/anual + 4 planes (Estándar, Pro,
 * Enterprise, Max). Lee de `lib/billing/plan-tiers.ts` (fuente única
 * que se refleja en superadmin y panel del negocio).
 *
 * Brandon mayo 2026 — sin tier "Gratis"; el Estándar tiene 1er mes
 * 100% off como anclaje psicológico ("entrás gratis, después pagás
 * solo 39"). El Pro lleva badge "Más elegido" y aparece más alto.
 */

import { useState } from "react";
import Link from "next/link";
import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { Check, Sparkles, Target } from "@buleje/design-system/icons";
import {
  PLANS,
  PLAN_ORDER,
  type PlanTier,
  type PlanDefinition,
  firstMonthPrice,
  monthlyEquivalentAnnual,
  annualSavings,
} from "@/lib/billing/plan-tiers";
import { useLocale } from "@/contexts/locale-context";

type Billing = "mensual" | "anual";

const PLAN_HREF: Record<PlanTier, string> = {
  basico: "/marketplace/registrar?plan=basico",
  pro: "/marketplace/registrar?plan=pro",
  enterprise: "/marketplace/registrar?plan=enterprise",
  max: "/marketplace/registrar?plan=max",
};

const PLAN_CTA_KEYS: Record<PlanTier, string> = {
  basico: "plans.cta.basico",
  pro: "plans.cta.pro",
  enterprise: "plans.cta.enterprise",
  max: "plans.cta.max",
};

export default function PlansToggle() {
  const [billing, setBilling] = useState<Billing>("mensual");
  const isAnnual = billing === "anual";
  const { t } = useLocale();

  return (
    <section
      id="planes"
      className="py-20 sm:py-28 bg-[var(--surface-canvas)] scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
            <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
            {t("plans.kicker")}
          </p>
          <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
            {t("landing.plans.title")}{" "}
            <span className="italic font-serif text-[var(--accent)]">
              {t("landing.plans.titleAccent")}
            </span>
          </h2>
          <p className="mt-6 text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
            {t("landing.plans.description")}
          </p>
        </div>

        {/* Toggle mensual / anual */}
        <div className="flex justify-center mb-12">
          <div role="tablist" className="inline-flex items-center gap-1 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
            {(["mensual", "anual"] as Billing[]).map((b) => {
              const active = b === billing;
              return (
                <button
                  key={b}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setBilling(b)}
                  className={`relative inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-extrabold transition-all ${
                    active
                      ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {b === "mensual" ? t("plans.monthly") : t("plans.annual")}
                  {b === "anual" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)] text-white px-2 py-0.5 text-xs font-black">
                      <Sparkles className="h-3 w-3" strokeWidth={2.5} />
                      {t("plans.upTo25off")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid 4 planes (mobile: 1 col, tablet 2, desktop 4) */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLAN_ORDER.map((tier) => (
            <PlanCard key={tier} plan={PLANS[tier]} isAnnual={isAnnual} />
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-[var(--text-tertiary)]">
          {t("plans.allInclude")}
        </p>
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  isAnnual,
}: {
  plan: PlanDefinition;
  isAnnual: boolean;
}) {
  const { t } = useLocale();
  const recommended = plan.recommended === true;
  const monthlyShown = isAnnual ? monthlyEquivalentAnnual(plan) : plan.monthlyPrice;
  const showFirstMonthBanner = !isAnnual && plan.firstMonthDiscount > 0;
  const firstMonth = firstMonthPrice(plan);
  const savings = annualSavings(plan);
  const href = PLAN_HREF[plan.id];
  const cta = t(PLAN_CTA_KEYS[plan.id]);
  // Respeta prefers-reduced-motion: sin pulsos ni bob para quien lo pidió.
  const reduce = useReducedMotion();

  return (
    // Wrapper relative: aloja el aura que respira DETRÁS de la card recomendada.
    // h-full + grid stretch hacen que todas las cards igualen alto.
    <div className="relative h-full">
      {/* Aura viva — halo de marca que respira (pulso lento infinito) detrás
          del plan "Más elegido". El blur sale del borde de la card = glow. */}
      {recommended && (
        <m.div
          aria-hidden
          className="pointer-events-none absolute -inset-2 sm:-inset-3 rounded-[2.25rem] bg-[var(--accent)] blur-2xl"
          style={reduce ? { opacity: 0.22 } : undefined}
          animate={reduce ? undefined : { opacity: [0.16, 0.4, 0.16], scale: [0.97, 1.03, 0.97] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <m.div
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        className={`relative h-full rounded-3xl p-6 flex flex-col ${
          recommended
            ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-2xl shadow-[var(--accent)]/30 ring-2 ring-[var(--accent)]"
            : "bg-[var(--surface-raised)] border-2 border-[var(--rule-base)]"
        }`}
      >
        {recommended && (
          // Badge flotante — bob suave (sube/baja 3.5px en loop). z-10 lo deja
          // sobre el aura. x:-50% centra (reemplaza -translate-x-1/2, que framer
          // pisaría al setear transform para animar y).
          <m.span
            className="absolute -top-3.5 left-1/2 z-10 inline-flex items-center gap-1 bg-[var(--accent-600,var(--accent))] text-white text-xs font-black uppercase tracking-wider px-4 py-1.5 rounded-full shadow-lg shadow-[var(--accent)]/40 whitespace-nowrap"
            style={{ x: "-50%" }}
            animate={reduce ? undefined : { y: [0, -3.5, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="h-3 w-3" strokeWidth={2.75} aria-hidden />
            {t("plans.mostChosen")}
          </m.span>
        )}

        {/* Header */}
        <div className="mb-4">
          <h3
            className={`text-xl font-black tracking-[var(--ls-tight)] ${
              recommended ? "text-[var(--surface-canvas)]" : "text-[var(--text-primary)]"
            }`}
          >
            {plan.label}
          </h3>
          {/* ¿Para quién es? — explica de un vistazo a qué negocio le sirve el
              plan, no solo qué incluye. Eyebrow "Ideal para" + frase guía. */}
          <div className="mt-2.5 flex items-start gap-2">
            <Target
              className="h-4 w-4 mt-[3px] shrink-0 text-[var(--accent)]"
              strokeWidth={2.25}
              aria-hidden
            />
            <p
              className={`text-sm font-semibold leading-snug ${
                recommended ? "text-[var(--surface-canvas)]/85" : "text-[var(--text-secondary)]"
              }`}
            >
              <span
                className={`block text-[10px] font-black uppercase tracking-[0.14em] mb-0.5 ${
                  recommended ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"
                }`}
              >
                {t("plans.idealFor")}
              </span>
              {t(`plans.tagline.${plan.id}`)}
            </p>
          </div>
        </div>

      {/* Precio — con tachado del original cuando hay descuento.
          Brandon mayo 2026: pidió tachados + persuasión visible. */}
      <div className={`mb-5 pb-5 border-b ${recommended ? "border-[var(--surface-canvas)]/15" : "border-[var(--rule-soft)]"}`}>
        {/* Línea con precio anterior tachado + badge de descuento */}
        {showFirstMonthBanner && (
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-base font-bold tabular-nums line-through decoration-2 ${
                recommended ? "text-[var(--surface-canvas)]/45" : "text-[var(--text-tertiary)]"
              }`}
            >
              S/ {plan.monthlyPrice}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)] text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-md">
              {plan.firstMonthDiscount === 100 ? t("plans.firstMonthFree") : `−${plan.firstMonthDiscount}%`}
            </span>
          </div>
        )}
        {isAnnual && (
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-base font-bold tabular-nums line-through decoration-2 ${
                recommended ? "text-[var(--surface-canvas)]/45" : "text-[var(--text-tertiary)]"
              }`}
            >
              S/ {plan.monthlyPrice}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)] text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-md">
              −{plan.annualDiscount}%
            </span>
          </div>
        )}

        <AnimatePresence mode="wait">
          <m.div
            key={`${plan.id}-${isAnnual ? "anual" : "mensual"}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex items-baseline gap-1"
          >
            <span
              className={`text-[clamp(2.25rem,4.5vw,3rem)] font-black tabular-nums tracking-[-0.025em] leading-none ${
                recommended ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
              }`}
            >
              S/{" "}
              <NumberFlow
                value={showFirstMonthBanner ? firstMonth : monthlyShown}
                format={{ maximumFractionDigits: 0 }}
                locales="es-PE"
              />
            </span>
            <span
              className={`text-sm font-semibold ${
                recommended ? "text-[var(--surface-canvas)]/60" : "text-[var(--text-tertiary)]"
              }`}
            >
              {showFirstMonthBanner ? t("plans.firstMonth") : `/${t("common.month")}`}
            </span>
          </m.div>
        </AnimatePresence>

        {/* Sub-mensaje persuasivo */}
        {showFirstMonthBanner && plan.firstMonthDiscount < 100 && (
          <p className={`mt-2 text-[11px] leading-snug ${recommended ? "text-[var(--surface-canvas)]/70" : "text-[var(--text-secondary)]"}`}>
            {t("plans.afterMonthly").split("·")[0]?.trim()} <strong>S/ {plan.monthlyPrice}/{t("common.month")}</strong> ·{" "}
            {t("plans.afterMonthly").split("·")[1]?.trim()}
          </p>
        )}
        {plan.firstMonthDiscount === 100 && !isAnnual && (
          <p className={`mt-2 text-[11px] leading-snug ${recommended ? "text-[var(--surface-canvas)]/70" : "text-[var(--text-secondary)]"}`}>
            <strong>{t("common.noCard")}</strong> ·{" "}
            {t("plans.noCardAfter").split("·")[1]?.trim()} S/ {plan.monthlyPrice}/{t("common.month")}
          </p>
        )}
        {isAnnual && (
          <p className={`mt-2 text-[11px] leading-snug ${recommended ? "text-[var(--surface-canvas)]/70" : "text-[var(--text-secondary)]"}`}>
            {t("plans.savings")} <strong>S/ {savings}</strong> (≈ {Math.round(savings / plan.monthlyPrice)} {t("common.month")})
          </p>
        )}
      </div>

      {/* Beneficios */}
      <ul className="flex-1 space-y-2 mb-6">
        {plan.highlights.map((highlight) => (
          <li
            key={highlight}
            className={`flex items-start gap-2 text-sm leading-snug ${
              recommended ? "text-[var(--surface-canvas)]/85" : "text-[var(--text-secondary)]"
            }`}
          >
            <Check
              className={`h-4 w-4 mt-0.5 shrink-0 ${
                recommended ? "text-[var(--accent)]" : "text-[var(--data-success-500)]"
              }`}
              strokeWidth={2.75}
            />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>

      <Link
        href={href}
        className={`block text-center font-extrabold py-3.5 rounded-2xl transition-all ${
          recommended
            ? "bg-[var(--accent-600,var(--accent))] text-white hover:opacity-90 shadow-md"
            : "bg-[var(--surface-sunken)] text-[var(--text-primary)] border-2 border-[var(--rule-base)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        }`}
      >
        {cta}
      </Link>
      </m.div>
    </div>
  );
}
