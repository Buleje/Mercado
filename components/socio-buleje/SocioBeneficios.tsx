"use client";

/**
 * SocioBeneficios — Grid 6 cards con los beneficios del Socio.
 *
 * IconBadge large + título + copy. Estilo minimalista (ADR-075).
 */

import {
  SectionTitle,
  CardTitle,
  BodyText,
  Kicker,
  IconBadge,
} from "@buleje/design-system";
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
    description:
      "Verás las promos 24 horas antes que el resto del marketplace.",
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
      <header className="text-center max-w-2xl mx-auto mb-12">
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

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {BENEFICIOS.map(({ Icon, title, description }) => (
          <li
            key={title}
            className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 flex flex-col gap-4"
          >
            <IconBadge size="xl" intent="muted" shape="square" asDiv>
              <Icon className="h-6 w-6" aria-hidden />
            </IconBadge>
            <div className="space-y-1.5">
              <CardTitle>{title}</CardTitle>
              <BodyText className="text-[var(--text-secondary)]">
                {description}
              </BodyText>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
