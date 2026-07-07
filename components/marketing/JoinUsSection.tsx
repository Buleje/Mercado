import Link from "next/link";
import { BRAND_GEO } from "@/lib/geo";
import { cn } from "@/lib/utils";
import {
  Store,
  Building2,
  Bike,
  Sparkles,
  Check,
  ArrowUpRight,
  type LucideIcon,
} from "@buleje/design-system/icons";

// ── Sumate a Buleje — reclutamiento (tiendas / comercios / repartidores) ──
// Brandon 2026-07-06 (v2): rediseño creativo — tarjetas con gradiente firma +
// greca amazónica + orbes, tipografía suave (bold, no black). Server component.

interface JoinCard {
  href: string;
  eyebrow: string;
  title: string;
  desc: string;
  highlight: string;
  benefits: [string, string, string];
  cta: string;
  Icon: LucideIcon;
  /** Gradiente firma de la tarjeta (anclado a tokens). */
  gradient: string;
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
    gradient: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 55%, #0d3b3b 100%)",
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
    gradient: "linear-gradient(135deg, var(--accent-dark) 0%, #0d3b3b 60%, #072525 100%)",
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
    gradient: "linear-gradient(135deg, #ff8676 0%, #ff6b5b 50%, #b83a2c 100%)",
  },
];

export function JoinUsSection({
  maxWidthClass = "max-w-[1280px]",
}: { maxWidthClass?: string } = {}) {
  return (
    <section
      aria-label="Sumate a Buleje"
      className="relative overflow-hidden border-t border-[var(--rule-base)] bg-[var(--surface-canvas)] py-10 sm:py-16"
    >
      <div className={cn("relative mx-auto px-4 sm:px-6 lg:px-8", maxWidthClass)}>
        {/* Header editorial — suave */}
        <div className="max-w-2xl mb-6 sm:mb-9">
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Sumate a Buleje
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-[var(--text-primary)] leading-tight">
            Vendé, repartí o hacé crecer{" "}
            <span className="text-[var(--accent)]">tu negocio</span>
          </h2>
          <p className="mt-2 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-relaxed">
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
      className="group relative flex flex-row sm:flex-col items-center sm:items-stretch gap-3 sm:gap-0 overflow-hidden rounded-3xl p-4 sm:p-6 text-white transition-transform duration-[var(--dur-base)] hover:-translate-y-1"
      style={{ background: c.gradient }}
    >
      {/* Greca amazónica sutil */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.1]">
        <defs>
          <pattern id={`greca-${c.title}`} width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M0 13h6v-6h6v6h8v6h-6v6h-6v-6H0z" fill="none" stroke="white" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#greca-${c.title})`} />
      </svg>
      {/* Orbes + brillo */}
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -inset-y-10 -left-1/4 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <span
        aria-hidden
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/25 backdrop-blur-sm sm:mb-4"
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>

      <div className="relative min-w-0 flex-1 sm:flex-none">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/80">
          {c.eyebrow}
        </p>
        <h3 className="mt-0.5 text-base sm:text-xl font-bold tracking-tight leading-tight">
          {c.title}
        </h3>
        <p className="hidden sm:block mt-2 text-[length:var(--ts-sm)] text-white/90 leading-snug">
          {c.desc}
        </p>
        <span className="mt-1.5 sm:mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white ring-1 ring-inset ring-white/25">
          <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          {c.highlight}
        </span>
        <ul className="hidden sm:block mt-4 space-y-1.5">
          {c.benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[length:var(--ts-sm)] text-white/90 leading-snug">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" strokeWidth={2.75} aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <span className="hidden sm:inline-flex mt-5 items-center gap-2 rounded-full bg-white px-4 h-10 text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] group-hover:gap-3 transition-all">
          {c.cta}
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </span>
      </div>

      {/* Flecha lateral — solo mobile */}
      <ArrowUpRight
        className="relative sm:hidden h-5 w-5 shrink-0 text-white transition-transform group-active:translate-x-0.5"
        strokeWidth={2.5}
        aria-hidden
      />
    </Link>
  );
}
