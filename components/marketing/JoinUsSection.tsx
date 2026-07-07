import Link from "next/link";
import { BRAND_GEO } from "@/lib/geo";
import { cn } from "@/lib/utils";
import {
  Store,
  Building2,
  Bike,
  ArrowRight,
  type LucideIcon,
} from "@buleje/design-system/icons";

// ── Sumate a Buleje — reclutamiento (tiendas / comercios / repartidores) ──
// Brandon 2026-07-06 (v3): MINIMALISTA — tarjetas de superficie, hairlines del
// DS, acento sólo en el ícono/número/CTA. Sin gradientes fuertes. Server comp.

interface JoinCard {
  href: string;
  eyebrow: string;
  title: string;
  desc: string;
  highlight: string;
  benefits: [string, string, string];
  cta: string;
  Icon: LucideIcon;
}

const JOIN_CARDS: JoinCard[] = [
  {
    href: "/abrir-tienda#planes",
    eyebrow: "Para tiendas",
    title: "Registra tu tienda",
    desc: "Bodega, minimarket o tienda de barrio — online sin que te toque la tecnología.",
    highlight: "0% comisión · 90 días",
    benefits: [
      "Catálogo y horarios listos en 5 minutos",
      "Cobras con Yape, Plin, tarjeta o efectivo",
      "Pedidos directos a tu WhatsApp",
    ],
    cta: "Elegir mi plan",
    Icon: Store,
  },
  {
    href: "/abrir-tienda#planes",
    eyebrow: "Para comercios",
    title: "Registra tu comercio",
    desc: "Restaurante, farmacia o licorería — llega a los vecinos que ya compran en Buleje.",
    highlight: "Más clientes hoy",
    benefits: [
      "Apareces en el buscador y el mapa",
      "Sin pagar publicidad para empezar",
      "Tracking de entrega en vivo",
    ],
    cta: "Registrar comercio",
    Icon: Building2,
  },
  {
    href: "/marketplace/repartidor",
    eyebrow: "Para repartidores",
    title: "Únete como repartidor",
    desc: "Genera ingresos extra con tu moto, en los horarios que tú elijas.",
    highlight: "100% de las propinas",
    benefits: [
      "Tú eliges cuándo y cuánto trabajas",
      "Te quedas el 100% de las propinas",
      "Pagos rápidos y seguros",
    ],
    cta: "Quiero repartir",
    Icon: Bike,
  },
];

export function JoinUsSection({
  maxWidthClass = "max-w-[1280px]",
}: { maxWidthClass?: string } = {}) {
  return (
    <section
      aria-label="Sumate a Buleje"
      className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] py-10 sm:py-14"
    >
      <div className={cn("mx-auto px-4 sm:px-6 lg:px-8", maxWidthClass)}>
        {/* Header editorial — calmo */}
        <div className="max-w-2xl mb-6 sm:mb-8">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Sumate a Buleje
          </p>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] leading-tight">
            Vendé, repartí o hacé crecer tu negocio
          </h2>
          <p className="mt-1.5 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-relaxed">
            Buleje está armando la red local de {BRAND_GEO.city}. Elegí cómo te sumás.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {JOIN_CARDS.map((c) => (
            <JoinCardTile key={c.title} card={c} />
          ))}
        </div>
      </div>
    </section>
  );
}

function JoinCardTile({ card: c }: { card: JoinCard }) {
  const Icon = c.Icon;
  return (
    <Link
      href={c.href}
      className={cn(
        "group flex flex-row sm:flex-col items-center sm:items-stretch gap-3 sm:gap-0",
        "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-6",
        "transition-[border-color,box-shadow,transform] duration-[var(--dur-base)]",
        "hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:shadow-[var(--shadow-sm)]",
      )}
    >
      <span
        aria-hidden
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent-dark)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_16%,transparent)] transition-transform duration-[var(--dur-base)] group-hover:scale-105 dark:text-[var(--accent)] sm:mb-4"
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>

      <div className="min-w-0 flex-1 sm:flex-none">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {c.eyebrow}
        </p>
        <h3 className="mt-0.5 text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)] leading-tight">
          {c.title}
        </h3>
        <p className="hidden sm:block mt-2 text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-snug">
          {c.desc}
        </p>
        <span className="mt-1.5 sm:mt-3 inline-flex w-fit items-center rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent-dark)] dark:text-[var(--accent)]">
          {c.highlight}
        </span>
        <ul className="hidden sm:block mt-4 space-y-1.5">
          {c.benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-snug">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <span className="hidden sm:inline-flex mt-5 items-center gap-1.5 text-[length:var(--ts-sm)] font-bold text-[var(--accent-dark)] group-hover:gap-2.5 transition-all dark:text-[var(--accent)]">
          {c.cta}
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
      </div>

      <ArrowRight
        className="sm:hidden h-5 w-5 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors"
        strokeWidth={2}
        aria-hidden
      />
    </Link>
  );
}
