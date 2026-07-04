"use client";

/**
 * SocioBeneficios — Grid de 6 beneficios (rediseño 2026-07-04).
 *
 * Cards con icon-badge en accent-soft, hover lift y borde accent, título
 * `font-display`. Coherente con el hero premium.
 */

import { SectionTitle, BodyText, Kicker } from "@buleje/design-system";
import {
  Truck,
  Percent,
  Tag,
  Clock,
  MessageCircle,
  Star,
  type LucideIcon,
} from "@buleje/design-system/icons";

type Beneficio = {
  Icon: LucideIcon;
  title: string;
  description: string;
};

const BENEFICIOS: readonly Beneficio[] = [
  {
    Icon: Truck,
    title: "Delivery siempre gratis",
    description:
      "Todos tus pedidos llegan sin costo de envío, sin importar el monto ni la bodega.",
  },
  {
    Icon: Percent,
    title: "5% cashback en cada compra",
    description:
      "Cada vez que pides, acumulás saldo Socio que usás en tu próxima compra.",
  },
  {
    Icon: Tag,
    title: "Precios exclusivos de Socio",
    description:
      "Productos seleccionados tienen un precio rebajado solo para miembros.",
  },
  {
    Icon: Clock,
    title: "Acceso temprano a ofertas",
    description: "Verás las promos 24 horas antes que el resto del marketplace.",
  },
  {
    Icon: MessageCircle,
    title: "Atención WhatsApp prioritaria",
    description:
      "Tus consultas pasan al tope de la fila: respuesta en minutos.",
  },
  {
    Icon: Star,
    title: "2× puntos de fidelidad",
    description:
      "El programa de puntos normal rinde el doble mientras seas Socio.",
  },
];

export function SocioBeneficios() {
  return (
    <section
      id="beneficios"
      className="mx-auto max-w-6xl px-4 py-16 sm:py-20"
      aria-labelledby="beneficios-heading"
    >
      <header className="mx-auto mb-12 max-w-2xl text-center">
        <Kicker>Lo que obtenés</Kicker>
        <SectionTitle
          id="beneficios-heading"
          as="h2"
          className="mt-2 text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)]"
        >
          Beneficios pensados para tu bodega diaria
        </SectionTitle>
        <BodyText className="mt-4 text-[var(--text-secondary)]">
          Seis ventajas concretas que se reflejan en el ticket de cada pedido,
          no en letra chica.
        </BodyText>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFICIOS.map(({ Icon, title, description }, i) => {
          const featured = i === 0;
          return (
            <li
              key={title}
              className={
                featured
                  ? "group relative flex flex-col gap-4 overflow-hidden rounded-2xl p-6 text-white shadow-[var(--shadow-md)] transition-transform duration-200 hover:-translate-y-1"
                  : "group flex flex-col gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[var(--accent)]/40 hover:shadow-[var(--shadow-md)]"
              }
              style={
                featured
                  ? {
                      backgroundImage:
                        "linear-gradient(140deg, var(--accent) 0%, var(--accent-dark) 100%)",
                    }
                  : undefined
              }
            >
              {featured && (
                <>
                  <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
                  <span className="relative inline-flex w-fit items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wide)] ring-1 ring-inset ring-white/25">
                    <Star className="h-3 w-3 fill-white" aria-hidden />
                    El favorito
                  </span>
                </>
              )}
              <span
                className={
                  featured
                    ? "inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-white ring-1 ring-inset ring-white/25"
                    : "inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/15 transition-colors group-hover:bg-[var(--accent)] group-hover:text-white"
                }
              >
                <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
              </span>
              <div className="space-y-1.5">
                <h3
                  className={
                    featured
                      ? "text-lg font-bold leading-tight text-white"
                      : "text-lg font-bold leading-tight text-[var(--text-primary)]"
                  }
                >
                  {title}
                </h3>
                <BodyText className={featured ? "text-white/85" : "text-[var(--text-secondary)]"}>
                  {description}
                </BodyText>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
