"use client";

/**
 * VenderSteps — "Cómo empezar" 4 pasos numerados estilo editorial.
 */

import { IconBadge } from "@buleje/design-system";
import { UserPlus, Package, ShoppingCart, Wallet } from "@buleje/design-system/icons";
import {
  BodegaAbriendo,
  MotoRuta,
} from "@/components/ui-system/illustrations/contextual";
import { BodegueroCelebrando } from "@/components/ui-system/illustrations/success-moments";
import { DoniaElena } from "@/components/ui-system/illustrations/pucallpa-locals";

const STEPS = [
  {
    n: "01",
    Icon: UserPlus,
    Illustration: BodegaAbriendo,
    title: "Registrate en 5 minutos",
    copy: "RUC, dirección y foto de tu negocio. Sin formularios eternos ni contratos de 30 páginas.",
  },
  {
    n: "02",
    Icon: Package,
    Illustration: DoniaElena,
    title: "Sube tu catálogo",
    copy: "De a uno o con una planilla Excel. Te ayudamos a sacar fotos decentes si las necesitas.",
  },
  {
    n: "03",
    Icon: ShoppingCart,
    Illustration: MotoRuta,
    title: "Recibe pedidos",
    copy: "El teléfono suena cuando alguien te compra. Confirmás, preparás el paquete y listo.",
  },
  {
    n: "04",
    Icon: Wallet,
    Illustration: BodegueroCelebrando,
    title: "Cobrá al instante",
    copy: "El cliente paga por Yape, Plin o efectivo al repartidor. La plata entra a tu cuenta al día siguiente.",
  },
] as const;

export default function VenderSteps() {
  return (
    <section
      id="como-empezar"
      className="border-b border-[var(--rule-base)] bg-[var(--surface-canvas)] py-16 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-12 max-w-2xl">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Cómo empezar
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Cuatro pasos, un solo día
          </h2>
          <p className="mt-3 text-[var(--text-secondary)]">
            Abrir tu tienda en Buleje es más fácil que pedir una caja de
            cerveza al mayorista. Aquí está todo lo que vas a hacer.
          </p>
        </header>

        <ol className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => {
            const Illo = step.Illustration;
            const Icon = step.Icon;
            return (
              <li
                key={step.n}
                className="relative flex flex-col gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 transition-colors hover:border-[var(--rule-strong)]"
              >
                <span className="absolute right-4 top-4 font-mono text-xl font-bold text-[var(--text-tertiary)]">
                  {step.n}
                </span>
                <div className="flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-canvas)] text-[var(--text-primary)]">
                  <Illo size={110} strokeWidth={1.4} />
                </div>
                <IconBadge size="sm" shape="square" intent="muted">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                </IconBadge>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {step.copy}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
