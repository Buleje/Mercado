"use client";

/**
 * Productos REALES para /marketplace/para-vos: el catálogo público ordenado
 * por «popular» (tiendas publicadas, con stock, mezclado por tienda), en
 * páginas de 12 con cursor. Reemplaza el mock con tiendas inventadas
 * («Bodega Elsa», «Minimarket Don Carlos») y su «Agregar — demo» (09-10).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";

interface ItemCatalogo {
  storeProductId: string | number;
  productId: number;
  name: string;
  description?: string | null;
  price: number;
  image?: string | null;
  unit?: string | null;
  category?: string | null;
  stock?: number;
  commentCount?: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogo?: string | null;
  storeRating?: number;
}

interface RespuestaCatalogo {
  data?: ItemCatalogo[];
  nextCursor?: string;
  hasMore?: boolean;
}

export interface ProductoParaTi extends UnifiedProductCardProduct {
  href: string;
}

const POR_PAGINA = 12;

function aTarjeta(p: ItemCatalogo): ProductoParaTi {
  return {
    id: p.productId,
    name: p.name,
    description: p.description ?? null,
    price: Number(p.price),
    image: p.image ?? null,
    storeName: p.storeName,
    storeSlug: p.storeSlug,
    storeId: p.storeId,
    storeProductId: String(p.storeProductId),
    storeRating: p.storeRating,
    storeLogo: p.storeLogo ?? null,
    unit: p.unit ?? null,
    category: p.category ?? undefined,
    stock: p.stock,
    commentCount: p.commentCount,
    href: `/marketplace/${p.storeSlug}/producto/${p.productId}`,
  };
}

export function useParaTi() {
  const [items, setItems] = useState<ProductoParaTi[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const enVuelo = useRef(false);

  const cargar = useCallback(async (primera: boolean) => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setCargando(true);
    setError(false);
    try {
      const qs = new URLSearchParams({ sort: "popular", limit: String(POR_PAGINA) });
      if (!primera && cursor.current) qs.set("cursor", cursor.current);
      const res = await fetch(`/api/marketplace/catalog?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as RespuestaCatalogo;
      const nuevos = (json.data ?? []).map(aTarjeta);
      cursor.current = json.nextCursor;
      setHayMas(Boolean(json.hasMore && json.nextCursor));
      setItems((prev) => {
        const base = primera ? [] : prev;
        const vistos = new Set(base.map((p) => p.storeProductId));
        return [...base, ...nuevos.filter((p) => !vistos.has(p.storeProductId))];
      });
    } catch {
      setError(true);
    } finally {
      enVuelo.current = false;
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(true);
  }, [cargar]);

  return {
    items,
    cargando,
    error,
    hayMas,
    cargarMas: () => void cargar(false),
    reintentar: () => void cargar(items.length === 0),
  };
}
