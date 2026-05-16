"use client";

import { useState, useEffect, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export interface MarketplaceOrder {
  id: string;
  customerName: string;
  total: number;
  status: string;
  createdAt: string;
  itemsCount: number;
  // Brandon mayo 2026 v7 (Nivel A): el endpoint ya devolvía estos campos
  // (masked phone para PII compliance), faltaban en el tipo.
  customerPhone?: string | null;
  customerLocation?: string | null;
  customerReference?: string | null;
}

export interface MarketplaceOrderDetailItem {
  id: string;
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit?: string | null;
  image?: string | null;
}

export interface MarketplaceOrderDetail {
  id: string;
  status: string;
  total: number;
  customerName: string;
  customerPhone?: string | null;
  customerLocation?: string | null;
  customerReference?: string | null;
  createdAt: string;
  couponDiscount?: number | null;
  discountAmount?: number | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  items: MarketplaceOrderDetailItem[];
}

export type OrderTargetStatus =
  | "confirmado"
  | "preparando"
  | "en_camino"
  | "entregado"
  | "cancelado";

export function useMarketplaceOrders() {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Brandon mayo 2026 v7 (Nivel B):
  // - updatingId: orden que está cambiando status (loading inline).
  // - bulkBusy: deshabilita UI mientras corre POST /bulk.
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/marketplace/orders")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudieron cargar las órdenes del marketplace."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Brandon mayo 2026 v7 (Nivel B): cambiar status inline desde la tabla.
  const updateStatus = useCallback(
    async (orderId: string, status: OrderTargetStatus, cancelReason?: string) => {
      setUpdatingId(orderId);
      setError(null);
      try {
        const res = await fetch(`/api/marketplace/orders/${orderId}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ status, ...(cancelReason ? { cancelReason } : {}) }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg =
            typeof data?.error === "string"
              ? data.error
              : "No se pudo cambiar el estado.";
          setError(msg);
          return { ok: false, error: msg };
        }
        // Optimista — refrescamos en memoria y dejamos load() en BG.
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
        return { ok: true };
      } catch {
        const msg = "Error de red al cambiar estado.";
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setUpdatingId(null);
      }
    },
    [],
  );

  // Bulk status change: marcar N órdenes a la vez como `confirmado`/`preparando`/etc.
  const bulkUpdateStatus = useCallback(
    async (
      ids: string[],
      status: OrderTargetStatus,
      cancelReason?: string,
    ) => {
      if (ids.length === 0) {
        return { ok: false, updatedCount: 0, skipped: [] as Array<{ id: string; reason: string }> };
      }
      setBulkBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/marketplace/orders/bulk", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ ids, status, ...(cancelReason ? { cancelReason } : {}) }),
        });
        if (!res.ok) {
          setError("No se pudieron actualizar las órdenes en bloque.");
          return { ok: false, updatedCount: 0, skipped: [] };
        }
        const data = (await res.json()) as {
          ok: boolean;
          updatedCount: number;
          skipped: Array<{ id: string; reason: string }>;
        };
        const skippedIds = new Set(data.skipped.map((s) => s.id));
        setOrders((prev) =>
          prev.map((o) =>
            ids.includes(o.id) && !skippedIds.has(o.id) ? { ...o, status } : o,
          ),
        );
        return { ok: true, updatedCount: data.updatedCount, skipped: data.skipped };
      } catch {
        setError("Error de red en actualización masiva.");
        return { ok: false, updatedCount: 0, skipped: [] };
      } finally {
        setBulkBusy(false);
      }
    },
    [],
  );

  // Brandon mayo 2026 v7 (Nivel B): detalle completo de orden con items
  // (modal). Lazy fetch — solo cuando el admin abre el modal.
  const fetchDetail = useCallback(async (orderId: string): Promise<MarketplaceOrderDetail | null> => {
    try {
      const res = await fetch(`/api/marketplace/orders/${orderId}`);
      if (!res.ok) return null;
      const data = await res.json();
      // El endpoint devuelve { data: dto } — dto vive en PrismaOrderRepository.findByIdDto
      const dto = data?.data ?? data;
      return dto as MarketplaceOrderDetail;
    } catch {
      return null;
    }
  }, []);

  return {
    orders,
    loading,
    error,
    updatingId,
    bulkBusy,
    load,
    updateStatus,
    bulkUpdateStatus,
    fetchDetail,
  };
}
