"use client";

/**
 * CartSuggestions — sección de descubrimiento al final del carrito.
 *
 * Brandon 2026-05-27. Dos bloques:
 *   1. "Tu último antojo" — productos vistos recientemente (localStorage), para
 *      retomar lo que estabas mirando. Link al producto (no quick-add: la
 *      entrada de recientes no guarda los campos de carrito).
 *   2. "Sumá a tu pedido" — cross-sell: trae más productos de las MISMAS
 *      tiendas del carrito, prioriza las categorías que ya estás llevando y
 *      excluye lo que ya está en el carrito. "+" agrega al toque.
 *
 * Self-contained: lee el carrito y los recientes por su cuenta.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Sparkles, Plus, Check, Clock } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useRecentViewed } from "@/hooks/use-recent-viewed";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

interface Suggestion {
  productId: number;
  storeProductId: string;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
}

export default function CartSuggestions() {
  const { items, addItem } = useMarketplaceCart();
  const { items: recent } = useRecentViewed();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());

  // Derivar tiendas, categorías y productos ya en el carrito.
  const { stores, cartCats, excludedIds } = useMemo(() => {
    const storeMap = new Map<string, { slug: string; name: string; id: string }>();
    const cats = new Set<string>();
    const ex = new Set<number>();
    for (const it of items) {
      if (it.storeSlug) {
        storeMap.set(it.storeSlug, {
          slug: it.storeSlug,
          name: it.storeName ?? "",
          id: it.storeId ?? "",
        });
      }
      if (it.category) cats.add(String(it.category).toLowerCase());
      ex.add(it.productId);
    }
    return { stores: [...storeMap.values()], cartCats: cats, excludedIds: ex };
  }, [items]);

  useEffect(() => {
    if (stores.length === 0) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    // Máx 2 tiendas para acotar requests (multi-vendor).
    Promise.all(
      stores.slice(0, 2).map((s) =>
        fetch(
          `/api/marketplace/catalog?storeSlug=${encodeURIComponent(s.slug)}&sort=popular&limit=12`,
          { signal: ctrl.signal },
        )
          .then((r) => (r.ok ? r.json() : { data: [] }))
          .then((j) => ({ store: s, rows: (j.data ?? []) as Array<Record<string, unknown>> }))
          .catch(() => ({ store: s, rows: [] as Array<Record<string, unknown>> })),
      ),
    ).then((results) => {
      const mapped: Suggestion[] = [];
      for (const { store, rows } of results) {
        for (const p of rows) {
          const pid = Number(p.productId);
          if (excludedIds.has(pid)) continue;
          if (p.stock != null && (p.stock as number) <= 0) continue;
          mapped.push({
            productId: pid,
            storeProductId: String(p.storeProductId),
            name: String(p.name),
            price: Number(p.price) || 0,
            image: (p.image as string | null) ?? null,
            unit: (p.unit as string | null) ?? null,
            category: (p.category as string | null) ?? null,
            stock: (p.stock as number | null) ?? null,
            storeId: (p.storeId as string) ?? store.id,
            storeName: (p.storeName as string) ?? store.name,
            storeSlug: (p.storeSlug as string) ?? store.slug,
          });
        }
      }
      // Prioriza categorías ya en el carrito (más de lo que estás llevando).
      mapped.sort((a, b) => {
        const aIn = cartCats.has((a.category ?? "").toLowerCase()) ? 0 : 1;
        const bIn = cartCats.has((b.category ?? "").toLowerCase()) ? 0 : 1;
        return aIn - bIn;
      });
      const seen = new Set<string>();
      const out: Suggestion[] = [];
      for (const m of mapped) {
        if (seen.has(m.storeProductId)) continue;
        seen.add(m.storeProductId);
        out.push(m);
        if (out.length >= 10) break;
      }
      setSuggestions(out);
    });
    return () => ctrl.abort();
  }, [stores, excludedIds, cartCats]);

  const recentFiltered = useMemo(
    () => recent.filter((r) => !excludedIds.has(r.productId)).slice(0, 10),
    [recent, excludedIds],
  );

  const handleAdd = (s: Suggestion) => {
    addItem({
      storeId: s.storeId,
      storeName: s.storeName,
      storeSlug: s.storeSlug,
      storeProductId: s.storeProductId,
      productId: s.productId,
      name: s.name,
      price: s.price,
      basePrice: s.price,
      image: s.image,
      unit: s.unit,
      category: s.category ?? undefined,
      stock: s.stock,
      quantity: 1,
    });
    setAdded((prev) => new Set(prev).add(s.storeProductId));
  };

  if (suggestions.length === 0 && recentFiltered.length === 0) return null;

  return (
    <section className="mt-8 sm:mt-10 space-y-8" aria-label="Sugerencias para tu pedido">
      {/* ── Tu último antojo ── */}
      {recentFiltered.length > 0 && (
        <div>
          <SectionHead
            icon={<Clock className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
            title="Tu último antojo"
            subtitle="Lo que estabas mirando"
          />
          <Strip>
            {recentFiltered.map((r) => (
              <Link
                key={`${r.storeSlug}-${r.productId}`}
                href={`/marketplace/${r.storeSlug}/producto/${r.productId}`}
                className="group shrink-0 w-36 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden hover:border-[var(--accent)] transition-colors"
              >
                <div className="relative h-28 w-full bg-[var(--surface-sunken)]">
                  {r.image ? (
                    <Image src={r.image} alt="" fill sizes="144px" className="object-cover" unoptimized />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                      Sin foto
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] leading-tight line-clamp-2 min-h-[2rem] group-hover:text-[var(--accent)] transition-colors">
                    {r.name}
                  </p>
                  <p className="mt-1 text-sm font-black text-[var(--text-primary)] tabular-nums">
                    {fmt(r.price)}
                  </p>
                </div>
              </Link>
            ))}
          </Strip>
        </div>
      )}

      {/* ── Sumá a tu pedido (cross-sell por categoría) ── */}
      {suggestions.length > 0 && (
        <div>
          <SectionHead
            icon={<Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
            title="Sumá a tu pedido"
            subtitle="Más de lo que estás llevando, de tus mismas tiendas"
          />
          <Strip>
            {suggestions.map((s) => {
              const isAdded = added.has(s.storeProductId);
              return (
                <div
                  key={s.storeProductId}
                  className="shrink-0 w-36 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden"
                >
                  <Link
                    href={`/marketplace/${s.storeSlug}/producto/${s.productId}`}
                    className="block relative h-28 w-full bg-[var(--surface-sunken)]"
                  >
                    {s.image ? (
                      <Image src={s.image} alt="" fill sizes="144px" className="object-cover" unoptimized />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] text-center px-1">
                        {s.category ?? "Producto"}
                      </span>
                    )}
                  </Link>
                  <div className="p-2.5">
                    <p className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] leading-tight line-clamp-2 min-h-[2rem]">
                      {s.name}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span className="text-sm font-black text-[var(--text-primary)] tabular-nums">
                        {fmt(s.price)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAdd(s)}
                        aria-label={isAdded ? `${s.name} agregado` : `Agregar ${s.name} al carrito`}
                        className={cn(
                          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-90",
                          isAdded
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "bg-[var(--accent)] text-white hover:brightness-110",
                        )}
                      >
                        {isAdded ? (
                          <Check className="h-4 w-4" strokeWidth={2.75} />
                        ) : (
                          <Plus className="h-4 w-4" strokeWidth={2.75} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </Strip>
        </div>
      )}
    </section>
  );
}

/* ── Sub-componentes ──────────────────────────────────────────────────────── */

function SectionHead({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
        {icon}
      </span>
      <div className="leading-tight">
        <h2 className="text-base sm:text-lg font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          {title}
        </h2>
        <p className="text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] text-[var(--text-tertiary)] font-medium">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex gap-3 overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden pb-1 -mx-1 px-1"
      style={{ scrollbarWidth: "none" }}
    >
      {children}
    </div>
  );
}
