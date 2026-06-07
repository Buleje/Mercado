"use client";

/**
 * /marketplace/para-vos — Feed personalizado estilo TikTok/Instagram.
 *
 * Usa DiscoveryFeed primitivo de la ronda 4 con productos mock.
 * Infinite scroll con intersection observer + badge "Nuevo" en cards.
 *
 * Futuro: conectar con /api/marketplace/recommendations/feed
 * (filtrar por historial, compras pasadas, zona geolocalizada).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "@buleje/design-system/icons";
import DiscoveryFeed, { type FeedItem } from "@/components/ui-system/DiscoveryFeed";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useShare } from "@/hooks/use-share";
import { Kicker } from "@/components/ui-system/Kicker";

// Mock de productos — en prod viene de la API personalizada
const MOCK_BASE: Omit<FeedItem, "id">[] = [
  {
    slug: "arroz-paisana-5kg",
    name: "Arroz Paisana 5kg",
    price: 22.5,
    originalPrice: 26.9,
    storeName: "Bodega Elsa",
    storeSlug: "bodega-elsa",
    unit: "bolsa 5kg",
    badge: "Oferta",
    tagline: "El más pedido de esta semana",
  },
  {
    slug: "aceite-primor-1l",
    name: "Aceite Primor 1L",
    price: 11.8,
    storeName: "Minimarket Don Carlos",
    storeSlug: "minimarket-carlos",
    unit: "botella 1L",
    tagline: "Para tu cocina del día",
  },
  {
    slug: "detergente-ariel-4k",
    name: "Detergente Ariel 4kg",
    price: 42.0,
    originalPrice: 49.9,
    storeName: "Bodega Doña María",
    storeSlug: "bodega-donia-maria",
    unit: "caja 4kg",
    badge: "-16%",
    tagline: "Te dura todo el mes",
  },
  {
    slug: "leche-gloria-x6",
    name: "Leche Gloria Pack x6",
    price: 26.4,
    storeName: "Bodega Elsa",
    storeSlug: "bodega-elsa",
    unit: "pack 6u 400g",
    tagline: "Rinde más que el litro",
  },
  {
    slug: "quinua-organica-kg",
    name: "Quinua Orgánica Real 1kg",
    price: 18.5,
    storeName: "Minimarket Andino",
    storeSlug: "minimarket-andino",
    unit: "bolsa 1kg",
    badge: "Orgánico",
    tagline: "Cosecha del valle",
  },
  {
    slug: "azucar-rubia-2k",
    name: "Azúcar Rubia Cartavio 2kg",
    price: 8.9,
    originalPrice: 10.4,
    storeName: "Bodega San Martín",
    storeSlug: "bodega-san-martin",
    unit: "bolsa 2kg",
    tagline: "Ideal para tus postres",
  },
  {
    slug: "atun-florida-170g",
    name: "Atún Florida 170g",
    price: 4.8,
    storeName: "Minimarket Don Carlos",
    storeSlug: "minimarket-carlos",
    unit: "lata 170g",
    badge: "Fresco",
    tagline: "Perfecto para tus ensaladas",
  },
  {
    slug: "chocolate-sublime-4b",
    name: "Sublime Pack x4",
    price: 7.2,
    storeName: "Bodega Elsa",
    storeSlug: "bodega-elsa",
    unit: "pack 4 barras",
    tagline: "Para el break de la tarde",
  },
];

const PAGE_SIZE = 4;

function loadPage(pageNum: number): FeedItem[] {
  const start = pageNum * PAGE_SIZE;
  return MOCK_BASE.slice(start, start + PAGE_SIZE).map((p, i) => ({
    ...p,
    id: `${p.slug}-p${pageNum}-${i}`,
  }));
}

export default function ParaVosPage() {
  const [items, setItems] = useState<FeedItem[]>(() => loadPage(0));
  const [page, setPage] = useState(1);
  const hasMore = page * PAGE_SIZE < MOCK_BASE.length;
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const { track } = useRecentlyViewed();
  const { share } = useShare();

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    const next = loadPage(page);
    setItems((prev) => [...prev, ...next]);
    setPage((p) => p + 1);
  }, [page, hasMore]);

  const handleItemClick = useCallback(
    (item: FeedItem) => {
      // Track en recently-viewed
      track({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image ?? null,
        url: `/marketplace/${item.storeSlug}/producto/${item.slug}`,
        unit: item.unit ?? null,
      });
    },
    [track],
  );

  const handleAddToCart = useCallback((item: FeedItem) => {
    // Mock: solo feedback visual — el cart real requiere storeId numerico.
    // En prod: conectar con useMarketplaceCart().addItem con datos reales.
    window.dispatchEvent(
      new CustomEvent("buleje:toast", {
        detail: { message: `${item.name} — demo`, variant: "success" },
      }),
    );
  }, []);

  const handleToggleFav = useCallback((item: FeedItem) => {
    setFavIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  const handleShare = useCallback(
    (item: FeedItem) => {
      void share({
        title: item.name,
        text: `${item.name} — S/${Number(item.price).toFixed(2)} en ${item.storeName}`,
        url: `https://www.buleje.pe/marketplace/${item.storeSlug}/producto/${item.slug}`,
      });
    },
    [share],
  );

  // Prevent-scroll optimization: limpia tab inactiva
  useEffect(() => {
    return () => {
      setItems([]);
    };
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-28">
      {/* Header */}
      <div className="mb-5">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          Volver al marketplace
        </Link>
        <div className="mt-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
          <Kicker className="text-[var(--accent)]">Para vos</Kicker>
        </div>
        <h1 className="mt-1 text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
          Productos curados
        </h1>
        <p className="mt-2 text-sm text-[var(--text-tertiary)] max-w-md">
          Selección basada en tu historial y las ofertas del día. Desliza para descubrir más.
        </p>
      </div>

      <DiscoveryFeed
        items={items}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onItemClick={handleItemClick}
        onAddToCart={handleAddToCart}
        onToggleFav={handleToggleFav}
        onShare={handleShare}
        favoriteIds={favIds}
      />
    </div>
  );
}
