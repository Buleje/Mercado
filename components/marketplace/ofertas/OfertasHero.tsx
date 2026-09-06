import { BadgePercent, Store, Tag, TrendingDown } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import { BRAND_GEO } from "@/lib/geo";

/**
 * OfertasHero — encabezado editorial de /marketplace/ofertas.
 *
 * Brandon 2026-07-06 (rediseño minimalista): antes era un hero dramático
 * `font-black` + `clamp(...5.75rem)` que quedó huérfano (nunca se montó). Ahora
 * es un header sobrio (superficie canvas, acento sólo en un chip y una palabra
 * serif) con stats HONESTAS calculadas de los datos reales:
 *  - source="deals"  → nº de ofertas · mayor descuento · nº de tiendas
 *  - source="lowest" → nº de productos · nº de tiendas (SIN % de descuento
 *    inventado — coherente con el HonestNotice de abajo).
 *
 * Sin estado (server-capable). Tokens estrictos, sin hex.
 */

interface OfertasHeroProps {
  dealCount: number;
  maxDiscount: number;
  storeCount: number;
  source: "deals" | "lowest";
}

interface Stat {
  Icon: LucideIcon;
  value: string;
  label: string;
}

export default function OfertasHero({ dealCount, maxDiscount, storeCount, source }: OfertasHeroProps) {
  const isDeals = source === "deals";

  const stats: Stat[] = isDeals
    ? [
        { Icon: Tag, value: String(dealCount), label: dealCount === 1 ? "oferta hoy" : "ofertas hoy" },
        ...(maxDiscount > 0
          ? [{ Icon: TrendingDown, value: `-${maxDiscount}%`, label: "mayor descuento" }]
          : []),
        { Icon: Store, value: String(storeCount), label: storeCount === 1 ? "tienda" : "tiendas" },
      ]
    : [
        { Icon: Tag, value: String(dealCount), label: "precios bajos" },
        { Icon: Store, value: String(storeCount), label: storeCount === 1 ? "tienda" : "tiendas" },
      ];

  return (
    <section className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-[1600px] px-4 pt-8 pb-6 sm:px-6 sm:pt-12 sm:pb-8 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <BadgePercent className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Ofertas · {BRAND_GEO.city}
            </p>
            <h1 className="mt-3 text-3xl font-bold leading-[1.05] tracking-tight text-[var(--text-primary)] sm:text-4xl">
              Precios que{" "}
              <span className="font-serif italic font-normal text-[var(--accent)]">valen la pena</span>
            </h1>
            <p className="mt-2 max-w-xl text-[length:var(--ts-sm)] leading-relaxed text-[var(--text-secondary)] sm:text-base">
              {isDeals
                ? "Descuentos reales de las bodegas y comercios de tu barrio. Delivery rápido, pago con Yape, Plin o efectivo."
                : "Los mejores precios del marketplace de tu barrio, ordenados de menor a mayor."}
            </p>
          </div>

          {/* Stats HONESTAS — chips de superficie, acento sólo en el ícono */}
          <ul className="flex shrink-0 flex-wrap gap-2 sm:gap-2.5">
            {stats.map((s) => (
              <li
                key={s.label}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2"
              >
                <span
                  aria-hidden
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                >
                  <s.Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="leading-tight">
                  <span className="block text-base font-bold tabular-nums text-[var(--text-primary)]">
                    {s.value}
                  </span>
                  <span className="block text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                    {s.label}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
