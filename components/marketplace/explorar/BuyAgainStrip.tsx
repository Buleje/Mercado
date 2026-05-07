"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import ExplorarSectionHeader from "./ExplorarSectionHeader";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ReorderItem {
  productId: number;
  name: string;
  image: string | null;
  quantity: number;
  unitPrice: number;
  storeSlug?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function SkeletonCard() {
  return (
    <div className="border border-[var(--rule-soft)] rounded-xl overflow-hidden bg-[var(--surface-raised)]">
      <div className="aspect-square skeleton-shimmer" />
      <div className="p-3 space-y-2">
        <div className="h-4 rounded-md skeleton-shimmer" />
        <div className="h-4 w-2/3 rounded-md skeleton-shimmer" />
      </div>
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function BuyAgainStrip() {
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((r) => r.startsWith("buleje-customer-phone="))
      ?.split("=")[1];

    if (!raw) {
      setLoading(false);
      return;
    }

    const phone = decodeURIComponent(raw);

    (async () => {
      try {
        const res = await fetch("/api/marketplace/reorder/last", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ phone }),
        });
        if (!res.ok) throw new Error("fetch error");
        const data = (await res.json()) as { items: ReorderItem[]; message?: string };
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // No hay phone en cookie y ya terminamos de cargar
  if (!loading && items.length === 0) return null;

  return (
    <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <ExplorarSectionHeader
        kicker="Para ti"
        title="Compra de nuevo"
        subtitle="Lo que ya pediste antes, listo en un toque"
        ctaLabel="Ver mis pedidos"
        ctaHref="/marketplace/mi-cuenta/pedidos"
      />

      <HorizontalCarousel ariaLabel="Compra de nuevo">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : items.map((item) => (
              <Link
                key={item.productId}
                href={
                  item.storeSlug
                    ? `/marketplace/${item.storeSlug}/producto/${item.productId}`
                    : `/marketplace/explorar?q=${encodeURIComponent(item.name)}`
                }
                className="group/card block relative overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-all duration-300 hover:border-[var(--accent)]/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40 motion-reduce:hover:translate-y-0"
              >
                {/* Badge cantidad — legible */}
                <span className="absolute top-2.5 right-2.5 z-10 inline-flex items-center rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)] px-2.5 py-1 text-xs font-bold leading-none">
                  Pediste {item.quantity}×
                </span>

                <div className="relative aspect-square bg-[var(--surface-canvas)] overflow-hidden">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="240px"
                      className="object-cover transition-transform duration-500 group-hover/card:scale-105 motion-reduce:group-hover/card:scale-100"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Package className="h-10 w-10 text-[var(--text-tertiary)]" aria-hidden />
                    </span>
                  )}
                </div>

                <div className="p-4 flex flex-col gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] leading-snug">
                    {item.name}
                  </p>
                  <p className="text-2xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none">
                    {pen.format(item.unitPrice)}
                  </p>
                </div>
              </Link>
            ))}
      </HorizontalCarousel>
    </section>
  );
}
