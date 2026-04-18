"use client";

/**
 * AhorraMasMegaSection — Mega seccion triple de cross-sell al ecosistema Buleje.
 *
 * Conecta la home del marketplace con los tres mecanismos de ahorro del
 * ecosistema: Socio Buleje (membership), Bodega al Mes (subscripciones con
 * 5% descuento) y Cupones. Cada tarjeta trae una ilustracion monoline,
 * copy Feynman, un stat teaser y CTA.
 *
 * Narrativa "Ahorra mas con Buleje" — intencion: empujar al user a tocar
 * alguno de los 3 caminos en vez de volverse a ir tras comprar 1 producto.
 */

import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Crown,
  Repeat,
  Tag,
} from "@buleje/design-system/icons";
import { CardTitle, Caption, Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";

type SavingCard = {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  stat: string;
  statLabel: string;
  cta: string;
  Icon: typeof Crown;
};

const CARDS: SavingCard[] = [
  {
    href: "/socio-buleje",
    eyebrow: "Membership",
    title: "Socio Buleje",
    body: "Envio gratis siempre, 3% cashback en cada pedido y precios exclusivos de socio.",
    stat: "S/ 180",
    statLabel: "ahorro promedio/ano",
    cta: "Hacerme socio",
    Icon: Crown,
  },
  {
    href: "/marketplace/bodega-al-mes",
    eyebrow: "Subscripciones",
    title: "Bodega al Mes",
    body: "Tus productos esenciales llegan solos cada semana. 5% off fijo y pausa cuando quieras.",
    stat: "-5%",
    statLabel: "en cada entrega",
    cta: "Armar mi suscripcion",
    Icon: Repeat,
  },
  {
    href: "/marketplace/cupones",
    eyebrow: "Cupones",
    title: "Cupones activos",
    body: "Descuentos de bienvenida, referidos y campanias del mes. Aplicales en el checkout.",
    stat: "12",
    statLabel: "cupones disponibles hoy",
    cta: "Ver cupones",
    Icon: Tag,
  },
];

function SavingCardView({ card }: { card: SavingCard }) {
  const { Icon } = card;
  return (
    <Link
      href={card.href}
      className={cn(
        "group flex flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]",
        "p-5 sm:p-6 transition-colors hover:border-[var(--rule-strong)]",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
          <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
            "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
            "border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
          )}
        >
          <BadgePercent className="h-3 w-3" aria-hidden />
          Ahorro
        </span>
      </div>

      <Kicker className="text-[var(--text-tertiary)]">{card.eyebrow}</Kicker>
      <CardTitle className="mt-0.5 text-[length:var(--ts-lg)]">
        {card.title}
      </CardTitle>

      <p className="mt-2 text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
        {card.body}
      </p>

      <div className="mt-4 flex items-baseline gap-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
        <span className="text-[length:var(--ts-xl)] font-extrabold text-[var(--text-primary)] tabular-nums">
          {card.stat}
        </span>
        <Caption className="text-[var(--text-tertiary)]">{card.statLabel}</Caption>
      </div>

      <div className="mt-4 inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-primary)]">
        {card.cta}
        <ArrowRight
          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </Link>
  );
}

export default function AhorraMasMegaSection() {
  return (
    <section
      aria-labelledby="ahorra-mas-title"
      className="border-y border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="mb-6 max-w-2xl">
          <Kicker className="text-[var(--text-tertiary)]">Ecosistema Buleje</Kicker>
          <CardTitle
            as="h2"
            id="ahorra-mas-title"
            className="mt-1 text-[length:var(--ts-2xl)]"
          >
            Ahorra mas con Buleje
          </CardTitle>
          <p className="mt-2 text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
            Tres caminos para que cada pedido salga mas barato. Eliges uno, dos
            o los tres: los beneficios se suman.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {CARDS.map((card) => (
            <SavingCardView key={card.href} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}
