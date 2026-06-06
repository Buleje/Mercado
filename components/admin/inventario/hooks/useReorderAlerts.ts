"use client";

import { useState, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbProduct } from "@/lib/jsondb";

export interface AutoReorderConfig {
  threshold: number;
  qty: number;
  supplierId: string;
}

export function useReorderAlerts(products: DbProduct[], onDone: () => void) {
  const [generatingOC, setGeneratingOC] = useState(false);
  const [expandedOC, setExpandedOC] = useState(false);
  const [autoReorderConfigs, setAutoReorderConfigs] = useState<Record<number, AutoReorderConfig>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("auto-reorder-configs");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [showAutoReorder, setShowAutoReorder] = useState<number | null>(null);
  const [arThreshold, setArThreshold] = useState("");
  const [arQty, setArQty] = useState("");

  const lowStockProducts = products.filter(p => {
    const minStock = p.stockMin ?? 5;
    return p.stock != null && p.stock <= minStock && p.active;
  });

  const generateOC = useCallback(async (product: DbProduct) => {
    const minStock = product.stockMin ?? 5;
    const maxStock = product.stockMax ?? minStock * 2;
    const suggestedQty = maxStock - (product.stock ?? 0);
    const unitCost = product.costPrice ?? product.price * 0.7;
    setGeneratingOC(true);
    try {
      await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: "",
          items: [{ productId: product.id, name: product.name, quantity: suggestedQty, unitCost, unit: product.unit }],
          notes: `OC automática - stock bajo (${product.name})`,
        }),
      });
    } catch { /* ignore */ }
    setGeneratingOC(false);
    onDone();
  }, [onDone]);

  const generateBulkOC = useCallback(async () => {
    if (lowStockProducts.length === 0) return;
    setGeneratingOC(true);
    try {
      const items = lowStockProducts.map(p => {
        const minStock = p.stockMin ?? 5;
        const maxStock = p.stockMax ?? minStock * 2;
        const suggestedQty = maxStock - (p.stock ?? 0);
        const unitCost = p.costPrice ?? p.price * 0.7;
        return { productId: p.id, name: p.name, quantity: suggestedQty, unitCost, unit: p.unit };
      });
      await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ supplierId: "", items, notes: "OC automática - stock bajo" }),
      });
    } catch { /* ignore */ }
    setGeneratingOC(false);
    onDone();
  }, [lowStockProducts, onDone]);

  const saveAutoReorder = useCallback((productId: number) => {
    const threshold = parseInt(arThreshold, 10) || 5;
    const qty = parseInt(arQty, 10) || 10;
    const updated = { ...autoReorderConfigs, [productId]: { threshold, qty, supplierId: "" } };
    setAutoReorderConfigs(updated);
    localStorage.setItem("auto-reorder-configs", JSON.stringify(updated));
    setShowAutoReorder(null);
    setArThreshold("");
    setArQty("");
  }, [arThreshold, arQty, autoReorderConfigs]);

  const removeAutoReorder = useCallback((productId: number) => {
    const updated = { ...autoReorderConfigs };
    delete updated[productId];
    setAutoReorderConfigs(updated);
    localStorage.setItem("auto-reorder-configs", JSON.stringify(updated));
  }, [autoReorderConfigs]);

  return {
    lowStockProducts,
    generatingOC,
    expandedOC, setExpandedOC,
    autoReorderConfigs,
    showAutoReorder, setShowAutoReorder,
    arThreshold, setArThreshold,
    arQty, setArQty,
    autoReorderCount: Object.keys(autoReorderConfigs).length,
    generateOC,
    generateBulkOC,
    saveAutoReorder,
    removeAutoReorder,
  };
}
