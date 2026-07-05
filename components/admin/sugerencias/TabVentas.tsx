"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { TrendingUp, TrendingDown, Tag, Megaphone, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ProductImage from "./ProductImage";
import { normalizeProducts, aggregateSalesByProduct, isoDaysAgo } from "./normalize";

interface Product {
  id: string | number;
  name: string;
  stock: number;
  price: number;
  cost?: number;
  imageUrl?: string;
  image?: string;
}

interface SaleData {
  productId: string | number;
  quantity: number;
}

interface MoverItem {
  product: Product;
  weeklySales: number;
  weeklyRevenue: number;
  marginPct: number;
}

const MOCK_PRODS: Product[] = [
  { id: "1", name: "Inca Kola 2L", stock: 4, price: 6.5, cost: 4.8 },
  { id: "2", name: "Galletas Soda Field", stock: 22, price: 1.5, cost: 0.9 },
  { id: "3", name: "Arroz Costeño 5kg", stock: 3, price: 19, cost: 14 },
  { id: "4", name: "Aceite Primor 1L", stock: 1, price: 8.5, cost: 6.2 },
  { id: "5", name: "Detergente Ariel 360g", stock: 35, price: 4.2, cost: 3.5 },
  { id: "6", name: "Atún Florida 170g", stock: 50, price: 5.5, cost: 4.7 },
  { id: "7", name: "Chocolate Sublime", stock: 60, price: 1.8, cost: 1.2 },
  { id: "8", name: "Pan integral 500g", stock: 28, price: 6, cost: 4.5 },
];

const MOCK_SALES: SaleData[] = [
  { productId: "1", quantity: 22 },
  { productId: "2", quantity: 18 },
  { productId: "3", quantity: 14 },
  { productId: "4", quantity: 9 },
  { productId: "5", quantity: 1 },
  { productId: "6", quantity: 0 },
  { productId: "7", quantity: 11 },
  { productId: "8", quantity: 2 },
];

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TabVentas() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, sr] = await Promise.all([
        fetch("/api/products?active=true&limit=200", { cache: "no-store" }),
        fetch(`/api/sales?from=${isoDaysAgo(7)}`, { cache: "no-store" }),
      ]);
      let failed = false;
      if (pr.ok) setProducts(normalizeProducts(await pr.json())); else failed = true;
      if (sr.ok) setSales(aggregateSalesByProduct(await sr.json())); else failed = true;
      if (failed) throw new Error("partial");
    } catch {
      setProducts(MOCK_PRODS);
      setSales(MOCK_SALES);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo<MoverItem[]>(() => {
    const map: Record<string, number> = {};
    sales.forEach((s) => { map[String(s.productId)] = s.quantity; });
    return products.map((p) => {
      const weekly = map[String(p.id)] ?? 0;
      const revenue = weekly * p.price;
      const margin = p.cost ? ((p.price - p.cost) / p.price) * 100 : 0;
      return { product: p, weeklySales: weekly, weeklyRevenue: revenue, marginPct: Math.round(margin) };
    });
  }, [products, sales]);

  const topMovers = useMemo(
    () => items.filter((i) => i.weeklySales > 0).sort((a, b) => b.weeklyRevenue - a.weeklyRevenue).slice(0, 5),
    [items]
  );
  const slowMovers = useMemo(
    () => items.filter((i) => i.product.stock > 5).sort((a, b) => a.weeklySales - b.weeklySales).slice(0, 5),
    [items]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-extrabold text-[var(--text-primary)]">Estrategia de venta</p>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Qué impulsar y qué mover de stock
            {usingMock && <span className="ml-2 text-[var(--data-warning-500)]">(datos demo)</span>}
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top movers — promocionar */}
        <section className="rounded-2xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-5">
          <header className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)]">
              <TrendingUp className="h-5 w-5 text-[var(--data-success-500)]" />
            </span>
            <div>
              <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                Lo que más se vende
              </p>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Promocionar y subir vitrina
              </p>
            </div>
          </header>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
              ))}
            </div>
          ) : topMovers.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
              Aún no hay ventas suficientes esta semana.
            </p>
          ) : (
            <ul className="space-y-2">
              {topMovers.map((i, idx) => (
                <li
                  key={String(i.product.id)}
                  className="flex items-center gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3"
                >
                  <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--text-primary)] text-white text-xs font-extrabold tabular-nums">
                    {idx + 1}
                  </span>
                  <ProductImage name={i.product.name} imageUrl={i.product.imageUrl ?? i.product.image} size="sm" rounded="lg" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">{i.product.name}</p>
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      <span className="font-bold tabular-nums text-[var(--text-primary)]">{i.weeklySales}</span> vendidos
                      {" · "}
                      Margen <span className="font-bold tabular-nums text-[var(--data-success-500)]">{i.marginPct}%</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{fmt(i.weeklyRevenue)}</p>
                    <button className="mt-0.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-[var(--data-success-500)] hover:bg-[var(--accent-soft)]">
                      <Megaphone className="h-3 w-3" />
                      Promocionar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Slow movers — descontar */}
        <section className="rounded-2xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-5">
          <header className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--data-warning-50,#fffbeb)]">
              <TrendingDown className="h-5 w-5 text-[var(--data-warning-500)]" />
            </span>
            <div>
              <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                Lo que no se está moviendo
              </p>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Bajar precio o sacar a vitrina
              </p>
            </div>
          </header>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
              ))}
            </div>
          ) : slowMovers.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
              Todo se está vendiendo bien.
            </p>
          ) : (
            <ul className="space-y-2">
              {slowMovers.map((i) => {
                const suggestedDiscount = i.weeklySales === 0 ? 20 : 10;
                const newPrice = i.product.price * (1 - suggestedDiscount / 100);
                return (
                  <li
                    key={String(i.product.id)}
                    className="flex items-center gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3"
                  >
                    <ProductImage name={i.product.name} imageUrl={i.product.imageUrl ?? i.product.image} size="sm" rounded="lg" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">{i.product.name}</p>
                      <p className="text-xs font-medium text-[var(--text-secondary)]">
                        Stock <span className="font-bold tabular-nums text-[var(--text-primary)]">{i.product.stock}</span>
                        {" · "}
                        <span className={cn("font-bold tabular-nums", i.weeklySales === 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-warning-500)]")}>
                          {i.weeklySales} vendidos
                        </span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Sugerido -{suggestedDiscount}%
                      </p>
                      <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                        {fmt(newPrice)}
                      </p>
                      <button className="mt-0.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-[var(--data-warning-500)] hover:bg-[var(--data-warning-50,#fffbeb)]">
                        <Tag className="h-3 w-3" />
                        Bajar precio
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
