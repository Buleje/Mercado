import Link from "next/link";
import { BRAND_GEO } from "@/lib/geo";
import {
  Store,
  Building2,
  Bike,
  Sparkles,
  Check,
  ArrowUpRight,
  type LucideIcon,
} from "@buleje/design-system/icons";

// ── Trabajá con nosotros — reclutamiento (tiendas / comercios / repartidores) ──
// Brandon 2026-05-31: extraído de app/(store)/page.tsx a componente compartido
// para reusarlo en /tiendas sin copy-paste (single source of truth). Paleta de
// marca: solo --accent + neutros. Layout editorial: header + 3 cards.
//
// Server component (sin estado/hooks): 0 JS al cliente, indexable.

interface JoinCard {
  href: string;
  eyebrow: string;
  title: string;
  desc: string;
  /** Beneficio principal en chip — gancho de un vistazo. */
  highlight: string;
  /** 3 beneficios concretos (lista con check) — dan cuerpo y vencen objeciones. */
  benefits: [string, string, string];
  cta: string;
  Icon: LucideIcon;
}

const JOIN_CARDS: JoinCard[] = [
  {
    href: "/negocios",
    eyebrow: "Para tiendas",
    title: "Registrá tu tienda",
    desc: "Bodega, minimarket o tienda de barrio — online sin que te toque la tecnología.",
    highlight: "0% comisión · 90 días",
    benefits: [
      "Catálogo y horarios listos en 5 minutos",
      "Cobrás con Yape, Plin, tarjeta o efectivo",
      "Pedidos directos a tu WhatsApp",
    ],
    cta: "Abrir mi tienda",
    Icon: Store,
  },
  {
    href: "/negocios?tipo=comercio",
    eyebrow: "Para comercios",
    title: "Registrá tu comercio",
    desc: "Restaurante, farmacia o licorería — llegá a los vecinos que ya compran en Buleje.",
    highlight: "Más clientes hoy",
    benefits: [
      "Aparecés en el buscador y el mapa",
      "Sin pagar publicidad para empezar",
      "Tracking de entrega en vivo",
    ],
    cta: "Registrar comercio",
    Icon: Building2,
  },
  {
    href: "/marketplace/repartidor",
    eyebrow: "Para repartidores",
    title: "Unite como repartidor",
    desc: "Generá ingresos extra con tu moto, en los horarios que vos elijas.",
    highlight: "100% de las propinas",
    benefits: [
      "Vos elegís cuándo y cuánto trabajás",
      "Te quedás el 100% de las propinas",
      "Pagos rápidos y seguros",
    ],
    cta: "Quiero repartir",
    Icon: Bike,
  },
];

export function JoinUsSection() {
  return (
    <section
      aria-label="Sumate a Buleje"
      className="relative overflow-hidden bg-[var(--surface-canvas)] border-t border-[var(--rule-soft)] py-16 sm:py-24"
    >
      <div
        aria-hidden
        className="hidden sm:block pointer-events-none absolute -top-32 right-1/4 h-[480px] w-[480px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
      />
      <div
        aria-hidden
        className="hidden sm:block pointer-events-none absolute -bottom-32 left-1/4 h-[360px] w-[360px] rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
      />

      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header editorial */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
            <span aria-hidden className="inline-block h-[3px] w-8 rounded-full bg-[var(--accent)]" />
            Sumate a Buleje
            <span aria-hidden className="inline-block h-[3px] w-8 rounded-full bg-[var(--accent)]" />
          </p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.02]">
            Trabajá con{" "}
            <span className="italic font-serif text-[var(--accent)]">nosotros</span>
          </h2>
          <p className="mt-3 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Vendé, repartí o creá tu negocio digital. Buleje está armando la
            red local de {BRAND_GEO.city}.
          </p>
        </div>

        {/* 3 cards editorial — todas con paleta accent + neutros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {JOIN_CARDS.map((c, i) => {
            const Icon = c.Icon;
            // Card central destacada con bg accent-soft, las otras con bg raised
            const isFeatured = i === 0;
            return (
              <Link
                key={c.href}
                href={c.href}
                className={`group relative flex flex-col rounded-3xl border-2 p-6 sm:p-8 transition-all overflow-hidden hover:-translate-y-1 ${
                  isFeatured
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]/40 hover:bg-[var(--accent-soft)]/60 hover:shadow-2xl hover:shadow-[var(--accent)]/20"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:shadow-xl"
                }`}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[var(--accent)]/[0.10] blur-2xl group-hover:bg-[var(--accent)]/[0.20] transition-colors"
                />
                <span
                  aria-hidden
                  className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl mb-5 shrink-0 transition-colors ${
                    isFeatured
                      ? "bg-[var(--accent-600,var(--accent))] text-white shadow-md shadow-[var(--accent)]/30"
                      : "bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-[var(--accent-600,var(--accent))] group-hover:text-white"
                  }`}
                >
                  <Icon className="h-7 w-7" strokeWidth={2} />
                </span>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                  {c.eyebrow}
                </p>
                {/* text-lg→2xl: títulos parejos (antes "Registrá tu comercio"
                    wrappeaba a 3 líneas desbalanceando las cards). */}
                <h3 className="text-lg sm:text-xl lg:text-2xl font-black tracking-tight text-[var(--text-primary)] leading-tight">
                  {c.title}
                </h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  {c.desc}
                </p>
                {/* Chip gancho — beneficio principal de un vistazo */}
                <span
                  className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${
                    isFeatured
                      ? "bg-[var(--accent-600,var(--accent))] text-white"
                      : "bg-[var(--accent-soft)] text-[var(--accent)]"
                  }`}
                >
                  <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  {c.highlight}
                </span>
                {/* Lista de beneficios — da cuerpo + vence objeciones */}
                <ul className="mt-4 space-y-2 flex-1">
                  {c.benefits.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-snug"
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
                        strokeWidth={2.75}
                        aria-hidden
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <span className="mt-5 inline-flex items-center gap-1.5 border-t border-[var(--rule-soft)] pt-4 text-sm font-extrabold text-[var(--accent)] group-hover:gap-2.5 transition-all">
                  {c.cta}
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
