"use client";

/**
 * BenefitsTabs — sección interactiva con tabs por categoría.
 * El usuario clickea Vender/Cobrar/Entregar/Fidelizar y ve la feature
 * destacada con preview lado a lado.
 */

import { useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  ShoppingBag,
  Banknote,
  Bike,
  Heart,
  Check,
} from "@buleje/design-system/icons";

type CategoryId = "vender" | "cobrar" | "entregar" | "fidelizar";

interface Category {
  id: CategoryId;
  label: string;
  icon: typeof ShoppingBag;
  headline: string;
  highlight: string;
  features: string[];
  metric: { value: string; label: string };
  bg: string;
}

const CATEGORIES: Category[] = [
  {
    id: "vender",
    label: "Vendé más",
    icon: ShoppingBag,
    headline: "Aparecé donde tus clientes están buscando",
    highlight: "buscando",
    features: [
      "Tu negocio en buscadores y mapa local",
      "Catálogo ilimitado con fotos, variantes y stock",
      "Promociones y cupones automáticos",
      "Notificaciones push a tus clientes",
    ],
    // Brandon mayo 2026: quitar métricas inventadas + paleta consistente
    // (no naranja/rosa). Ahora un beneficio real verificable.
    metric: { value: "24/7", label: "disponible para tus clientes" },
    bg: "from-[var(--accent)] via-[var(--accent)] to-emerald-700",
  },
  {
    id: "cobrar",
    label: "Cobrá rápido",
    icon: Banknote,
    headline: "Yape, Plin, tarjeta o efectivo — todos en uno",
    highlight: "todos en uno",
    features: [
      "Cobros Yape y Plin con confirmación instantánea",
      "Stripe / tarjeta para suscripciones",
      "Fiado digital con recordatorios automáticos",
      "Facturación SUNAT integrada",
    ],
    metric: { value: "Yape · Plin · Tarjeta", label: "todos los métodos del país" },
    bg: "from-[var(--accent)] via-teal-600 to-emerald-700",
  },
  {
    id: "entregar",
    label: "Entregá sin estrés",
    icon: Bike,
    headline: "Tus repartidores, los nuestros, o ambos",
    highlight: "los nuestros",
    features: [
      "Asignación automática de repartidores",
      "Tracking en vivo para tú y tu cliente",
      "Zonas de delivery con tarifas dinámicas",
      "Cobertura cross-vendor compartida",
    ],
    metric: { value: "GPS en vivo", label: "tú y el cliente lo ven en el mapa" },
    bg: "from-[var(--accent)] via-cyan-700 to-slate-800",
  },
  {
    id: "fidelizar",
    label: "Fidelizá clientes",
    icon: Heart,
    headline: "Que vuelvan, recomienden y compren más",
    highlight: "recomienden",
    features: [
      "Historial completo por cliente",
      "Programa Socio Buleje con cashback",
      "Cumpleaños y promociones personalizadas",
      "Reseñas y reputación pública",
    ],
    metric: { value: "CRM completo", label: "cada cliente, cada compra, en un lugar" },
    bg: "from-[var(--accent)] via-emerald-600 to-emerald-800",
  },
];

export default function BenefitsTabs() {
  const [active, setActive] = useState<CategoryId>("vender");
  const cat = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0];
  const Icon = cat.icon;
  const headlineParts = cat.headline.split(cat.highlight);

  return (
    <section className="py-20 sm:py-28 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              Qué obtienes
            </p>
            <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Cuatro músculos
              <br />
              <span className="text-[var(--accent)]">
                en una sola plataforma.
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            Hacé click en cada categoría — vas a ver exactamente qué
            herramientas vienen incluidas.
          </p>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map((c) => {
            const isActive = c.id === active;
            const TabIcon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(c.id)}
                className={`group inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-extrabold transition-all ${
                  isActive
                    ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-md"
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--rule-soft)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                }`}
              >
                <TabIcon className="h-4 w-4" strokeWidth={2.25} />
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Preview animado */}
        <AnimatePresence mode="wait">
          <m.div
            key={cat.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8"
          >
            {/* Lado izquierdo: descripción + features */}
            <div className="rounded-3xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-8 sm:p-10">
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br ${cat.bg} text-white shadow-md mb-6`}>
                <Icon className="h-6 w-6" strokeWidth={2.25} />
              </span>
              <h3 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.05]">
                {headlineParts[0]}
                <span className="text-[var(--accent)]">
                  {cat.highlight}
                </span>
                {headlineParts[1]}
              </h3>
              <ul className="mt-6 space-y-3">
                {cat.features.map((f, i) => (
                  <m.li
                    key={f}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * i + 0.15, duration: 0.3 }}
                    className="flex items-start gap-3 text-base text-[var(--text-secondary)]"
                  >
                    <span className="inline-flex h-5 w-5 mt-0.5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    {f}
                  </m.li>
                ))}
              </ul>
            </div>

            {/* Lado derecho: mockup ilustrativo grande con métrica */}
            <div className={`relative rounded-3xl bg-linear-to-br ${cat.bg} p-8 sm:p-10 text-white overflow-hidden flex flex-col justify-between min-h-[360px]`}>
              <div aria-hidden className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
              <div aria-hidden className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />

              <div className="relative">
                <p className="text-xs font-black uppercase tracking-widest opacity-90">
                  Resultado promedio
                </p>
                <p className="mt-2 text-[clamp(3.5rem,9vw,6rem)] font-black tabular-nums tracking-[-0.04em] leading-none">
                  {cat.metric.value}
                </p>
                <p className="mt-2 text-base font-bold opacity-90 max-w-xs">
                  {cat.metric.label}
                </p>
              </div>

              {/* Lista vertical de features con texto completo (antes:
                  3-col grid con texto truncado .split.slice(0,3) que dejaba
                  "Tu negocio en…", "Catálogo ilimitado con…" — daba la
                  sensación de panel placeholder inacabado). */}
              <ul className="relative mt-8 space-y-2">
                {cat.features.map((f, i) => (
                  <m.li
                    key={f}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * i + 0.2 }}
                    className="flex items-start gap-3 rounded-xl bg-white/12 backdrop-blur px-4 py-2.5"
                  >
                    <span className="inline-flex h-5 w-5 mt-0.5 shrink-0 items-center justify-center rounded-full bg-white/25">
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </span>
                    <span className="text-sm font-bold leading-snug">{f}</span>
                  </m.li>
                ))}
              </ul>
            </div>
          </m.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
