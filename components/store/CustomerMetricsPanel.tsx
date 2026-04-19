"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  TrendingUp, ShoppingBag, Award, Tag, Star,
  Package, RefreshCw, Trophy, Zap, Heart,
} from "@buleje/design-system/icons";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type MonthlySpend = { month: string; amount: number };

type FavoriteProduct = {
  productId: number;
  name: string;
  image: string;
  count: number;
  totalSpent: number;
};

type Badge = {
  id: string;
  label: string;
  description: string;
  earned: boolean;
  icon: typeof Trophy;
  color: string;
};

type MetricsData = {
  totalSpent: number;
  orderCount: number;
  loyaltyPoints: number;
  loyaltyTier: string;
  couponSavings: number;
  monthlySpend: MonthlySpend[];
  favoriteProducts: FavoriteProduct[];
};

/* ── Helpers ────────────────────────────────────────────────────────────────── */

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  bronce:   { label: "Bronce",   color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-50 dark:bg-amber-900/20",   border: "border-amber-200 dark:border-amber-700" },
  plata:    { label: "Plata",    color: "text-[var(--text-secondary)]",     bg: "bg-[var(--surface-sunken)]",         border: "border-[var(--rule-base)] dark:border-gray-600" },
  oro:      { label: "Oro",      color: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-50 dark:bg-yellow-900/20",  border: "border-yellow-200 dark:border-yellow-700" },
  diamante: { label: "Diamante", color: "text-sky-700 dark:text-sky-300",       bg: "bg-sky-50 dark:bg-sky-900/20",        border: "border-sky-200 dark:border-sky-700" },
};

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmt(n: number) { return `S/${n.toFixed(2)}`; }

function getMonthLabel(iso: string) {
  const d = new Date(iso + "-01");
  return MONTH_NAMES[d.getMonth()] ?? iso;
}

/* ── Subcomponents ──────────────────────────────────────────────────────────── */

function KPICard({ icon: Icon, label, value, sub, colorClass }: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4 flex flex-col gap-2">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", colorClass ?? "bg-primary/10")}>
        <Icon className={cn("h-4 w-4", colorClass ? "text-white" : "text-primary")} />
      </div>
      <p className="text-xl font-extrabold text-[var(--text-primary)] leading-none">{value}</p>
      <div>
        <p className="text-xs font-semibold text-[var(--text-tertiary)]">{label}</p>
        {sub && <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function MiniBarChart({ data }: { data: MonthlySpend[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.amount), 1);
  return (
    <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
      <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        Gastos últimos 6 meses
      </h3>
      <div className="flex items-end gap-2 h-24">
        {data.map((d) => {
          const pct = Math.round((d.amount / max) * 100);
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end justify-center" style={{ height: "76px" }}>
                <div
                  className="w-full rounded-t-lg bg-primary/80 dark:bg-primary transition-all duration-[var(--dur-slow)]"
                  style={{ height: `${Math.max(pct, 4)}%` }}
                  title={`${getMonthLabel(d.month)}: ${fmt(d.amount)}`}
                />
              </div>
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-medium">{getMonthLabel(d.month)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FavoritesList({ products }: { products: FavoriteProduct[] }) {
  if (!products.length) return null;
  return (
    <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
      <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
        <Heart className="h-4 w-4 text-[var(--text-secondary)]" />
        Tus productos favoritos
      </h3>
      <div className="space-y-2">
        {products.map((p, i) => (
          <div key={p.productId} className="flex items-center gap-3 py-1.5">
            <span className="text-xs font-bold text-[var(--text-tertiary)] w-4 text-center">{i + 1}</span>
            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-[var(--surface-sunken)] shrink-0">
              {p.image ? (
                <Image src={p.image} alt={p.name} fill className="object-cover" sizes="40px" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-4 w-4 text-gray-400" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{p.name}</p>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{p.count} veces · {fmt(p.totalSpent)}</p>
            </div>
            <div className="shrink-0">
              <span className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-full px-2 py-0.5">
                <Star className="h-2.5 w-2.5" />
                x{p.count}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BadgesSection({ orderCount, totalSpent, hasCouponSavings }: {
  orderCount: number;
  totalSpent: number;
  hasCouponSavings: boolean;
}) {
  const badges: Badge[] = [
    {
      id: "primera_compra",
      label: "Primera compra",
      description: "Realizaste tu primer pedido",
      earned: orderCount >= 1,
      icon: Zap,
      color: "bg-emerald-500",
    },
    {
      id: "cliente_frecuente",
      label: "Cliente frecuente",
      description: "10 o mas pedidos completados",
      earned: orderCount >= 10,
      icon: Trophy,
      color: "bg-amber-500",
    },
    {
      id: "compra_grande",
      label: "Compra grande",
      description: "Un pedido mayor a S/ 100",
      earned: totalSpent > 0,  // API retorna si tuvo pedido > 100
      icon: ShoppingBag,
      color: "bg-emerald-500",
    },
    {
      id: "ahorro_cupones",
      label: "Cazador de ofertas",
      description: "Usaste un cupon de descuento",
      earned: hasCouponSavings,
      icon: Tag,
      color: "bg-[var(--text-primary)]",
    },
  ];

  return (
    <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
      <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
        <Award className="h-4 w-4 text-primary" />
        Tus logros
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {badges.map((b) => {
          const Icon = b.icon;
          return (
            <div
              key={b.id}
              className={cn(
                "rounded-xl p-3 border transition-all",
                b.earned
                  ? "border-[var(--rule-base)] bg-[var(--surface-sunken)]/50"
                  : "border-dashed border-[var(--rule-base)] opacity-40 grayscale",
              )}
            >
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", b.earned ? b.color : "bg-gray-300 dark:bg-gray-700")}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">{b.label}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 leading-snug">{b.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────────── */

export default function CustomerMetricsPanel({ phone }: { phone: string }) {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!phone) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        // Construye metricas a partir de los endpoints públicos del cliente
        const [ordersRes, loyaltyRes] = await Promise.all([
          fetch(`/api/customers/${encodeURIComponent(phone)}/orders`),
          fetch(`/api/loyalty/${encodeURIComponent(phone)}`),
        ]);

        if (!ordersRes.ok) throw new Error("Sin datos");

        const orders: Array<{
          id: string; total?: number; status: string; items?: Array<{ productId?: number; name: string; price?: number; image: string; quantity: number }>;
          couponCode?: string; couponDiscount?: number; createdAt: string;
        }> = await ordersRes.json();

        const loyalty = loyaltyRes.ok ? await loyaltyRes.json() : {};

        // Calcular metricas
        const completed = orders.filter(o => o.status !== "cancelado");
        const totalSpent = completed.reduce((s, o) => s + (o.total ?? 0), 0);
        const couponSavings = completed.reduce((s, o) => s + (o.couponDiscount ?? 0), 0);

        // Favoritos: contar ocurrencias por productId
        const productMap = new Map<number, { name: string; image: string; count: number; totalSpent: number }>();
        for (const order of completed) {
          for (const item of (order.items ?? [])) {
            if (!item.productId) continue;
            const prev = productMap.get(item.productId) ?? { name: item.name, image: item.image, count: 0, totalSpent: 0 };
            productMap.set(item.productId, {
              name: item.name,
              image: item.image,
              count: prev.count + item.quantity,
              totalSpent: prev.totalSpent + ((item.price ?? 0) * item.quantity),
            });
          }
        }
        const favoriteProducts: FavoriteProduct[] = Array.from(productMap.entries())
          .map(([productId, d]) => ({ productId, ...d }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // Gastos por mes — últimos 6 meses
        const now = new Date();
        const monthMap = new Map<string, number>();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          monthMap.set(key, 0);
        }
        for (const order of completed) {
          const d = new Date(order.createdAt);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (monthMap.has(key)) {
            monthMap.set(key, (monthMap.get(key) ?? 0) + (order.total ?? 0));
          }
        }
        const monthlySpend: MonthlySpend[] = Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount }));

        if (!cancelled) {
          setData({
            totalSpent,
            orderCount: completed.length,
            loyaltyPoints: loyalty?.loyaltyPoints ?? 0,
            loyaltyTier: loyalty?.loyaltyTier ?? "bronce",
            couponSavings,
            monthlySpend,
            favoriteProducts,
          });
        }
      } catch {
        if (!cancelled) setError("No se pudieron cargar tus metricas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [phone]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-[var(--surface-sunken)] rounded-2xl" />
          ))}
        </div>
        <div className="h-36 bg-[var(--surface-sunken)] rounded-2xl" />
        <div className="h-48 bg-[var(--surface-sunken)] rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-6 text-center">
        <RefreshCw className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
        <p className="text-sm text-[var(--text-tertiary)]">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const tierCfg = TIER_CONFIG[data.loyaltyTier.toLowerCase()] ?? TIER_CONFIG.bronce;

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard icon={ShoppingBag}  label="Total gastado"       value={fmt(data.totalSpent)}    sub="en todos los pedidos" />
        <KPICard icon={Package}      label="Pedidos realizados"  value={String(data.orderCount)} sub="sin cancelados" />
        <KPICard icon={Award}        label="Puntos acumulados"   value={String(data.loyaltyPoints)} sub="puntos Buleje" />
        <KPICard icon={Tag}          label="Ahorro con cupones"  value={fmt(data.couponSavings)} sub="descuentos aplicados" />
      </div>

      {/* Tier actual */}
      <div className={cn("rounded-2xl border px-4 py-3 flex items-center gap-3", tierCfg.bg, tierCfg.border)}>
        <div className="w-10 h-10 rounded-xl bg-white/60 dark:bg-black/20 flex items-center justify-center shrink-0">
          <Trophy className={cn("h-5 w-5", tierCfg.color)} />
        </div>
        <div>
          <p className={cn("text-sm font-extrabold", tierCfg.color)}>Nivel {tierCfg.label}</p>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">Sigue comprando para subir de nivel</p>
        </div>
      </div>

      {/* Grafico de gastos mensuales */}
      <MiniBarChart data={data.monthlySpend} />

      {/* Productos favoritos */}
      <FavoritesList products={data.favoriteProducts} />

      {/* Badges */}
      <BadgesSection
        orderCount={data.orderCount}
        totalSpent={data.totalSpent}
        hasCouponSavings={data.couponSavings > 0}
      />
    </div>
  );
}
