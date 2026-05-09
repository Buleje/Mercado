"use client";

import { useState, useEffect, useCallback } from "react";

export interface MarketplaceProduct {
  id: string;
  name: string;
  isActive: boolean;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  sku: string;
}

export function useMarketplaceProducts() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

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
      const res = await fetch("/api/marketplace/stores/my/sync", { method: "POST" });
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
        headers: { "Content-Type": "application/json" },
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

  return { products, loading, error, toggling, syncing, syncResult, load, handleSync, toggleActive };
}
