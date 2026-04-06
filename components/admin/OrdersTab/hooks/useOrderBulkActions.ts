"use client";

import { useState } from "react";
import type { OrderStatus } from "@/lib/jsondb";

interface UseOrderBulkActionsProps {
  onComplete: () => void;
}

export function useOrderBulkActions({ onComplete }: UseOrderBulkActionsProps) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkStatusTarget, setBulkStatusTarget] = useState<OrderStatus | "">("");
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const toggleOrderSelect = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearOrderSelection = () => setSelectedOrderIds(new Set());

  const executeBulkStatus = async () => {
    if (!bulkStatusTarget || selectedOrderIds.size === 0) return;
    setBulkUpdating(true);
    try {
      await fetch("/api/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedOrderIds), status: bulkStatusTarget }),
      });
    } catch { /* ignore */ }
    setBulkUpdating(false);
    clearOrderSelection();
    setBulkStatusTarget("");
    onComplete();
  };

  return {
    selectedOrderIds,
    bulkStatusTarget,
    setBulkStatusTarget,
    bulkUpdating,
    toggleOrderSelect,
    clearOrderSelection,
    executeBulkStatus,
  };
}
