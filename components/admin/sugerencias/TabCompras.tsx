"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ShoppingCart,
  RefreshCw,
  Download,
  Package,
  AlertTriangle,
  ArrowRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ProductImage from "./ProductImage";
import {
  normalizeProducts,
  aggregateSalesByProduct,
  aggregatePurchasesByProduct,
  isoDaysAgo,
} from "./normalize";

interface Product {
  id: string | number;
  name: string;
  stock: number;
  stockMin: number;
  price: number;
  cost?: number;
  category: string;
  unit?: string;
  imageUrl?: string;
  image?: string;
}

interface SaleData {
  productId: string | number;
  quantity: number;
}

interface PurchaseData {
  productId: string | number;
  supplierName?: string;
  unitCost: number;
}

interface AdvisedItem {
  product: Product;
  daysUntilOut: number;
  weeklySales: number;
  suggestedQty: number;
  bestSupplier: string | null;
  bestCost: number | null;
  estimatedTotal: number;
  urgency: "critical" | "high" | "medium";
  fillPct: number;
}

const URGENCY = {
  critical: {
    label: "Crítico",
    bg: "bg-[var(--data-error-50)]",
    text: "text-[var(--data-error-500)]",
    bar: "bg-[var(--data-error-500)]",
    border: "border-[var(--data-error-500)]",
    barTrack: "bg-[var(--data-error-100,#fee2e2)]",
  },
  high: {
    label: "Urgente",
    bg: "bg-[var(--data-warning-50,#fffbeb)]",
    text: "text-[var(--data-warning-500)]",
    bar: "bg-[var(--data-warning-500)]",
    border: "border-[var(--data-warning-500)]",
    barTrack: "bg-[var(--data-warning-100,#fff1ef)]",
  },
  medium: {
    label: "Esta semana",
    bg: "bg-primary/10",
    text: "text-[var(--data-success-500)]",
    bar: "bg-[var(--data-success-500)]",
    border: "border-[var(--data-success-500)]",
    barTrack: "bg-primary/10",
  },
} as const;

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getMockProducts(): Product[] {
  return [
    { id: "1", name: "Arroz Costeño 5kg", stock: 3, stockMin: 10, price: 19, cost: 14, category: "Abarrotes", unit: "bolsa" },
    { id: "2", name: "Aceite Primor 1L", stock: 1, stockMin: 6, price: 8.5, cost: 6.2, category: "Abarrotes", unit: "unidad" },
    { id: "3", name: "Inca Kola 2L", stock: 4, stockMin: 12, price: 6.5, cost: 4.8, category: "Bebidas", unit: "botella" },
    { id: "4", name: "Azúcar Rubia 1kg", stock: 8, stockMin: 15, price: 4.5, cost: 3.3, category: "Abarrotes", unit: "bolsa" },
    { id: "5", name: "Fideos Don Vittorio 500g", stock: 6, stockMin: 10, price: 3.2, cost: 2.4, category: "Abarrotes", unit: "paquete" },
  ];
}

const MOCK_SALES: SaleData[] = [
  { productId: "1", quantity: 14 },
  { productId: "2", quantity: 9 },
  { productId: "3", quantity: 22 },
  { productId: "4", quantity: 18 },
  { productId: "5", quantity: 11 },
];

const MOCK_PURCH: PurchaseData[] = [
  { productId: "1", supplierName: "Distribuidora Norte", unitCost: 14 },
  { productId: "2", supplierName: "Distribuidora Norte", unitCost: 6.2 },
  { productId: "3", supplierName: "Coca Cola Distr.", unitCost: 4.8 },
];

export default function TabCompras() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleData[]>([]);
  const [purchases, setPurchases] = useState<PurchaseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, sr, hr] = await Promise.all([
        fetch("/api/products?active=true&limit=200", { cache: "no-store" }),
        fetch(`/api/sales?from=${isoDaysAgo(7)}`, { cache: "no-store" }),
        fetch("/api/purchases?limit=200", { cache: "no-store" }),
      ]);
      let failed = false;
      if (pr.ok) setProducts(normalizeProducts(await pr.json())); else failed = true;
      if (sr.ok) setSales(aggregateSalesByProduct(await sr.json())); else failed = true;
      if (hr.ok) setPurchases(aggregatePurchasesByProduct(await hr.json())); else failed = true;
      if (failed) throw new Error("partial");
    } catch {
      setProducts(getMockProducts());
      setSales(MOCK_SALES);
      setPurchases(MOCK_PURCH);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const supplierMap = useMemo(() => {
    const m: Record<string, { name: string; cost: number }> = {};
    purchases.forEach((p) => {
      const k = String(p.productId);
      if (!m[k] || p.unitCost < m[k].cost) {
        m[k] = { name: p.supplierName ?? "Por asignar", cost: p.unitCost };
      }
    });
    return m;
  }, [purchases]);

  const salesMap = useMemo(() => {
    const m: Record<string, number> = {};
    sales.forEach((s) => { m[String(s.productId)] = s.quantity; });
    return m;
  }, [sales]);

  const advised = useMemo<AdvisedItem[]>(() => {
    return products
      .map((p) => {
        const weekly = salesMap[String(p.id)] ?? 0;
        const daily = weekly / 7;
        const days = daily > 0 ? Math.floor(p.stock / daily) : 99;
        const target = Math.max(p.stockMin ?? 0, daily * 14);
        const qty = Math.max(0, Math.ceil(target - p.stock));
        const sup = supplierMap[String(p.id)] ?? null;
        const total = qty * (sup?.cost ?? p.cost ?? p.price * 0.7);
        const urgency: AdvisedItem["urgency"] = days <= 2 ? "critical" : days <= 5 ? "high" : "medium";
        const fillPct = Math.min(100, Math.round((p.stock / Math.max(p.stockMin || 1, 1)) * 100));
        return {
          product: p,
          daysUntilOut: days,
          weeklySales: weekly,
          suggestedQty: qty,
          bestSupplier: sup?.name ?? null,
          bestCost: sup?.cost ?? null,
          estimatedTotal: total,
          urgency,
          fillPct,
        };
      })
      .filter((i) => i.suggestedQty > 0)
      .sort((a, b) => ({ critical: 0, high: 1, medium: 2 }[a.urgency] - { critical: 0, high: 1, medium: 2 }[b.urgency]));
  }, [products, salesMap, supplierMap]);

  const totalEstimated = useMemo(() => advised.reduce((s, i) => s + i.estimatedTotal, 0), [advised]);
  const counts = useMemo(() => ({
    critical: advised.filter((i) => i.urgency === "critical").length,
    high: advised.filter((i) => i.urgency === "high").length,
    medium: advised.filter((i) => i.urgency === "medium").length,
  }), [advised]);

  const exportCSV = useCallback(() => {
    const header = "Producto,Stock,Ventas 7d,Dias restantes,Cantidad sugerida,Mejor proveedor,Costo unit,Total,Urgencia";
    const rows = advised.map((i) =>
      `"${i.product.name}",${i.product.stock},${i.weeklySales},${i.daysUntilOut === 99 ? "—" : i.daysUntilOut},"${i.suggestedQty} ${i.product.unit ?? "u"}","${i.bestSupplier ?? "-"}","${i.bestCost ? fmt(i.bestCost) : "-"}","${fmt(i.estimatedTotal)}","${URGENCY[i.urgency].label}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lista_compras_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [advised]);

  return (
    <div className="space-y-5">
      {/* Header con KPIs */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-base font-extrabold text-[var(--text-primary)]">
              Lista de compra del día
            </p>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Lo que se va a acabar pronto, ordenado por urgencia
              {usingMock && <span className="ml-2 text-[var(--data-warning-500)]">(datos demo)</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              onClick={fetchAll}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refrescar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { key: "critical", label: "Críticos", value: counts.critical, sub: "Se acaban en 2 días" },
            { key: "high", label: "Urgentes", value: counts.high, sub: "Se acaban esta semana" },
            { key: "medium", label: "Planificar", value: counts.medium, sub: "Próxima compra" },
            { key: "total", label: "Total estimado", value: fmt(totalEstimated), sub: `${advised.length} productos` },
          ] as const).map((k) => {
            const u = k.key !== "total" ? URGENCY[k.key as keyof typeof URGENCY] : null;
            return (
              <div
                key={k.key}
                className={cn(
                  "rounded-xl border p-4 flex flex-col gap-1",
                  u ? `${u.bg} ${u.border}` : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
                )}
              >
                <span className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  u ? u.text : "text-[var(--text-tertiary)]"
                )}>
                  {k.label}
                </span>
                <span className={cn(
                  "text-2xl font-extrabold tabular-nums leading-none",
                  u ? u.text : "text-[var(--text-primary)]"
                )}>
                  {k.value}
                </span>
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {k.sub}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-[var(--surface-sunken)] animate-pulse" />
          ))}
        </div>
      ) : advised.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-12 text-center">
          <Package className="mx-auto mb-3 h-12 w-12 text-[var(--data-success-500)]" />
          <p className="text-base font-extrabold text-[var(--text-primary)]">Stock al día</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            No hay productos que necesiten compra urgente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {advised.map((item) => {
            const u = URGENCY[item.urgency];
            return (
              <div
                key={String(item.product.id)}
                className={cn(
                  "rounded-2xl border bg-white dark:bg-[var(--color-card)] p-4 sm:p-5 flex items-stretch gap-4",
                  u.border,
                )}
              >
                <ProductImage
                  name={item.product.name}
                  imageUrl={item.product.imageUrl ?? item.product.image}
                  size="lg"
                  rounded="xl"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight truncate">
                        {item.product.name}
                      </p>
                      <span className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider",
                        u.bg, u.text,
                      )}>
                        {u.label}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      Stock <span className="font-bold tabular-nums text-[var(--text-primary)]">{item.product.stock}</span> {item.product.unit ?? "u"}
                      {" · "}
                      Vende <span className="font-bold tabular-nums text-[var(--text-primary)]">{item.weeklySales}</span> a la semana
                      {item.daysUntilOut < 99 && (
                        <>
                          {" · "}
                          <span className={cn("font-bold", u.text)}>
                            Se acaba en {item.daysUntilOut} {item.daysUntilOut === 1 ? "día" : "días"}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Barra de urgencia */}
                  <div className={cn("h-2 rounded-full overflow-hidden", u.barTrack)}>
                    <div
                      className={cn("h-full rounded-full", u.bar)}
                      style={{ width: `${Math.max(8, item.fillPct)}%` }}
                    />
                  </div>

                  {item.bestSupplier && (
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      Mejor proveedor:{" "}
                      <span className="font-bold text-[var(--text-primary)]">{item.bestSupplier}</span>
                      {" · "}
                      {fmt(item.bestCost ?? 0)}/u
                    </p>
                  )}
                </div>

                <div className="hidden sm:flex flex-col items-end justify-between text-right shrink-0 gap-2 min-w-[120px]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Comprar
                    </p>
                    <p className="text-2xl font-extrabold tabular-nums leading-none text-[var(--text-primary)]">
                      {item.suggestedQty}
                    </p>
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      {item.product.unit ?? "u"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Total
                    </p>
                    <p className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                      {fmt(item.estimatedTotal)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Footer accion */}
          <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)]" />
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {advised.length} productos · <span className="tabular-nums">{fmt(totalEstimated)}</span>
              </p>
            </div>
            <button
              onClick={() => (window.location.href = "/admin/compras")}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--text-secondary)]"
            >
              <ShoppingCart className="h-4 w-4" />
              Crear orden de compra
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
