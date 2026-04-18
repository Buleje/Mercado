"use client";

/**
 * PathsByProfile — 4 caminos segun perfil del visitante.
 *
 * Cada camino: ilustracion + copy amigable + CTA.
 * - Si sos nuevo       -> /marketplace
 * - Si compras mucho   -> /socio-buleje
 * - Si tenes bodega    -> /vender
 * - Si buscas regalar  -> /marketplace/gift-cards
 */

import Link from "next/link";
import {
  CardTitle,
  BodyText,
  SectionTitle,
} from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import { CanastaVacia } from "@/components/ui-system/illustrations/empty-states";
import { BodegueroCelebrando } from "@/components/ui-system/illustrations/success-moments";
import { DoniaElena } from "@/components/ui-system/illustrations/pucallpa-locals";
import { CorazonLatiendo } from "@/components/ui-system/illustrations/contextual";

type Path = {
  slug: string;
  kicker: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  illustration: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
};

const PATHS: Path[] = [
  {
    slug: "nuevo",
    kicker: "Si sos nuevo",
    title: "Explorá las tiendas",
    description:
      "200+ bodegas del barrio esperando que las descubras. Arrancá por la más cercana.",
    href: "/marketplace",
    cta: "Explorar tiendas",
    illustration: CanastaVacia,
  },
  {
    slug: "frecuente",
    kicker: "Si compras mucho",
    title: "Volvete Socio",
    description:
      "Delivery gratis ilimitado, cashback y precios exclusivos. La membresía se paga sola.",
    href: "/socio-buleje",
    cta: "Volverme Socio",
    illustration: CorazonLatiendo,
  },
  {
    slug: "bodeguero",
    kicker: "Si tenés bodega",
    title: "Vendé con nosotros",
    description:
      "Sumate al marketplace y llegá a todo Pucallpa. Gratis el primer mes, sin contrato.",
    href: "/vender",
    cta: "Abrir mi tienda",
    illustration: DoniaElena,
  },
  {
    slug: "regalar",
    kicker: "Si buscás regalar",
    title: "Gift Cards Buleje",
    description:
      "Tarjetas desde S/ 20 que se canjean en cualquier bodega. Envío por WhatsApp o email.",
    href: "/marketplace/gift-cards",
    cta: "Elegir monto",
    illustration: BodegueroCelebrando,
  },
];

export function PathsByProfile() {
  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-2xl space-y-3 mb-10 sm:mb-14">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Empezá por aquí
          </span>
          <SectionTitle className="text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)] font-extrabold">
            ¿Cuál sos vos hoy?
          </SectionTitle>
          <BodyText className="text-[length:var(--ts-base)] text-[var(--text-secondary)] leading-relaxed">
            Cada persona llega con una necesidad distinta. Elegí el camino que
            te queda y te llevamos directo.
          </BodyText>
        </header>

        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PATHS.map((path) => {
            const Illustration = path.illustration;
            return (
              <li key={path.slug}>
                <Link
                  href={path.href}
                  className="group flex h-full flex-col gap-5 rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 transition-all duration-[var(--dur-base)] hover:border-[var(--text-primary)] hover:elev-2"
                >
                  <div className="flex h-36 items-center justify-center">
                    <Illustration
                      size={110}
                      strokeWidth={1.4}
                      className="text-[var(--text-primary)] transition-transform duration-[var(--dur-slow)] group-hover:scale-105"
                    />
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                      {path.kicker}
                    </span>
                    <CardTitle className="text-[length:var(--ts-lg)] font-bold leading-tight">
                      {path.title}
                    </CardTitle>
                    <BodyText className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
                      {path.description}
                    </BodyText>
                  </div>

                  <span className="mt-auto inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] transition-all group-hover:gap-2.5">
                    {path.cta}
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

export default PathsByProfile;
