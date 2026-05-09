"use client";

/**
 * RepetirUltimoPedido — Hero card que aparece arriba en /tiendas si el
 * cliente tiene un pedido reciente. Reduce fricción: en 1 click vuelve a
 * la tienda con `?repeat=orderId` para repetir la compra.
 *
 * Storage: lee `buleje:last-order` de localStorage (escrito post-checkout
 * por el flujo de carrito). Sin schema. Helper `setLastOrder(...)` exportado
 * para que checkout lo grabe.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Repeat, ArrowRight, Clock } from "lucide-react";

interface LastOrder {
  orderId: string;
  storeSlug: string;
  storeName: string;
  total: number;
  itemsCount: number;
  ts: number;
}

const KEY = "buleje:last-order";
/** Máx 30 días — pedidos más viejos no son útiles para repetir */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days >= 1) return `hace ${days} ${days === 1 ? "día" : "días"}`;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours >= 1) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  return "hace minutos";
}

export default function RepetirUltimoPedido() {
  const [order, setOrder] = useState<LastOrder | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const o = JSON.parse(raw) as LastOrder;
      if (
        typeof o?.orderId === "string" &&
        typeof o?.storeSlug === "string" &&
        Date.now() - o.ts < MAX_AGE_MS
      ) {
        setOrder(o);
      }
    } catch {
      /* silent */
    }
  }, []);

  if (!hydrated || !order) return null;

  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      <Link
        href={`/marketplace/${order.storeSlug}?repeat=${order.orderId}`}
        className="group flex items-center gap-4 rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-4 sm:p-5 hover:border-[var(--accent)] hover:shadow-md transition-all"
      >
        <div className="shrink-0 inline-flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shadow-sm">
          <Repeat className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
            Tu último pedido
          </p>
          <p className="text-base sm:text-lg font-black text-[var(--text-primary)] truncate">
            Repetí tu compra de {order.storeName}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-tertiary)] flex-wrap">
            <span className="font-bold tabular-nums">{fmtCurrency(order.total)}</span>
            <span aria-hidden>·</span>
            <span>{order.itemsCount} {order.itemsCount === 1 ? "item" : "items"}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" strokeWidth={2} />
              {timeAgo(order.ts)}
            </span>
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-4 py-2 text-sm font-bold group-hover:gap-2 transition-all">
          Repetir
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
        </span>
      </Link>
    </section>
  );
}

/**
 * Helper para que el flujo de checkout grabe el último pedido.
 * Llamar después del éxito del POST /orders.
 */
export function setLastOrder(o: LastOrder): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
    // Disparamos evento para que el strip se refresque sin reload
    window.dispatchEvent(
      new CustomEvent("buleje:last-order-updated", { detail: o }),
    );
  } catch {
    /* silent */
  }
}

export function clearLastOrder(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* silent */
  }
}
