"use client";

/**
 * FeaturesGrid9 — Grid 3x3 de 9 cards grandes (una por feature Amazon-level).
 *
 * Cada card: IconBadge grande + CardTitle + BodyText + chip-button "Probalo →".
 */

import Link from "next/link";
import {
  CardTitle,
  BodyText,
  SectionTitle,
  IconBadge,
  cn,
} from "@buleje/design-system";
import {
  Scale,
  Calendar,
  Gift,
  Crown,
  CircleDot,
  Bot,
  MapPin,
  Zap,
  Store,
  ArrowRight,
} from "@buleje/design-system/icons";

type Feature = {
  slug: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
  href: string;
  cta: string;
};

const FEATURES: Feature[] = [
  {
    slug: "comparar",
    icon: Scale,
    title: "Comparar productos",
    description:
      "Pon hasta 4 productos lado a lado. Precio, tienda, stock — todo en una vista para decidir tranquilo.",
    href: "/marketplace/comparar",
    cta: "Comparar ahora",
  },
  {
    slug: "bodega-al-mes",
    icon: Calendar,
    title: "Bodega al Mes",
    description:
      "Suscribite a tus productos de todos los días y olvidate de reordenar. Llegan solos, cuando los pides.",
    href: "/marketplace",
    cta: "Suscribirme",
  },
  {
    slug: "gift-cards",
    icon: Gift,
    title: "Gift Cards",
    description:
      "Tarjetas digitales desde S/ 20 para regalar cualquier bodega del marketplace. Sin vencimiento.",
    href: "/marketplace/gift-cards",
    cta: "Regalar",
  },
  {
    slug: "socio-buleje",
    icon: Crown,
    title: "Socio Buleje",
    description:
      "Delivery gratis ilimitado, 5% cashback y precios exclusivos. Desde S/ 19/mes, 30 días gratis.",
    href: "/socio-buleje",
    cta: "Volverme Socio",
  },
  {
    slug: "en-vivo",
    icon: CircleDot,
    title: "En Vivo",
    description:
      "Las bodegas transmiten lo fresco del día. Pregunta en el chat y compra sin salir del stream.",
    href: "/marketplace/en-vivo",
    cta: "Ver transmisiones",
  },
  {
    slug: "asistente",
    icon: Bot,
    title: "Asistente IA",
    description:
      "Preguntale lo que quieras sobre productos: frescura, usos, descuentos. Te responde al toque.",
    href: "/asistente",
    cta: "Probarlo",
  },
  {
    slug: "tracking",
    icon: MapPin,
    title: "Seguimiento en tiempo real",
    description:
      "Mira dónde está tu pedido minuto a minuto. El motorizado en el mapa, como esperar a un amigo.",
    href: "/tracking",
    cta: "Ver mis pedidos",
  },
  {
    slug: "one-click-buy",
    icon: Zap,
    title: "1-Click Buy",
    description:
      "Compra lo de siempre con un toque. Dirección y pago ya configurados — listo en segundos.",
    href: "/marketplace",
    cta: "Ir al marketplace",
  },
  {
    slug: "vender",
    icon: Store,
    title: "Vende en Buleje",
    description:
      "Abre tu tienda online como si abrieras la persiana de tu bodega. Gratis el primer mes.",
    href: "/vender",
    cta: "Abrir tienda",
  },
];

export function FeaturesGrid9() {
  return (
    <section
      id="features-principales"
      className="border-b border-[var(--rule-base)] bg-[var(--surface-canvas)] py-16 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-2xl space-y-3 mb-10 sm:mb-14">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Features principales
          </span>
          <SectionTitle className="text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)] font-extrabold">
            9 cosas nuevas para tu casa y tu bodega
          </SectionTitle>
          <BodyText className="text-[length:var(--ts-base)] text-[var(--text-secondary)] leading-relaxed">
            Cada feature es gratis, hecha para el barrio y probada en bodegas
            reales de Pucallpa. Tocá una para entrar.
          </BodyText>
        </header>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.slug}>
                <Link
                  href={feature.href}
                  className={cn(
                    "group relative flex h-full flex-col gap-4 rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6",
                    "transition-all duration-[var(--dur-base)]",
                    "hover:border-[var(--text-primary)] hover:elev-2",
                  )}
                >
                  <IconBadge size="lg" shape="square" intent="primary">
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </IconBadge>

                  <div className="flex-1 space-y-2">
                    <CardTitle className="text-[length:var(--ts-lg)] font-bold">
                      {feature.title}
                    </CardTitle>
                    <BodyText className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
                      {feature.description}
                    </BodyText>
                  </div>

                  <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] transition-all group-hover:gap-2.5">
                    {feature.cta}
                    <ArrowRight
                      className="h-3.5 w-3.5"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default FeaturesGrid9;
