import Link from "next/link";
import { ShieldCheck, Bike, Scale, MessageCircle } from "@buleje/design-system/icons";
import { BRAND_GEO } from "@/lib/geo";

/**
 * HomeTrustBar — banda de confianza HONESTA bajo el hero (Brandon 2026-06-08).
 * Reduce el miedo a la primera compra en un marketplace que recién arranca:
 * cómo se paga, que es seguro, cuánto tarda y a quién reclamar. Sin prueba
 * social falsa (ordersToday = 0 en lanzamiento → no se inventa "X pedidos").
 * Server component, evergreen, sin data. De-neon (flat, sin glow).
 */

const TRUST = [
  {
    Icon: ShieldCheck,
    title: "Pago seguro",
    desc: "Yape, Plin o efectivo",
    href: null,
  },
  {
    Icon: Bike,
    title: "Entrega rápida",
    desc: `~25 min en ${BRAND_GEO.city}`,
    href: null,
  },
  {
    Icon: Scale,
    title: "Compra protegida",
    desc: "Libro de Reclamaciones",
    href: "/libro-de-reclamaciones",
  },
  {
    Icon: MessageCircle,
    title: "Te ayudamos",
    desc: "Soporte por WhatsApp",
    href: null,
  },
] as const;

export default function HomeTrustBar() {
  return (
    <section
      aria-label="Por qué comprar en Buleje"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6"
    >
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-1 sm:gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2 sm:p-3">
        {TRUST.map(({ Icon, title, desc, href }) => {
          const inner = (
            <span className="flex items-center gap-3 px-2 py-2 rounded-xl transition-colors">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  {title}
                </span>
                <span className="truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {desc}
                </span>
              </span>
            </span>
          );
          return (
            <li key={title}>
              {href ? (
                <Link
                  href={href}
                  className="block rounded-xl hover:bg-[var(--surface-sunken)]/60"
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
