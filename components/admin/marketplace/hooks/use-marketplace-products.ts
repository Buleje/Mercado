"use client";

import { useState, useEffect, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export interface MarketplaceProductBoost {
  id: string;
  status: string;
  bidAmount: number;
  startDate: string;
  endDate: string;
  totalSpentPen: number;
  maxBudgetPen: number;
  impressionsCount: number;
  clicksCount: number;
}

export interface MarketplaceProduct {
  id: string;
  productId?: number;
  name: string;
  isActive: boolean;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  sku: string;
  // Brandon mayo 2026 v7: campos que el endpoint ya devolvía pero no
  // estaban en el tipo. Necesarios para mostrar imagen + filtrar por
  // categoría en la tabla de productos del marketplace.
  image?: string | null;
  description?: string | null;
  category?: string | null;
  // Nivel C: destacar producto + comparar con competencia.
  boost?: MarketplaceProductBoost | null;
  competitionAvgPrice?: number | null;
  competitionStoreCount?: number;
}

export function useMarketplaceProducts() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  // Brandon mayo 2026 v7 (Nivel B):
  // - bulkBusy: indica que un updateMany está en curso para deshabilitar UI.
  // - pricingId: indica qué producto está actualizando precio inline.
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pricingId, setPricingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/marketplace/stores/my/products")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudieron cargar los productos del marketplace."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/stores/my/sync", {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (!res.ok) throw new Error("Error al sincronizar");
      const data = await res.json();
      const d = data.data;
      setSyncResult(`${d.created} nuevos · ${d.updated} reactivados · ${d.deactivated} desactivados`);
      load();
      setTimeout(() => setSyncResult(null), 5000);
    } catch {
      setError("Error al sincronizar inventario. Intenta nuevamente.");
    } finally {
      setSyncing(false);
    }
  };

  const toggleActive = async (product: MarketplaceProduct) => {
    setToggling(product.id);
    try {
      const res = await fetch(`/api/marketplace/stores/my/products/${product.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      if (!res.ok) throw new Error();
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, isActive: !p.isActive } : p))
      );
    } catch {
      setError("Error al actualizar el producto.");
    } finally {
      setToggling(null);
    }
  };

  // Brandon mayo 2026 v7 (Nivel B): bulk activar/desactivar productos.
  const bulkSetActive = async (ids: string[], isActive: boolean) => {
    if (ids.length === 0) return { ok: false, updatedCount: 0 };
    setBulkBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/stores/my/products/bulk", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, isActive }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { ok: boolean; updatedCount: number };
      // Optimista: reflejar el cambio en memoria sin refetch.
      setProducts((prev) =>
        prev.map((p) => (ids.includes(p.id) ? { ...p, isActive } : p)),
      );
      return { ok: true, updatedCount: data.updatedCount };
    } catch {
      setError("Error al actualizar los productos en bloque.");
      return { ok: false, updatedCount: 0 };
    } finally {
      setBulkBusy(false);
    }
  };

  // Brandon mayo 2026 v7 (Nivel B): editar precio retail o mayorista inline.
  const updatePrice = async (
    productId: string,
    patch: { retailPrice?: number; wholesalePrice?: number },
  ) => {
    setPricingId(productId);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/stores/my/products/${productId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const updated = (await res.json()) as {
        retailPrice: number;
        wholesalePrice: number;
      };
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                retailPrice: updated.retailPrice,
                wholesalePrice: updated.wholesalePrice,
              }
            : p,
        ),
      );
      return { ok: true };
    } catch {
      setError("No se pudo actualizar el precio.");
      return { ok: false };
    } finally {
      setPricingId(null);
    }
  };

  // Brandon mayo 2026 v7 (Nivel C): crear un SponsoredBoost para destacar
  // un producto en el marketplace.
  const createBoost = async (
    productId: number,
    storeId: string,
    payload: { bidAmount: number; days: number; maxBudgetPen: number },
  ) => {
    setError(null);
    try {
      const now = new Date();
      const end = new Date(now.getTime() + payload.days * 24 * 60 * 60 * 1000);
      const res = await fetch("/api/marketplace/sponsored", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          storeId,
          productId,
          bidAmount: payload.bidAmount,
          startDate: now.toISOString(),
          endDate: end.toISOString(),
          maxBudgetPen: payload.maxBudgetPen,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Error al crear boost");
      }
      // Reload products para que aparezca el boost activo en la tabla.
      load();
      return { ok: true };
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo destacar el producto.");
      return { ok: false };
    }
  };

  const stopBoost = async (boostId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/sponsored/${boostId}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      if (!res.ok) throw new Error();
      load();
      return { ok: true };
    } catch {
      setError("No se pudo detener el boost.");
      return { ok: false };
    }
  };

  return {
    products,
    loading,
    error,
    toggling,
    syncing,
    syncResult,
    bulkBusy,
    pricingId,
    load,
    handleSync,
    toggleActive,
    bulkSetActive,
    updatePrice,
    createBoost,
    stopBoost,
  };
}
