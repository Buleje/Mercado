// ═══════════════════════════════════════════════════════
// BENEFITS BLOCK - Editable Benefits Section
// ═══════════════════════════════════════════════════════

"use client";

import { z } from "zod";
import Link from "next/link";
import { Truck, BadgePercent, ShieldCheck, Leaf, ArrowRight } from "@buleje/design-system/icons";

// ─── Schema & Types ─────────────────────────────────────
export const BenefitsBlockSchema = z.object({
  badge: z.string().default("Nuestras ventajas"),
  title: z.string().default("¿Por qué elegirnos?"),
  subtitle: z.string().default("Tu tienda virtual de productos de consumo con delivery rápido y pago fácil."),
  benefits: z.array(z.object({
    icon: z.string().default("Truck"),
    title: z.string(),
    description: z.string(),
    iconBg: z.string().default("bg-[var(--data-success-500)]"),
  })).default([
    {
      icon: "Truck",
      title: "Delivery Rápido",
      description: "Entrega a domicilio en toda tu zona.",
      iconBg: "bg-[var(--data-success-500)]",
    },
    {
      icon: "BadgePercent",
      title: "Pago con Yape o Efectivo",
      description: "Paga fácil con Yape o en efectivo contra entrega.",
      iconBg: "bg-[var(--data-warning-500)]",
    },
    {
      icon: "ShieldCheck",
      title: "Calidad Garantizada",
      description: "Productos seleccionados y verificados para tu familia.",
      iconBg: "bg-[var(--data-success-500)]",
    },
    {
      icon: "Leaf",
      title: "Productos Frescos",
      description: "Carne, pollo, frutas y verduras frescas todos los días.",
      iconBg: "bg-indigo-500",
    },
  ]),
  showCTA: z.boolean().default(true),
  ctaText: z.string().default("Empieza a comprar ahora"),
  ctaLink: z.string().default("/tienda"),
});

export type BenefitsBlockProps = z.infer<typeof BenefitsBlockSchema>;

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Truck,
  BadgePercent,
  ShieldCheck,
  Leaf,
};

// ─── Component ──────────────────────────────────────────
export default function BenefitsBlock(props: Partial<BenefitsBlockProps>) {
  const {
    badge = "Nuestras ventajas",
    title = "¿Por qué elegirnos?",
    subtitle,
    benefits = [],
    showCTA = true,
    ctaText = "Empieza a comprar ahora",
    ctaLink = "/tienda",
  } = props;

  return (
    <section id="beneficios" className="py-20 sm:py-28 bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            {badge}
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-5 text-base sm:text-lg text-muted max-w-2xl mx-auto">
              {subtitle}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {benefits.map((benefit, i) => {
            const Icon = ICONS[benefit.icon] || Truck;
            return (
              <div
                key={i}
                className="group relative bg-white dark:bg-card rounded-2xl sm:rounded-3xl p-7 sm:p-8 text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-b-full ${benefit.iconBg} opacity-60`} />

                <div className="relative z-10">
                  <div
                    className={`inline-flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-2xl ${benefit.iconBg} shadow-lg mb-5 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-sm text-muted leading-relaxed">
                    {benefit.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        {showCTA && (
          <div className="text-center mt-12">
            <Link
              href={ctaLink}
              className="group inline-flex items-center gap-2.5 text-primary hover:text-primary-dark font-bold text-base transition-colors"
            >
              {ctaText}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── CMS Metadata ───────────────────────────────────────
export const BenefitsBlockMetadata = {
  type: "benefits",
  name: "Beneficios",
  description: "Muestra las ventajas y beneficios del servicio",
  category: "marketing" as const,
  icon: "Gift",
  defaultProps: (() => { const parsed = BenefitsBlockSchema.safeParse({}); return parsed.success ? parsed.data : { badge: "Nuestras ventajas", title: "¿Por qué elegirnos?", subtitle: "", benefits: [], showCTA: true, ctaText: "Empieza a comprar ahora", ctaLink: "/tienda" }; })(),
  propsSchema: BenefitsBlockSchema,
};
