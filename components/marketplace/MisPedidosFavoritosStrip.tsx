"use client";

/**
 * MisPedidosFavoritosStrip — Strip de pedidos que el cliente marcó como
 * favoritos para repetir. Almacenamiento via localStorage por simplicidad
 * (sin schema). Cuando el cliente entra a `/tiendas`, ve atajos directos
 * a sus pedidos repetibles.
 *
 * Estructura del localStorage `buleje:fav-orders`:
 * Array<{ orderId, storeSlug, storeName, total, itemsCount, ts }>
 *
 * El usuario marca/desmarca desde la pantalla de detalle del pedido
 * (componente FavoriteOrderToggle — emite el mismo formato).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, ArrowRight } from "lucide-react";
import TiendasSectionHeader from "./TiendasSectionHeader";

interface FavOrder {
  orderId: string;
  storeSlug: string;
  storeName: string;
  total: number;
  itemsCount: number;
  ts: number;
}

const KEY = "buleje:fav-orders";
const MAX_VISIBLE = 6;

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

export default function MisPedidosFavoritosStrip() {
  const [orders, setOrders] = useState<FavOrder[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setOrders(
          parsed
            .filter(
              (o): o is FavOrder =>
                typeof o?.orderId === "string" &&
                typeof o?.storeSlug === "string",
            )
            .sort((a, b) => b.ts - a.ts)
            .slice(0, MAX_VISIBLE),
        );
      }
    } catch {
      /* silent */
    }
  }, []);

  // No render en SSR + cuando no hay favoritos
  if (!hydrated || orders.length === 0) return null;

  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-12">
      <TiendasSectionHeader
        eyebrow="Tus favoritos"
        title="Repetí lo que te gusta"
        action={{ label: "Ver historial", href: "/marketplace/mi-cuenta?tab=pedidos" }}
      />

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory">
        {orders.map((o) => (
          <Link
            key={o.orderId}
            href={`/marketplace/${o.storeSlug}?repeat=${o.orderId}`}
            className="snap-start shrink-0 w-[260px] group rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 hover:border-[var(--accent)] hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <Star className="h-3.5 w-3.5 fill-current" strokeWidth={2} />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                {new Date(o.ts).toLocaleDateString("es-PE", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            </div>
            <p className="text-sm font-bold text-[var(--text-primary)] truncate">
              {o.storeName}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              {o.itemsCount} {o.itemsCount === 1 ? "item" : "items"} · #{o.orderId.slice(0, 6)}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-base font-black tabular-nums text-[var(--accent)]">
                {fmtCurrency(o.total)}
              </span>
              <span className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] group-hover:gap-1.5 transition-all">
                Repetir
                <ArrowRight className="h-3 w-3" strokeWidth={2.25} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Helper para que otras pantallas puedan agregar/remover favoritos.
 * Uso: import { toggleFavOrder } from "./MisPedidosFavoritosStrip"
 */
export function toggleFavOrder(o: FavOrder): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(KEY);
    const list: FavOrder[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((x) => x.orderId === o.orderId);
    if (idx >= 0) {
      list.splice(idx, 1);
      localStorage.setItem(KEY, JSON.stringify(list));
      return false; // ahora NO está en favoritos
    }
    list.unshift(o);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
    return true; // ahora SÍ está en favoritos
  } catch {
    return false;
  }
}

export function isOrderFav(orderId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const list: FavOrder[] = JSON.parse(raw);
    return list.some((x) => x.orderId === orderId);
  } catch {
    return false;
  }
}
