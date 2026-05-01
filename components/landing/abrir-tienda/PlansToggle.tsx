"use client";

/**
 * PlansToggle — selector mensual/anual con descuento + 3 planes interactivos.
 * Click en una feature de un plan inferior agrega highlight para mostrar
 * por qué subir.
 */

import { useState } from "react";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { Check, Sparkles } from "@buleje/design-system/icons";

type Billing = "mensual" | "anual";

interface Plan {
  name: string;
  monthly: number;
  description: string;
  highlighted: boolean;
  cta: string;
  href: string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    name: "Gratis",
    monthly: 0,
    description: "Probá sin riesgo",
    highlighted: false,
    cta: "Comenzar gratis",
    href: "/marketplace/registrar",
    features: [
      "Hasta 50 productos",
      "Tienda online básica",
      "POS digital",
      "Reportes básicos",
      "Soporte por WhatsApp",
    ],
  },
  {
    name: "Pro",
    monthly: 49,
    description: "El más elegido",
    highlighted: true,
    cta: "Empezar con Pro",
    href: "/marketplace/registrar?plan=pro",
    features: [
      "Productos ilimitados",
      "Inventario, caja y reportes",
      "Cupones y promociones",
      "Facturación SUNAT",
      "Delivery integrado",
      "Fiado digital",
      "Tu propio repartidor",
    ],
  },
  {
    name: "Enterprise",
    monthly: 199,
    description: "Para escalar fuerte",
    highlighted: false,
    cta: "Contactar ventas",
    href: "/marketplace/registrar?plan=enterprise",
    features: [
      "Todo lo de Pro",
      "Multi-sucursal",
      "API + webhooks",
      "Integración ERP",
      "Predicción IA de demanda",
      "Dominio white-label",
      "Soporte 24/7",
    ],
  },
];

export default function PlansToggle() {
  const [billing, setBilling] = useState<Billing>("mensual");
  const isAnnual = billing === "anual";
  const discount = 0.2; // 20% off al año

  return (
    <section
      id="planes"
      className="py-20 sm:py-28 bg-[var(--surface-canvas)] scroll-mt-20"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
            <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
            Planes transparentes
          </p>
          <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
            Empezás gratis.
            <br />
            <span className="italic font-serif text-[var(--accent)]">
              Pagás solo si crecés.
            </span>
          </h2>
          <p className="mt-6 text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
            Sin contratos, sin permanencia, sin letra chica. Cambiás de plan
            cuando quieras.
          </p>
        </div>

        {/* Toggle mensual/anual */}
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
                  {b === "mensual" ? "Mensual" : "Anual"}
                  {b === "anual" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-success)] text-white px-2 py-0.5 text-xs font-black">
                      <Sparkles className="h-3 w-3" strokeWidth={2.5} />
                      -20%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-5 lg:gap-6">
          {PLANS.map((plan) => {
            const effective = isAnnual
              ? Math.round(plan.monthly * (1 - discount))
              : plan.monthly;
            return (
              <m.div
                key={plan.name}
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
                className={`relative rounded-3xl p-7 flex flex-col ${
                  plan.highlighted
                    ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-2xl shadow-[var(--accent)]/20 md:-mt-6 md:mb-6"
                    : "bg-[var(--surface-raised)] border border-[var(--rule-base)]"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[var(--accent)] text-white text-xs font-black uppercase tracking-wider px-4 py-1.5 rounded-full shadow-md">
                    Más popular
                  </span>
                )}

                <div className="mb-5">
                  <h3 className={`text-xl font-black tracking-[var(--ls-tight)] ${plan.highlighted ? "text-[var(--surface-canvas)]" : "text-[var(--text-primary)]"}`}>
                    {plan.name}
                  </h3>
                  <p className={`mt-1 text-sm ${plan.highlighted ? "text-[var(--surface-canvas)]/70" : "text-[var(--text-tertiary)]"}`}>
                    {plan.description}
                  </p>
                </div>

                {/* Price con animación */}
                <div className={`mb-5 pb-5 border-b ${plan.highlighted ? "border-white/15" : "border-[var(--rule-soft)]"}`}>
                  <AnimatePresence mode="wait">
                    <m.div
                      key={`${plan.name}-${billing}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-baseline gap-1"
                    >
                      <span className={`text-[clamp(2.25rem,5vw,3.25rem)] font-black tabular-nums tracking-[-0.025em] leading-none ${
                        plan.highlighted ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
                      }`}>
                        {plan.monthly === 0 ? "S/ 0" : (
                          <>
                            S/ <NumberFlow value={effective} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
                          </>
                        )}
                      </span>
                      <span className={`text-sm font-semibold ${plan.highlighted ? "text-[var(--surface-canvas)]/60" : "text-[var(--text-tertiary)]"}`}>
                        /mes
                      </span>
                    </m.div>
                  </AnimatePresence>
                  {isAnnual && plan.monthly > 0 && (
                    <p className={`mt-2 text-xs font-bold ${plan.highlighted ? "text-[var(--brand-success)]" : "text-[var(--brand-success)]"}`}>
                      Ahorrás S/ {plan.monthly * 12 - effective * 12} al año
                    </p>
                  )}
                </div>

                <ul className="flex-1 space-y-2.5 mb-6">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className={`flex items-start gap-2 text-sm ${plan.highlighted ? "text-[var(--surface-canvas)]/85" : "text-[var(--text-secondary)]"}`}
                    >
                      <Check
                        className={`h-4 w-4 mt-0.5 shrink-0 ${plan.highlighted ? "text-[var(--accent)]" : "text-[var(--brand-success)]"}`}
                        strokeWidth={2.75}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={`block text-center font-extrabold py-3.5 rounded-2xl transition-all ${
                    plan.highlighted
                      ? "bg-[var(--accent)] text-white hover:opacity-90 shadow-md"
                      : "bg-[var(--surface-sunken)] text-[var(--text-primary)] border-2 border-[var(--rule-base)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  }`}
                >
                  {plan.cta}
                </Link>
              </m.div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-[var(--text-tertiary)]">
          Plan Gratis sin límite de tiempo · Cancelás cuando quieras
        </p>
      </div>
    </section>
  );
}
