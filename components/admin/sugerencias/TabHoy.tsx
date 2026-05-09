"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GitMerge,
  ShoppingCart,
  Megaphone,
  ArrowRight,
  Sparkles,
  TrendingUp,
  AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ProductImage from "./ProductImage";

interface SaleItem {
  productId?: string | number;
  name?: string;
  price?: number;
  quantity?: number;
  imageUrl?: string;
  image?: string;
}

interface SaleRecord {
  items?: SaleItem[];
}

interface DailySnapshot {
  bestCombo: { a: string; b: string; count: number; priceA: number; priceB: number; imageA?: string; imageB?: string } | null;
  urgentBuy: { name: string; stock: number; daysLeft: number; imageUrl?: string } | null;
  topMover: { name: string; weeklySales: number; revenue: number; imageUrl?: string } | null;
}

const MOCK: DailySnapshot = {
  bestCombo: {
    a: "Inca Kola 2L",
    b: "Galletas Soda Field",
    count: 18,
    priceA: 6.5,
    priceB: 1.5,
  },
  urgentBuy: {
    name: "Aceite Primor 1L",
    stock: 1,
    daysLeft: 1,
  },
  topMover: {
    name: "Inca Kola 2L",
    weeklySales: 22,
    revenue: 143,
  },
};

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildSnapshot(sales: SaleRecord[]): DailySnapshot {
  const co: Record<string, { count: number; pa: number; pb: number; ia?: string; ib?: string }> = {};
  const productSales: Record<string, { qty: number; rev: number; image?: string }> = {};

  for (const sale of sales) {
    const items = (sale.items ?? []).filter((i) => (i.name ?? "").trim());
    for (const it of items) {
      const k = it.name!;
      const prev = productSales[k] ?? { qty: 0, rev: 0 };
      productSales[k] = {
        qty: prev.qty + (it.quantity ?? 1),
        rev: prev.rev + (it.price ?? 0) * (it.quantity ?? 1),
        image: prev.image ?? it.imageUrl ?? it.image,
      };
    }
    if (items.length < 2) continue;
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const sorted = [
          { name: items[a].name!, price: items[a].price ?? 0, image: items[a].imageUrl ?? items[a].image },
          { name: items[b].name!, price: items[b].price ?? 0, image: items[b].imageUrl ?? items[b].image },
        ].sort((x, y) => x.name.localeCompare(y.name));
        const key = `${sorted[0].name}|||${sorted[1].name}`;
        const prev = co[key];
        co[key] = {
          count: (prev?.count ?? 0) + 1,
          pa: sorted[0].price || prev?.pa || 0,
          pb: sorted[1].price || prev?.pb || 0,
          ia: prev?.ia ?? sorted[0].image,
          ib: prev?.ib ?? sorted[1].image,
        };
      }
    }
  }

  const topComboEntry = Object.entries(co).sort((x, y) => y[1].count - x[1].count)[0];
  const topMoverEntry = Object.entries(productSales).sort((x, y) => y[1].rev - x[1].rev)[0];

  return {
    bestCombo: topComboEntry
      ? (() => {
          const [k, v] = topComboEntry;
          const [a, b] = k.split("|||");
          return { a, b, count: v.count, priceA: v.pa, priceB: v.pb, imageA: v.ia, imageB: v.ib };
        })()
      : null,
    urgentBuy: null,
    topMover: topMoverEntry
      ? (() => {
          const [name, v] = topMoverEntry;
          return { name, weeklySales: v.qty, revenue: v.rev, imageUrl: v.image };
        })()
      : null,
  };
}

interface Props {
  onTabChange: (tab: string) => void;
}

export default function TabHoy({ onTabChange }: Props) {
  const [snapshot, setSnapshot] = useState<DailySnapshot>(MOCK);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRes, prodRes] = await Promise.all([
        fetch("/api/sales?limit=200"),
        fetch("/api/products?active=true&limit=200", { cache: "no-store" }),
      ]);

      let snap: DailySnapshot = { bestCombo: null, urgentBuy: null, topMover: null };

      if (salesRes.ok) {
        const sales = await salesRes.json();
        snap = buildSnapshot(Array.isArray(sales) ? sales : []);
      }

      if (prodRes.ok) {
        const data = await prodRes.json();
        const prods = (data.products ?? []) as Array<{ name: string; stock?: number; stockMin?: number; imageUrl?: string; image?: string }>;
        const urgent = prods
          .filter((p) => (p.stock ?? 0) < (p.stockMin ?? 0))
          .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0))[0];
        if (urgent) {
          snap.urgentBuy = {
            name: urgent.name,
            stock: urgent.stock ?? 0,
            daysLeft: Math.max(0, Math.floor((urgent.stock ?? 0) / 2)),
            imageUrl: urgent.imageUrl ?? urgent.image,
          };
        }
      }

      if (!snap.bestCombo && !snap.urgentBuy && !snap.topMover) {
        setSnapshot(MOCK);
        setUsingMock(true);
      } else {
        setSnapshot(snap);
        setUsingMock(false);
      }
    } catch {
      setSnapshot(MOCK);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    {
      key: "combo",
      tab: "combos",
      icon: GitMerge,
      label: "Combo del día",
      sub: "Combinarlos puede mejorar el ticket",
      accent: "var(--data-success)",
      data: snapshot.bestCombo,
      render: () =>
        snapshot.bestCombo && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <ProductImage name={snapshot.bestCombo.a} imageUrl={snapshot.bestCombo.imageA} size="md" rounded="xl" />
                <span className="text-xs font-bold text-center text-[var(--text-secondary)] line-clamp-1 max-w-[80px]">
                  {snapshot.bestCombo.a}
                </span>
              </div>
              <span className="text-2xl font-extrabold text-[var(--text-tertiary)]">+</span>
              <div className="flex flex-col items-center gap-1">
                <ProductImage name={snapshot.bestCombo.b} imageUrl={snapshot.bestCombo.imageB} size="md" rounded="xl" />
                <span className="text-xs font-bold text-center text-[var(--text-secondary)] line-clamp-1 max-w-[80px]">
                  {snapshot.bestCombo.b}
                </span>
              </div>
            </div>
            <div className="text-center pt-1">
              <p className="text-3xl font-extrabold tabular-nums leading-none text-[var(--text-primary)]">
                {snapshot.bestCombo.count}<span className="text-base font-bold text-[var(--text-tertiary)]">{snapshot.bestCombo.count === 1 ? " vez" : " veces"}</span>
              </p>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mt-1">
                Vendidos juntos
              </p>
            </div>
          </div>
        ),
    },
    {
      key: "buy",
      tab: "compras",
      icon: ShoppingCart,
      label: "Comprar urgente",
      sub: "Stock crítico, se agota pronto",
      accent: "var(--data-error)",
      data: snapshot.urgentBuy,
      render: () =>
        snapshot.urgentBuy && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <ProductImage name={snapshot.urgentBuy.name} imageUrl={snapshot.urgentBuy.imageUrl} size="lg" rounded="xl" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-[var(--text-primary)] line-clamp-2 leading-tight px-2">
                {snapshot.urgentBuy.name}
              </p>
              <div className="mt-3 flex items-baseline justify-center gap-2">
                <p className="text-3xl font-extrabold tabular-nums leading-none text-[var(--data-error-500)]">
                  {snapshot.urgentBuy.stock}
                </p>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {snapshot.urgentBuy.stock === 1 ? "unidad" : "unidades"}
                </p>
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--data-error-500)] mt-1">
                {snapshot.urgentBuy.daysLeft === 0
                  ? "Sin stock"
                  : snapshot.urgentBuy.daysLeft === 1
                    ? "1 día restante"
                    : `${snapshot.urgentBuy.daysLeft} días restantes`}
              </p>
            </div>
          </div>
        ),
    },
    {
      key: "promo",
      tab: "ventas",
      icon: Megaphone,
      label: "Estrella de la semana",
      sub: "El que más ingreso genera",
      accent: "var(--text-primary)",
      data: snapshot.topMover,
      render: () =>
        snapshot.topMover && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <ProductImage name={snapshot.topMover.name} imageUrl={snapshot.topMover.imageUrl} size="lg" rounded="xl" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-[var(--text-primary)] line-clamp-2 leading-tight px-2">
                {snapshot.topMover.name}
              </p>
              <div className="mt-3">
                <p className="text-3xl font-extrabold tabular-nums leading-none text-[var(--text-primary)]">
                  {fmt(snapshot.topMover.revenue)}
                </p>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mt-1">
                  esta semana ({snapshot.topMover.weeklySales} {snapshot.topMover.weeklySales === 1 ? "unidad" : "unidades"})
                </p>
              </div>
            </div>
          </div>
        ),
    },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-linear-to-br from-white to-[var(--surface-sunken)] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--text-primary)]">
            <Sparkles className="h-5 w-5 text-white" />
          </span>
          <div className="flex-1">
            <p className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] leading-tight">
              Las 3 acciones más rentables hoy
            </p>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mt-0.5">
              {usingMock ? "Datos demo · conecta más ventas para datos reales" : "Calculado de tus ventas reales"}
            </p>
          </div>
        </div>
      </div>

      {/* 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => onTabChange(c.tab)}
              disabled={loading}
              className={cn(
                "group rounded-2xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-5 text-left transition-shadow hover:shadow-md disabled:opacity-50",
                "flex flex-col gap-4",
              )}
              style={{ ["--card-accent" as string]: c.accent }}
            >
              <header className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: `color-mix(in oklab, var(--card-accent) 12%, white)`,
                      color: "var(--card-accent)",
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">
                      {c.label}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      {c.sub}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors" />
              </header>

              <div className="flex-1 flex items-center justify-center min-h-[180px]">
                {loading ? (
                  <div className="space-y-2 w-full">
                    <div className="h-24 rounded-xl bg-[var(--surface-sunken)] animate-pulse mx-auto w-24" />
                    <div className="h-3 w-2/3 rounded bg-[var(--surface-sunken)] animate-pulse mx-auto" />
                    <div className="h-6 w-1/2 rounded bg-[var(--surface-sunken)] animate-pulse mx-auto" />
                  </div>
                ) : c.data ? (
                  c.render()
                ) : (
                  <div className="text-center">
                    <AlertCircle className="mx-auto h-8 w-8 text-[var(--text-tertiary)] mb-2" />
                    <p className="text-xs font-medium text-[var(--text-secondary)]">Sin datos suficientes aún</p>
                  </div>
                )}
              </div>

              {!loading && c.data && (
                <footer className="flex items-center justify-between border-t border-[var(--rule-soft)] pt-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Ver detalle
                  </span>
                  <TrendingUp className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                </footer>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
