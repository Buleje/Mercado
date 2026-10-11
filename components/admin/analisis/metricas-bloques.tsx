"use client";

/**
 * Bloques de Análisis › Métricas con su propia carga: Top 10 clientes,
 * producto estrella, alertas de ventas y enlace a los mejores clientes de Campañas. Salieron tal cual de
 * `AnalyticsBIModule.tsx` (886 líneas) al pasarlo al patrón del panel.
 */

import { DataTable } from "@buleje/design-system";
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import Image from "next/image";
import { Flame } from "@buleje/design-system/icons";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Sale } from "@/types/erp";
import { useReportChartEmpty } from "@/components/admin/shared/ChartManager";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";

const AnomalyDetector = lazy(() => import("@/components/admin/analytics/AnomalyDetector"));

// ── Top 10 Clientes ─────────────────────────────────────────────────────────
export function Top10Clientes({ refreshKey, reportEmpty = true }: { refreshKey: number; reportEmpty?: boolean }) {
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

  // Vacío si no hay clientes o ninguno tiene gasto real → se oculta el gráfico.
  // Solo reporta cuando es slot standalone (en TabbedCard se pasa reportEmpty=false
  // para no ocultar toda la card al cambiar de pestaña).
  const noRealData = customers.every(c => (c.gastoTotal ?? 0) === 0);
  useReportChartEmpty(reportEmpty && noRealData, !loading);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-[var(--surface-sunken)] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

  return (
    <div className="overflow-x-auto">
      {customers.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-8">No hay datos de clientes disponibles</p>
      ) : (
        <DataTable className="w-full">
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th className="text-right">Gasto total</th>
              <th className="text-right hidden sm:table-cell">Compras</th>
              <th className="text-right hidden md:table-cell">Ticket prom</th>
              <th className="text-center">Tendencia</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={c.id || `cust-${i}`} className="cursor-pointer">
                <td className="text-center">
                  {i < 3 ? <span className="text-lg">{medals[i]}</span> : <span className="text-xs font-bold text-[var(--text-tertiary)]">{i + 1}</span>}
                </td>
                <td>
                  <p className="font-medium text-[var(--text-primary)] truncate max-w-50">{c.nombre}</p>
                </td>
                <td className="text-right font-bold text-primary">{formatCurrency(c.gastoTotal)}</td>
                <td className="text-right text-[var(--text-secondary)] hidden sm:table-cell">{c.compras} compras</td>
                <td className="text-right text-[var(--text-secondary)] hidden md:table-cell">{formatCurrency(c.ticketPromedio)}</td>
                <td className="text-center">
                  {c.tendencia > 5 ? (
                    <span className="text-[var(--data-success-500)] text-xs font-bold">&#8593; +{Number(c.tendencia).toFixed(0)}%</span>
                  ) : c.tendencia < -5 ? (
                    <span className="text-[var(--data-error-500)] text-xs font-bold">&#8595; {Number(c.tendencia).toFixed(0)}%</span>
                  ) : (
                    <span className="text-[var(--text-tertiary)] text-xs font-bold">&#8594; Estable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
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

  // StarProductCard SIEMPRE va anidado dentro de un TabbedCard, así que NO
  // reporta vacío (ocultaría toda la card incluyendo la otra pestaña). Conserva
  // su propio mensaje "Aun no hay ventas esta semana".

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
      <div>
        <p className="text-sm font-semibold text-[var(--text-secondary)] flex items-center gap-2">
          <Flame className="h-4 w-4 text-secondary" /> Producto Estrella
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-2">Aun no hay ventas esta semana</p>
      </div>
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
            <span className="text-xs font-bold text-secondary bg-secondary/15 px-2.5 py-0.5 rounded-full">
              Mas vendido
            </span>
          </div>
          <p className="text-lg font-extrabold text-[var(--text-primary)] truncate">{star.name}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-sm text-[var(--text-secondary)]">{star.qty} unidades esta semana</span>
            <span className="text-sm font-bold text-primary">S/{formatNumber(Number(star.revenue), { max: 0 })}</span>
            {star.trend !== 0 && (
              <span className={`text-xs font-bold ${star.trend > 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"}`}>
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
      <div className="text-center py-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-[var(--data-success-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">Sin anomalias — Todo marcha bien</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<S />}>
      <AnomalyDetector sales={sales} orders={orders} />
    </Suspense>
  );
}

// ── Segmentos RFM: una sola regla, la de Campañas › Mejores clientes ────────
// Antes se recalculaba acá con otros cortes y nombres en inglés (Champions,
// At Risk…). Ahora se manda a donde ya vive, con los nombres en español.
export function MejoresClientesEnlace() {
  return (
    <div className="flex flex-col items-start gap-1 py-6 text-sm text-[var(--text-secondary)]">
      <p>Los segmentos por cómo compra cada cliente (los mejores, fieles, en riesgo, dormidos) viven en Campañas, con qué hacer con cada grupo.</p>
      <EnlacePanel href="/admin?tab=campanas&vista=rfm">Ver Mejores clientes en Campañas</EnlacePanel>
    </div>
  );
}
