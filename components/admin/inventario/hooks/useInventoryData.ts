"use client";

import { useState, useEffect, useCallback } from "react";
import type { DbProduct, DbInventoryMovement } from "@/lib/jsondb";

export function useInventoryData() {
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [movements, setMovements] = useState<DbInventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // cache: "no-store" — sin esto el browser cachea la respuesta y los bulk
      // edits no se reflejan al recargar el listado (bug 2026-04-20 bulk-clear-images).
      const [pRes, mRes] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/inventory-movements", { cache: "no-store" }),
      ]);
      if (pRes.ok) setProducts(await pRes.json());
      if (mRes.ok) setMovements(await mRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { products, setProducts, movements, loading, load };
}
