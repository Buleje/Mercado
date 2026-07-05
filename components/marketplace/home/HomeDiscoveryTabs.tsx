"use client";

/**
 * HomeDiscoveryTabs — fila ANCHA de descubrimiento con pestañas (Brandon
 * 2026-06-14, opción elegida sobre las dos cajas lado a lado). Una sola fila a
 * todo el ancho; las pestañas (Nuevos / Lo más pedido / Ofertas / Combos)
 * cambian el contenido del mismo carrusel. Cards grandes (5-6 visibles en
 * desktop), estilo AliExpress/Mercado Libre. Cada pestaña se fetchea on-demand
 * y se cachea en memoria. Si la pestaña activa no tiene datos, muestra un aviso
 * corto (sin romper la fila).
 */

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles, Flame, Tag, Package, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ComboMiniCard from "@/components/marketplace/home/ComboMiniCard";
import type { UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";

type Item = UnifiedProductCardProduct & { soldUnits?: number };

type TabKey = "nuevos" | "top" | "ofertas" | "combos";

interface TabDef {
  key: TabKey;
  label: string;
  icon: ReactNode;
  url: string;
  actionHref: string;
  /** Pestaña de ranking → muestra nº de posición + "vendidos". */
  ranked?: boolean;
}

const TABS: TabDef[] = [
  {
    key: "nuevos",
    label: "Nuevos",
    icon: <Sparkles strokeWidth={2.25} aria-hidden />,
    url: "/api/marketplace/catalog?sort=newest&limit=14",
    actionHref: "/?sort=newest#catalogo",
  },
  {
    key: "top",
    label: "Lo más pedido",
    icon: <Flame strokeWidth={2.25} aria-hidden />,
    url: "/api/marketplace/top-today?limit=14",
    actionHref: "/#catalogo",
    ranked: true,
  },
  {
    key: "ofertas",
    label: "Ofertas",
    icon: <Tag strokeWidth={2.25} aria-hidden />,
    url: "/api/marketplace/catalog?sort=price_asc&limit=14",
    actionHref: "/?sort=price_asc#catalogo",
  },
  {
    key: "combos",
    label: "Combos",
    icon: <Package strokeWidth={2.25} aria-hidden />,
    url: "/api/marketplace/catalog?category=promociones&limit=14",
    actionHref: "/?cat=promociones#catalogo",
  },
];

function normalize(raw: Record<string, unknown>): Item {
  const store = (raw.store ?? {}) as Record<string, unknown>;
  const images = Array.isArray(raw.images) ? (raw.images as string[]) : [];
  return {
    id: Number(raw.productId ?? raw.id),
    name: String(raw.name ?? ""),
    price: Number(raw.price ?? 0),
    originalPrice: raw.originalPrice != null ? Number(raw.originalPrice) : undefined,
    image: (raw.image as string) ?? images[0] ?? null,
    unit: (raw.unit as string) ?? null,
    storeName: String(raw.storeName ?? store.name ?? ""),
    storeSlug: String(raw.storeSlug ?? store.slug ?? ""),
    storeId: String(raw.storeId ?? store.id ?? ""),
    storeProductId: String(raw.storeProductId ?? ""),
    storeLogo: (raw.storeLogo as string) ?? (store.logo as string) ?? null,
    storeRating: Number(raw.avgRating ?? store.rating ?? 0),
    category: String(raw.category ?? ""),
    soldUnits: raw.soldUnits != null ? Number(raw.soldUnits) : undefined,
  };
}

// Grilla contenida (como "Todos los productos"): sin scroll horizontal, todo
// visible en filas. 12 = 2 filas limpias en desktop; el resto vía "Ver todo".
const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";
const GRID_MAX = 12;

export default function HomeDiscoveryTabs() {
  const [active, setActive] = useState<TabKey>("nuevos");
  // Cache por pestaña (en memoria) — fetch una vez por tab.
  const [cache, setCache] = useState<Partial<Record<TabKey, Item[]>>>({});

  const activeTab = TABS.find((t) => t.key === active)!;
  const items = cache[active] ?? null;

  useEffect(() => {
    if (cache[active]) return; // ya fetcheado
    let cancelled = false;
    (async () => {
      let list: Item[] = [];
      try {
        const r = await fetch(activeTab.url);
        if (r.ok) {
          const d = await r.json();
          const raw = Array.isArray(d?.data)
            ? d.data
            : Array.isArray(d?.items)
              ? d.items
              : [];
          list = raw.map(normalize);
        }
        // Fallback del ranking: si top-today viene vacío, catálogo por popularidad.
        if (list.length === 0 && activeTab.ranked) {
          const r2 = await fetch("/api/marketplace/catalog?sort=popular&limit=14");
          if (r2.ok) {
            const d2 = await r2.json();
            const raw2 = Array.isArray(d2?.data)
              ? d2.data
              : Array.isArray(d2?.items)
                ? d2.items
                : [];
            list = raw2.map(normalize);
          }
        }
      } catch {
        /* queda vacío → aviso corto */
      }
      const clean = list.filter((p) => p.id && p.name);
      if (!cancelled) setCache((c) => ({ ...c, [active]: clean }));
    })();
    return () => {
      cancelled = true;
    };
  }, [active, activeTab, cache]);

  return (
    <div className="rounded-2xl bg-[var(--surface-raised)] p-3 sm:p-4">
      {/* Pestañas + "Ver todo" */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--rule-soft)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            aria-pressed={active === t.key}
            className={cn(
              "-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors sm:px-4",
              active === t.key
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">{t.icon}</span>
            {t.label}
          </button>
        ))}
        <Link
          href={activeTab.actionHref}
          className="ml-auto hidden h-10 shrink-0 items-center gap-1 px-3 text-[length:var(--ts-xs)] font-semibold text-[var(--accent)] hover:underline sm:inline-flex"
        >
          Ver todo
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {/* Grilla contenida (no se corre al borde; como "Todos los productos") */}
      <div className="mt-3">
        {items === null ? (
          <div className={GRID_CLASS}>
            {Array.from({ length: GRID_MAX }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl skeleton-shimmer" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">
            Nada por acá todavía — probá otra pestaña.
          </p>
        ) : (
          <ul className={GRID_CLASS} aria-label={activeTab.label}>
            {items.slice(0, GRID_MAX).map((p, idx) => (
              <li key={p.storeProductId || p.id}>
                <ComboMiniCard
                  index={idx}
                  href={`/marketplace/${p.storeSlug}?p=${p.id}`}
                  product={p}
                  rank={activeTab.ranked ? idx + 1 : undefined}
                  soldUnits={activeTab.ranked ? p.soldUnits : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
