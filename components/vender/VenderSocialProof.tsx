"use client";

/**
 * VenderSocialProof — grid 3 cards de bodegas ya vendiendo + contador total.
 */

import { Store, MapPin, Star } from "@buleje/design-system/icons";

const STORES = [
  {
    name: "Bodega Don Ricardo",
    district: "Callería",
    category: "Abarrotes y bebidas",
    rating: 4.9,
    orders: 680,
    streak: "Vende desde feb 2026",
  },
  {
    name: "Minimarket La Familia",
    district: "Yarinacocha",
    category: "Frutas y verduras",
    rating: 4.8,
    orders: 412,
    streak: "Vende desde mar 2026",
  },
  {
    name: "Frutería Doña Rosa",
    district: "Manantay",
    category: "Frutas de la selva",
    rating: 5.0,
    orders: 295,
    streak: "Recién ingresada",
  },
] as const;

export default function VenderSocialProof() {
  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-canvas)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-xl">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Bodegas que ya venden
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              Más de 200 bodegas en Ucayali
            </h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Vecinos tuyos que ya viven de Buleje. Mira cómo les va.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STORES.map((s) => (
            <article
              key={s.name}
              className="flex flex-col gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 transition-colors hover:border-[var(--rule-strong)]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)]">
                  <Store className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-[var(--text-primary)]">
                    {s.name}
                  </h3>
                  <p className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    {s.district}
                    <span className="text-[var(--text-tertiary)]">·</span>
                    {s.category}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-canvas)] p-3">
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Rating
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                    <Star
                      className="h-3.5 w-3.5 fill-current"
                      aria-hidden="true"
                    />
                    {Number(s.rating).toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Pedidos
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                    {s.orders}
                  </p>
                </div>
              </div>

              <p className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">
                {s.streak}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
