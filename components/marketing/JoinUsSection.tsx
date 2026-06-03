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
    // Brandon 2026-06-03: las cards de reclutamiento van DIRECTO al selector de
    // planes (/abrir-tienda#planes) en vez de la landing larga /negocios. Quien
    // clickea "Registrá tu tienda" ya decidió — elegir plan es un micro-compromiso
    // que sube la conversión al form (el plan más barato es S/0, sin fricción).
    // El cableado plan→/marketplace/registrar?plan= ya existe en PlansToggle.
    href: "/abrir-tienda#planes",
    eyebrow: "Para tiendas",
    title: "Registrá tu tienda",
    desc: "Bodega, minimarket o tienda de barrio — online sin que te toque la tecnología.",
    highlight: "0% comisión · 90 días",
    benefits: [
      "Catálogo y horarios listos en 5 minutos",
      "Cobrás con Yape, Plin, tarjeta o efectivo",
      "Pedidos directos a tu WhatsApp",
    ],
    cta: "Elegir mi plan",
    Icon: Store,
  },
  {
    href: "/abrir-tienda#planes",
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
      className="relative overflow-hidden bg-[var(--surface-canvas)] border-t border-[var(--rule-soft)] py-10 sm:py-24"
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
        <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-14">
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

        {/* 3 opciones. Mobile (Brandon 2026-06-01): FILA COMPACTA — icono +
            eyebrow/título/chip + flecha. Oculta desc, beneficios y CTA footer
            para ocupar ~1/3 del alto. Desktop (sm+): card editorial completa. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-5">
          {JOIN_CARDS.map((c, i) => {
            const Icon = c.Icon;
            // Card central destacada con bg accent-soft, las otras con bg raised
            const isFeatured = i === 0;
            return (
              <Link
                key={c.title}
                href={c.href}
                className={cn(
                  "group relative flex overflow-hidden border-2 transition-all",
                  // mobile: fila horizontal compacta · desktop: card vertical
                  "flex-row items-center gap-3 rounded-2xl p-3.5",
                  "sm:flex-col sm:items-stretch sm:gap-0 sm:rounded-3xl sm:p-8",
                  "hover:-translate-y-0.5 sm:hover:-translate-y-1",
                  isFeatured
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]/40 hover:bg-[var(--accent-soft)]/60 sm:hover:shadow-2xl sm:hover:shadow-[var(--accent)]/20"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)] sm:hover:shadow-xl",
                )}
              >
                {/* glow decorativo — solo desktop (en mobile no aporta y pinta de más) */}
                <div
                  aria-hidden
                  className="hidden sm:block pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[var(--accent)]/[0.10] blur-2xl group-hover:bg-[var(--accent)]/[0.20] transition-colors"
                />
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center transition-colors",
                    "h-11 w-11 rounded-xl sm:h-14 sm:w-14 sm:rounded-2xl sm:mb-5",
                    isFeatured
                      ? "bg-[var(--accent-600,var(--accent))] text-white shadow-md shadow-[var(--accent)]/30"
                      : "bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-[var(--accent-600,var(--accent))] group-hover:text-white",
                  )}
                >
                  <Icon className="h-5 w-5 sm:h-7 sm:w-7" strokeWidth={2} />
                </span>

                <div className="min-w-0 flex-1 sm:flex-none">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-0.5 sm:mb-1">
                    {c.eyebrow}
                  </p>
                  {/* text-lg→2xl: títulos parejos (antes "Registrá tu comercio"
                      wrappeaba a 3 líneas desbalanceando las cards). */}
                  <h3 className="text-base sm:text-xl lg:text-2xl font-black tracking-tight text-[var(--text-primary)] leading-tight">
                    {c.title}
                  </h3>
                  {/* desc — oculta en mobile (compacto) */}
                  <p className="hidden sm:block mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    {c.desc}
                  </p>
                  {/* Chip gancho — beneficio principal de un vistazo */}
                  <span
                    className={cn(
                      "mt-1.5 sm:mt-3 inline-flex w-fit items-center gap-1 sm:gap-1.5 rounded-full px-2.5 sm:px-3 py-0.5 sm:py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
                      isFeatured
                        ? "bg-[var(--accent-600,var(--accent))] text-white"
                        : "bg-[var(--accent-soft)] text-[var(--accent)]",
                    )}
                  >
                    <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    {c.highlight}
                  </span>
                  {/* Lista de beneficios — oculta en mobile, da cuerpo en desktop */}
                  <ul className="hidden sm:block mt-4 space-y-2 flex-1">
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
                  {/* CTA footer — oculta en mobile (la flecha lateral la reemplaza) */}
                  <span className="hidden sm:inline-flex mt-5 items-center gap-1.5 border-t border-[var(--rule-soft)] pt-4 text-sm font-extrabold text-[var(--accent)] group-hover:gap-2.5 transition-all">
                    {c.cta}
                    <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </span>
                </div>

                {/* Flecha lateral — solo mobile (CTA visual de la fila) */}
                <ArrowUpRight
                  className="sm:hidden h-5 w-5 shrink-0 text-[var(--accent)] transition-transform group-active:translate-x-0.5"
                  strokeWidth={2.5}
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
