"use client";

import { useMemo } from "react";
import type { DbProduct, DbInventoryMovement } from "@/lib/jsondb";

// ── Pure computation helpers (duplicated from InventoryTab module-scope) ──────
// Kept local so this hook is self-contained and testeable without importing
// the full InventoryTab module.

function computeStockChange(productId: number, movements: DbInventoryMovement[]): number {
  return movements
    .filter(m => m.productId === productId)
    .reduce((acc, m) => {
      if (m.type === "compra" || m.type === "devolucion" || m.type === "ajuste_positivo") return acc + (m.quantity ?? 0);
      if (m.type === "venta" || m.type === "venta_online" || m.type === "ajuste_negativo" || m.type === "merma") return acc - (m.quantity ?? 0);
      return acc;
    }, 0);
}

function computeSalesPerWeek(productId: number, movements: DbInventoryMovement[]): number {
  const sales = movements.filter(m => m.productId === productId && (m.type === "venta" || m.type === "venta_online"));
  if (sales.length === 0) return 0;
  const totalQty = sales.reduce((s, m) => s + (m.quantity ?? 0), 0);
  const dates = sales.map(m => new Date(m.createdAt).getTime());
  const span = (Math.max(...dates) - Math.min(...dates)) / (7 * 24 * 60 * 60 * 1000);
  return span < 0.5 ? totalQty : totalQty / span;
}

export type RotationLevel = "alta" | "media" | "baja";

export interface StockStats {
  totalProducts: number;
  activeProducts: number;
  lowStockCount: number;
  expiringSoonCount: number;
  totalStockValue: number;
  duplicateWarning: { a: string; b: string }[];
  categoryMargins: { cat: string; margin: number }[];
  topRentables: number[];
  inconsistentes: DbProduct[];
  noImageCount: number;
}

export function useStockMin(products: DbProduct[], movements: DbInventoryMovement[]): StockStats {
  const isLowStock = (p: DbProduct) =>
    p.stockMin !== undefined && p.stock !== undefined && p.stock <= p.stockMin;

  const isExpiringSoon = (p: DbProduct) => {
    const expiry = (p as DbProduct & { expiryDate?: string }).expiryDate;
    if (!expiry) return false;
    const expiryDate = new Date(expiry);
    const now = new Date();
    const diffDays = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  };

  const duplicateWarning = useMemo(() => {
    const slice = products.slice(0, 100);
    const dupes: { a: string; b: string }[] = [];
    for (let i = 0; i < slice.length; i++) {
      for (let j = i + 1; j < slice.length; j++) {
        const la = slice[i].name.toLowerCase().trim();
        const lb = slice[j].name.toLowerCase().trim();
        if (la === lb || ((la.includes(lb) || lb.includes(la)) && la.length / lb.length > 0.7 && la.length / lb.length < 1.4)) {
          dupes.push({ a: slice[i].name, b: slice[j].name });
        }
        if (dupes.length >= 5) break;
      }
      if (dupes.length >= 5) break;
    }
    return dupes;
  }, [products]);

  const categoryMargins = useMemo(() => {
    const catMap = new Map<string, { sum: number; count: number }>();
    for (const p of products) {
      if (!p.active || !p.costPrice || p.costPrice <= 0 || p.price <= 0) continue;
      const cat = p.category || "otros";
      const ex = catMap.get(cat) || { sum: 0, count: 0 };
      ex.sum += ((p.price - p.costPrice) / p.price) * 100;
      ex.count++;
      catMap.set(cat, ex);
    }
    const result: { cat: string; margin: number }[] = [];
    for (const [cat, data] of catMap) {
      if (data.count >= 3) result.push({ cat, margin: data.sum / data.count });
    }
    return result.sort((a, b) => b.margin - a.margin);
  }, [products]);

  const topRentables = useMemo(() => {
    return products
      .filter(p => p.active && p.costPrice && p.costPrice > 0 && p.price > 0 && p.price > p.costPrice)
      .map(p => ({ id: p.id, margin: ((p.price - p.costPrice!) / p.price) * 100 }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5)
      .map(p => p.id);
  }, [products]);

  const inconsistentes = useMemo(() =>
    products.filter(p => p.costPrice && p.price && p.costPrice > p.price),
    [products],
  );

  return {
    totalProducts: products.length,
    activeProducts: products.filter(p => p.active).length,
    lowStockCount: products.filter(isLowStock).length,
    expiringSoonCount: products.filter(isExpiringSoon).length,
    totalStockValue: products.reduce((s, p) => s + (p.stock ?? 0) * p.price, 0),
    duplicateWarning,
    categoryMargins,
    topRentables,
    inconsistentes,
    noImageCount: products.filter(p => !p.image || p.image === "").length,
  };
}

// Re-export helpers so InventoryTab can still use them via the hook module
export { computeStockChange, computeSalesPerWeek };
