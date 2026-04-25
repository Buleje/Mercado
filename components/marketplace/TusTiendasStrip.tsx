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

import { useEffect, useState } from "react";
import Link from "next/link";
import { Store as StoreIcon } from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";

interface FrequentStore {
  slug: string;
  name: string;
  count: number;
}

const LS_KEY = "tus-tiendas:v1";
const MAX_STORES = 5;

interface PedidoItem {
  storeSlug?: string;
}

interface PedidoSummary {
  id: string;
  storeSlug?: string;
  items?: PedidoItem[];
}

function loadFromCache(): FrequentStore[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FrequentStore[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_STORES) : [];
  } catch {
    return [];
  }
}

function saveToCache(list: FrequentStore[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    // ignorar
  }
}

function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function TusTiendasStrip({ className }: { className?: string }) {
  const { customer } = useCustomer();
  const phone = customer?.phone;
  const [stores, setStores] = useState<FrequentStore[]>(() => loadFromCache());

  useEffect(() => {
    if (!phone) return;
    let cancelled = false;
    const params = new URLSearchParams({ phone, tenantId: "main" });
    fetch(`/api/marketplace/mi-cuenta/pedidos?${params}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((data: { orders?: PedidoSummary[] }) => {
        if (cancelled) return;
        const counter = new Map<string, number>();
        for (const o of data.orders ?? []) {
          const slug = o.storeSlug;
          if (!slug) continue;
          counter.set(slug, (counter.get(slug) ?? 0) + 1);
        }
        const ranked: FrequentStore[] = [...counter.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_STORES)
          .map(([slug, count]) => ({
            slug,
            name: slugToName(slug),
            count,
          }));
        setStores(ranked);
        saveToCache(ranked);
      })
      .catch(() => {
        // silencioso — fallback al cache
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

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
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-1">
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
