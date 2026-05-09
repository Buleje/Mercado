"use client";

import { useState, useEffect } from "react";

export interface MarketplaceStoreData {
  id?: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  category: string;
  zone: string;
  commissionRate: number;
  isActive: boolean;
  vacationMode?: boolean;
  vacationMessage?: string;
}

const DEFAULT_STORE: MarketplaceStoreData = {
  slug: "",
  name: "",
  description: "",
  logoUrl: "",
  category: "Abarrotes",
  zone: "Centro",
  commissionRate: 5,
  isActive: false,
};

export function useMarketplaceTienda() {
  const [store, setStore] = useState<MarketplaceStoreData>(DEFAULT_STORE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/marketplace/stores?my=true")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && (d.slug || d.name)) setStore(d as MarketplaceStoreData);
      })
      .catch(() => setError("Error al cargar datos de la tienda."))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!store.name?.trim()) {
      setError("El nombre de la tienda es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/stores", {
        method: store.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "Error al guardar");
      }
      const data = await res.json();
      setStore(data as MarketplaceStoreData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la tienda. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  return { store, setStore, loading, saving, error, saved, handleSave };
}
