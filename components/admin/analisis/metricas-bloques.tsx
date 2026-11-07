"use client";

/**
 * Bloques de Análisis › Métricas con su propia carga: Top 10 clientes,
 * producto estrella y alertas de ventas. Salieron tal cual de
 * `AnalyticsBIModule.tsx` (886 líneas) al pasarlo al patrón del panel.
 * Sin datos, cada uno muestra el estado vacío del panel (`VacioMetricas`); el
 * enlace a los segmentos de Campañas pasó al «Más» de la cabecera (11-10).
 */

import { DataTable } from "@buleje/design-system";
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import Image from "next/image";
import { Flame, Trophy, TrendingUp } from "@buleje/design-system/icons";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Sale } from "@/types/erp";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { VacioMetricas } from "@/components/admin/analisis/metricas-tarjetas";

const AnomalyDetector = lazy(() => import("@/components/admin/analytics/AnomalyDetector"));

// ── Top 10 Clientes ─────────────────────────────────────────────────────────
export function Top10Clientes({ refreshKey }: { refreshKey: number }) {
  const [customers, setCustomers] = useState<Array<{
    id: string; nombre: string; gastoTotal: number; compras: number; ticketPromedio: number; tendencia: number;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/customers?sort=totalSpent&limit=10", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const list = (Array.isArray(data) ? data : data.customers ?? data.data ?? []).slice(0, 10);
          setCustomers(list.map((c: Record<string, unknown>) => ({
            id: String(c.id ?? ""),
            nombre: String(c.name ?? c.nombre ?? c.customerName ?? "Cliente"),
            gastoTotal: Number(c.totalSpent ?? c.gastoTotal ?? c.total ?? 0),
            compras: Number(c.orderCount ?? c.compras ?? c.totalOrders ?? 0),
            ticketPromedio: Number(c.avgTicket ?? c.ticketPromedio ?? 0) || (Number(c.totalSpent ?? 0) / Math.max(1, Number(c.orderCount ?? 1))),
            tendencia: Number(c.trend ?? c.tendencia ?? 0),
          })));
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [refreshKey]);

  // Vacío si no hay clientes o ninguno tiene gasto real.
  const noRealData = customers.every(c => (c.gastoTotal ?? 0) === 0);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-[var(--surface-sunken)] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (noRealData) {
    return (
      <VacioMetricas
        icono={Trophy}
        titulo="Todavía no hay clientes con compras"
        descripcion="Cuando registres ventas a nombre de un cliente, aquí aparecen los que más te compran."
      />
    );
  }

  return (
    <DataTable>
      <thead>
        <tr>
          <th className="w-12 text-center">#</th>
          <th>Cliente</th>
          <th className="text-right">Gasto total</th>
          <th className="hidden text-right sm:table-cell">Compras</th>
          <th className="hidden text-right md:table-cell">Ticket promedio</th>
          <th className="text-center">Tendencia</th>
        </tr>
      </thead>
      <tbody>
        {customers.map((c, i) => (
          <tr key={c.id || `cust-${i}`}>
            <td className="text-center font-bold text-[var(--text-secondary)]">{i + 1}</td>
            <td className="max-w-50 truncate font-medium">{c.nombre}</td>
            <td className="text-right font-bold">{formatCurrency(c.gastoTotal)}</td>
            <td className="hidden text-right text-[var(--text-secondary)] sm:table-cell">{c.compras}</td>
            <td className="hidden text-right text-[var(--text-secondary)] md:table-cell">{formatCurrency(c.ticketPromedio)}</td>
            <td className="whitespace-nowrap text-center font-semibold">
              {c.tendencia > 5 ? (
                <span className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">↑ +{Number(c.tendencia).toFixed(0)} %</span>
              ) : c.tendencia < -5 ? (
                <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">↓ {Number(c.tendencia).toFixed(0)} %</span>
              ) : (
                <span className="text-[var(--text-secondary)]">→ Estable</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

// ── Star Product of the Week ─────────────────────────────────────────────────
export function StarProductCard({ refreshKey }: { refreshKey: number }) {
  const [star, setStar] = useState<{
    name: string; qty: number; revenue: number; trend: number; imageUrl?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/sales?limit=500", { credentials: "include" });
        if (!res.ok) return;
        const raw = await res.json();
        const sales = Array.isArray(raw) ? raw : raw.sales ?? [];
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
        const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

        const thisWeek: Record<string, { name: string; qty: number; revenue: number; imageUrl?: string }> = {};
        const lastWeek: Record<string, { qty: number }> = {};

        for (const s of sales) {
          const d = (s.createdAt ?? "").slice(0, 10);
          const items = s.items ?? [];
          for (const i of items) {
            const pid = String(i.productId ?? i.name ?? "?");
            if (d >= weekAgo) {
              if (!thisWeek[pid]) thisWeek[pid] = { name: i.name ?? "Producto", qty: 0, revenue: 0, imageUrl: i.imageUrl };
              thisWeek[pid].qty += i.quantity ?? 1;
              thisWeek[pid].revenue += (i.price ?? 0) * (i.quantity ?? 1);
            } else if (d >= twoWeekAgo && d < weekAgo) {
              if (!lastWeek[pid]) lastWeek[pid] = { qty: 0 };
              lastWeek[pid].qty += i.quantity ?? 1;
            }
          }
        }

        const top = Object.entries(thisWeek).sort((a, b) => b[1].qty - a[1].qty)[0];
        if (top) {
          const [pid, data] = top;
          const lastQty = lastWeek[pid]?.qty ?? 0;
          const trend = lastQty > 0 ? ((data.qty - lastQty) / lastQty) * 100 : 0;
          setStar({ name: data.name, qty: data.qty, revenue: data.revenue, trend, imageUrl: data.imageUrl });
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-5 w-40 bg-[var(--rule-base)] rounded mb-4" />
        <div className="h-8 w-56 bg-[var(--rule-base)] rounded" />
      </div>
    );
  }

  if (!star) {
    return (
      <VacioMetricas
        icono={Flame}
        titulo="Sin ventas en caja estos 7 días"
        descripcion="El producto estrella es el que más unidades vendes en la semana; aparece con tu primera venta."
      />
    );
  }

  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-4 border border-[var(--rule-base)]">
      <div className="flex items-start gap-3">
        {star.imageUrl && (
          <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-[var(--surface-raised)] shrink-0 border border-[var(--rule-base)]">
            <Image src={star.imageUrl} alt={star.name} fill className="object-cover" sizes="64px" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
              Más vendido
            </span>
          </div>
          <p className="text-lg font-extrabold text-[var(--text-primary)] truncate">{star.name}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-sm text-[var(--text-secondary)]">{star.qty} unidades esta semana</span>
            <span className="text-sm font-bold text-primary">S/{formatNumber(Number(star.revenue), { max: 0 })}</span>
            {star.trend !== 0 && (
              <span className={`text-sm font-bold ${star.trend > 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"}`}>
                {star.trend > 0 ? "\u2191" : "\u2193"} {star.trend > 0 ? "+" : ""}{Number(star.trend).toFixed(0)}% vs sem. pasada
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AnomalyDetectorWrapper — fetches data for AnomalyDetector ────────────────
export function AnomalyDetectorWrapper({ refreshKey }: { refreshKey: number }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<Array<{ id: string; status: string; total: number; createdAt: string; items?: Array<{ productId?: string | number; name?: string; quantity: number; price: number }> }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRaw, ordersRaw] = await Promise.all([
        fetch("/api/sales?limit=500", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/orders?limit=500", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setSales(Array.isArray(salesRaw) ? salesRaw : salesRaw.sales ?? []);
      setOrders(Array.isArray(ordersRaw) ? ordersRaw : ordersRaw.orders ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  if (loading) return <S />;

  if (sales.length === 0 && orders.length === 0) {
    return (
      <VacioMetricas
        icono={TrendingUp}
        titulo="Todavía no hay ventas que comparar"
        descripcion="Con 10 días de ventas te avisamos cuando un día se sale de lo normal."
      />
    );
  }

  return (
    <Suspense fallback={<S />}>
      <AnomalyDetector sales={sales} orders={orders} />
    </Suspense>
  );
}
