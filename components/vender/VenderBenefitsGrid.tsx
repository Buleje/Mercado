"use client";

/**
 * VenderBenefitsGrid — "Por qué Buleje" 3 cards con ilustraciones.
 */

import { IconBadge } from "@buleje/design-system";
import { Users, Timer, Wallet } from "@buleje/design-system/icons";
import { MapaUcayaliAutentico } from "@/components/ui-system/illustrations/pucallpa-locals";
import { MotoRuta } from "@/components/ui-system/illustrations/contextual";
import { BodegueroCelebrando } from "@/components/ui-system/illustrations/success-moments";

const BENEFITS = [
  {
    Illustration: MapaUcayaliAutentico,
    Icon: Users,
    title: "Llegá a más clientes",
    copy: "Tu bodega aparece en el marketplace de Pucallpa. Familias, oficinas y barrios enteros te encuentran sin que tengas que salir a repartir volantes.",
  },
  {
    Illustration: MotoRuta,
    Icon: Timer,
    title: "Entregas en 25 min",
    copy: "Coordinamos los motorizados por vos. Tu única preocupación es que el producto esté listo cuando llega la moto. Nosotros trackeamos al cliente.",
  },
  {
    Illustration: BodegueroCelebrando,
    Icon: Wallet,
    title: "Cobrá sin letra chica",
    copy: "Sin comisiones escondidas. Sin descuentos raros. Vos ponés el precio, el cliente paga y la plata cae a tu cuenta al día siguiente.",
  },
] as const;

export default function VenderBenefitsGrid() {
  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mx-auto mb-12 max-w-2xl text-center">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Por qué Buleje
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Tres razones simples para sumarte
          </h2>
          <p className="mt-3 text-[var(--text-secondary)]">
            Nada de promesas difíciles. Esto es lo que realmente ganás el primer mes.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {BENEFITS.map((b) => {
            const Illo = b.Illustration;
            const Icon = b.Icon;
            return (
              <article
                key={b.title}
                className="flex flex-col gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 transition-colors hover:border-[var(--rule-strong)]"
              >
                <div className="flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-sunken)] text-[var(--text-primary)]">
                  <Illo size={140} strokeWidth={1.4} />
                </div>
                <div className="space-y-2">
                  <IconBadge size="sm" shape="square" intent="muted">
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </IconBadge>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    {b.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {b.copy}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
