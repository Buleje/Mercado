"use client";

/**
 * TusTiendasStrip — TS-16 carrusel de tiendas frecuentes del cliente.
 *
 * Lee localStorage (`tus-tiendas:v1`) cuando el usuario no tiene phone, y
 * cuando lo tiene fetchea pedidos para derivar tiendas con count.
 *
 * No renderiza nada si el cliente no tiene historial — degradación
 * silenciosa para no ensuciar el directorio.
 *
 * Sprint 4 tiendas blueprint.
 */

import { useMemo } from "react";
import Link from "next/link";
import { Store as StoreIcon } from "@buleje/design-system/icons";
import { useCustomerOrders } from "@/hooks/use-customer-orders";
import { cn } from "@/lib/utils";

interface FrequentStore {
  slug: string;
  name: string;
  count: number;
}

const MAX_STORES = 5;
// Slugs reservados que no deben aparecer en "Tus tiendas" — son
// fallbacks del backend (tenant slug por defecto), no tiendas reales.
const RESERVED_SLUGS = new Set(["main", "default", "tenant"]);

function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function TusTiendasStrip({ className }: { className?: string }) {
  const { orders } = useCustomerOrders();

  const stores: FrequentStore[] = useMemo(() => {
    const counter = new Map<string, number>();
    for (const o of orders) {
      const slug = o.storeSlug;
      if (!slug || RESERVED_SLUGS.has(slug)) continue;
      counter.set(slug, (counter.get(slug) ?? 0) + 1);
    }
    return [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_STORES)
      .map(([slug, count]) => ({
        slug,
        name: slugToName(slug),
        count,
      }));
  }, [orders]);

  if (stores.length === 0) return null;

  return (
    <section
      aria-labelledby="tus-tiendas-heading"
      className={cn(
        "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-2",
        className,
      )}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
            Tus tiendas
          </p>
          <h2
            id="tus-tiendas-heading"
            className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]"
          >
            Volve a las que ya conoces
          </h2>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        {stores.map((s) => (
          <Link
            key={s.slug}
            href={`/marketplace/${s.slug}`}
            className="group inline-flex items-center gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-2.5 transition-all hover:border-[var(--accent)]/40 hover:-translate-y-0.5 shrink-0"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
              <StoreIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                {s.name}
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                {s.count} {s.count === 1 ? "pedido" : "pedidos"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
