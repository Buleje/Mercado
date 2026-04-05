"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatLimit(value: number, unit: string): string {
  if (value === -1) return "Ilimitado";
  return `${value.toLocaleString("es-PE")} ${unit}`;
}

function formatPrice(value: number, yearly: boolean): string {
  if (value === 0) return "S/0";
  if (yearly) {
    const monthly = Math.round(value / 12);
    return `S/${monthly}`;
  }
  return `S/${value}`;
}

// ── Mapa de colores por plan ─────────────────────────────────────────────────
// Usamos clases explícitas para que Tailwind las incluya en el bundle.
const PLAN_STYLES: Record<
  PlanId,
  { ring: string; badge: string; button: string; icon: string }
> = {
  free: {
    ring: "ring-border",
    badge: "bg-muted/20 text-muted",
    button:
      "border border-border text-foreground hover:bg-surface dark:hover:bg-card",
    icon: "text-muted",
  },
  pro: {
    ring: "ring-primary",
    badge: "bg-primary text-white",
    button: "bg-primary text-white hover:bg-primary-dark",
    icon: "text-primary",
  },
  business: {
    ring: "ring-secondary",
    badge: "bg-secondary text-white",
    button: "bg-secondary text-white hover:bg-secondary-dark",
    icon: "text-secondary",
  },
  enterprise: {
    ring: "ring-warning",
    badge: "bg-warning text-white",
    button: "bg-warning text-white hover:brightness-95",
    icon: "text-warning",
  },
};

// ── Lista de features por plan ────────────────────────────────────────────────
function getPlanFeatures(planId: PlanId): string[] {
  const plan = PLANS[planId];
  const { limits } = plan;
  const features: string[] = [
    formatLimit(limits.maxProducts, "productos"),
    formatLimit(limits.maxUsers, "usuarios"),
    formatLimit(limits.maxOrdersPerMonth, "pedidos/mes"),
    limits.maxStores === -1
      ? "Sucursales ilimitadas"
      : limits.maxStores > 1
        ? `${limits.maxStores} sucursales`
        : "1 sucursal",
  ];
  if (limits.customDomain) features.push("Dominio personalizado");
  if (limits.advancedAnalytics) features.push("Analytics avanzado");
  if (limits.apiAccess) features.push("Acceso a API");
  if (limits.multiStore) features.push("Multi-sucursal");
  if (limits.prioritySupport) features.push("Soporte prioritario");
  if (limits.whiteLabel) features.push("White-label");
  if (limits.sla) features.push("SLA garantizado");
  if (limits.dedicatedSupport) features.push("Soporte dedicado");
  return features;
}

// ── Icono de check / x ────────────────────────────────────────────────────────
function CheckIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg
        className="mt-0.5 size-4 shrink-0 text-primary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <svg
      className="mt-0.5 size-4 shrink-0 text-muted/40"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface PricingTableProps {
  selectedPlan?: string;
  onSelectPlan?: (plan: string) => void;
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function PricingTable({
  selectedPlan,
  onSelectPlan,
}: PricingTableProps) {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="w-full">
      {/* Toggle mensual / anual */}
      <div className="mb-10 flex items-center justify-center gap-3">
        <span
          className={`text-sm font-medium transition-colors ${
            !yearly ? "text-foreground" : "text-muted"
          }`}
        >
          Mensual
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={yearly}
          onClick={() => setYearly((v) => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            yearly ? "bg-primary" : "bg-border"
          }`}
        >
          <span className="sr-only">Cambiar a facturación anual</span>
          <span
            className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
              yearly ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium transition-colors ${
            yearly ? "text-foreground" : "text-muted"
          }`}
        >
          Anual
          <span className="ml-1.5 rounded-full bg-success/10 px-1.5 py-0.5 text-xs font-semibold text-success">
            -20%
          </span>
        </span>
      </div>

      {/* Grid de planes */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((planId, index) => {
          const plan = PLANS[planId];
          const styles = PLAN_STYLES[planId];
          const features = getPlanFeatures(planId);
          const isPopular = !!plan.popular;
          const isSelected = selectedPlan === planId;
          const priceDisplay = formatPrice(
            yearly ? plan.priceYearly : plan.priceMonthly,
            yearly,
          );

          return (
            <motion.div
              key={planId}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.07 }}
              className={`relative flex flex-col rounded-2xl bg-card p-6 ring-1 dark:bg-card ${styles.ring} ${
                isSelected ? "ring-2" : ""
              } ${isPopular ? "ring-2 shadow-lg shadow-primary/10" : ""}`}
            >
              {/* Badge popular */}
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${styles.badge}`}
                  >
                    Mas popular
                  </span>
                </div>
              )}

              {/* Cabecera */}
              <div className="mb-4">
                <h3 className="text-base font-bold text-foreground">
                  {plan.name}
                </h3>
                <p className="mt-1 text-sm text-muted leading-snug">
                  {plan.description}
                </p>
              </div>

              {/* Precio */}
              <div className="mb-6">
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-extrabold text-foreground tabular-nums">
                    {priceDisplay}
                  </span>
                  {plan.priceMonthly > 0 && (
                    <span className="mb-1 text-sm text-muted">/mes</span>
                  )}
                </div>
                {yearly && plan.priceYearly > 0 && (
                  <p className="mt-0.5 text-xs text-muted">
                    S/{plan.priceYearly.toLocaleString("es-PE")} facturado
                    anualmente
                  </p>
                )}
                {plan.priceMonthly === 0 && (
                  <p className="mt-0.5 text-xs text-muted">Para siempre</p>
                )}
              </div>

              {/* CTA */}
              {onSelectPlan ? (
                <button
                  type="button"
                  onClick={() => onSelectPlan(planId)}
                  className={`mb-6 w-full rounded-xl py-2.5 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] ${styles.button} ${
                    isSelected ? "ring-2 ring-primary ring-offset-1" : ""
                  }`}
                >
                  {isSelected ? "Plan seleccionado" : "Elegir plan"}
                </button>
              ) : (
                <Link
                  href={`/plataforma/registro?plan=${planId}`}
                  className={`mb-6 block w-full rounded-xl py-2.5 text-center text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] flex items-center justify-center ${styles.button}`}
                >
                  {plan.priceMonthly === 0 ? "Empezar gratis" : "Empezar"}
                </Link>
              )}

              {/* Divisor */}
              <hr className="mb-5 border-border/60" />

              {/* Lista de features */}
              <ul className="flex flex-col gap-2.5">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-foreground/80">
                    <CheckIcon active={true} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
