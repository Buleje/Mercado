"use client";

import { useState, useEffect, useCallback } from "react";
import type { DbOrder } from "@/lib/jsondb";
import { fetchAllOrders } from "@/lib/admin-helpers";

export interface OrdersDataState {
  orders: DbOrder[];
  loading: boolean;
  loadError: string | null;
  storeLat: number | null;
  storeLon: number | null;
  storeName: string;
  detailOrder: DbOrder | null;
}

export interface OrdersDataActions {
  load: () => Promise<void>;
  setOrders: React.Dispatch<React.SetStateAction<DbOrder[]>>;
  setLoadError: React.Dispatch<React.SetStateAction<string | null>>;
  setDetailOrder: React.Dispatch<React.SetStateAction<DbOrder | null>>;
}

export function useOrdersData(): OrdersDataState & OrdersDataActions {
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLon, setStoreLon] = useState<number | null>(null);
  const [storeName, setStoreName] = useState("Mi Bodega");
  const [detailOrder, setDetailOrder] = useState<DbOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const fetched = await fetchAllOrders();
      setOrders(fetched);
    } catch {
      setLoadError("Error al cargar pedidos. Verifica tu conexión.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.businessLat) setStoreLat(d.businessLat);
        if (d?.businessLon) setStoreLon(d.businessLon);
        if (d?.businessName) setStoreName(d.businessName);
      })
      .catch(() => {});
  }, []);

  return {
    orders,
    loading,
    loadError,
    storeLat,
    storeLon,
    storeName,
    detailOrder,
    load,
    setOrders,
    setLoadError,
    setDetailOrder,
  };
}
