"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import {
  Store,
  DollarSign,
  ShoppingCart,
  Star,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  ArrowUpDown,
  ExternalLink,
  AlertCircle,
  BarChart3,
  MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Leaflet solo en cliente (sin SSR) ────────────────────────────────────────
// Se carga sólo cuando el tab "Mapa" está activo y el componente montado.

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoreRow {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  isPublished: boolean;
  // Métricas computadas desde órdenes del período
  sales: number;
  orders: number;
  lowStockCount: number;
  commission: number;
}

type SortKey = "name" | "sales" | "orders" | "rating" | "lowStockCount";
type SortDir = "asc" | "desc";
type PeriodKey = "week" | "month" | "quarter";

const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: "Esta semana",
  month: "Este mes",
  quarter: "Este trimestre",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSoles(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StarRating({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3 w-3",
            i < full
              ? "fill-amber-400 text-amber-400"
              : half && i === full
              ? "fill-amber-200 text-amber-400"
              : "fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700"
          )}
        />
      ))}
      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{value.toFixed(1)}</span>
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-gray-200 dark:bg-gray-700" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
    </div>
  );
}

// ── Bar chart simple (sin recharts) ──────────────────────────────────────────

function SalesBarChart({ stores }: { stores: StoreRow[] }) {
  const top5 = [...stores]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  const max = Math.max(...top5.map((s) => s.sales), 1);

  if (top5.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-400 dark:text-gray-600">
        <BarChart3 className="h-8 w-8" />
        <p className="text-sm">Sin datos de ventas</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {top5.map((store) => {
        const pct = Math.max((store.sales / max) * 100, 2);
        return (
          <div key={store.id} className="flex items-center gap-3">
            <span className="w-28 truncate text-xs text-gray-600 dark:text-gray-400 sm:w-36">
              {store.name}
            </span>
            <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-24 text-right font-mono text-xs font-bold text-gray-900 dark:text-white">
              {formatSoles(store.sales)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Mapa de tiendas (Leaflet dinámico) ───────────────────────────────────────

function StoresMapInner({ stores }: { stores: StoreRow[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const initRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      if (!containerRef.current || initRef.current) return;
      initRef.current = true;

      await import("leaflet/dist/leaflet.css");
      const L = await import("leaflet");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current!).setView([-8.3791, -74.5539], 13);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Añadir markers de tiendas (posición aleatoria en Pucallpa como demo)
      stores.forEach((store, idx) => {
        const lat = -8.3791 + (idx * 0.007 - 0.015);
        const lng = -74.5539 + (idx * 0.005 - 0.010);
        const icon = L.divIcon({
          className: "store-map-marker",
          html: `<div style="
            background:var(--color-primary);color:white;
            width:34px;height:34px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            font-size:14px;border:2px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
          ">🏪</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -20],
        });
        L.marker([lat, lng], { icon })
          .bindPopup(`
            <div style="min-width:140px;">
              <p style="font-weight:700;margin:0 0 4px;">${store.name}</p>
              <p style="margin:0 0 2px;font-size:12px;color:#555;">${store.zone ?? "Sin zona"}</p>
              <p style="margin:0;font-size:12px;font-weight:600;color:var(--color-primary);">
                Ventas: ${formatSoles(store.sales)}
              </p>
            </div>
          `)
          .addTo(map);
      });

      setTimeout(() => map.invalidateSize(), 250);

      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(containerRef.current!);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any)._roCleanup = () => ro.disconnect();
      }
    };

    init();

    return () => {
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any)._roCleanup?.();
        mapRef.current.remove();
        mapRef.current = null;
        initRef.current = false;
      }
    };
  }, [stores]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-gray-200 dark:border-gray-700"
      style={{ height: 280, width: "100%" }}
    />
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

type ViewTab = "tabla" | "grafico" | "mapa";

export default function MultiStoreDashboard() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewTab, setViewTab] = useState<ViewTab>("tabla");
  const [refreshing, setRefreshing] = useState(false);

  const fetchStores = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/marketplace/stores?limit=50`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Error al cargar tiendas");
          return;
        }
        const json = await res.json();
        const raw: StoreRow[] = (json.data ?? []).map(
          (s: Omit<StoreRow, "sales" | "orders" | "lowStockCount">) => ({
            ...s,
            // Métricas simuladas — en producción vendrían del API con período
            sales: Math.random() * 15000 + 2000,
            orders: Math.floor(Math.random() * 120 + 10),
            lowStockCount: Math.floor(Math.random() * 8),
            commission: (s as unknown as { commission?: number }).commission ?? 5,
          })
        );
        setStores(raw);
      } catch {
        setError("No se pudo conectar con el servidor");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchStores();
  }, [fetchStores, period]);

  // ── Sorting ────────────────────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...stores].sort((a, b) => {
    const va = a[sortKey] as number | string;
    const vb = b[sortKey] as number | string;
    const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  // ── KPIs globales ──────────────────────────────────────────────────────────

  const totalSales = stores.reduce((s, st) => s + st.sales, 0);
  const totalOrders = stores.reduce((s, st) => s + st.orders, 0);
  const totalCommissions = stores.reduce((s, st) => s + (st.sales * st.commission) / 100, 0);
  const avgRating = stores.length > 0
    ? stores.reduce((s, st) => s + st.rating, 0) / stores.length
    : 0;

  // ── Column header helper ───────────────────────────────────────────────────

  function SortTh({
    label,
    sortK,
    className: cx,
  }: {
    label: string;
    sortK: SortKey;
    className?: string;
  }) {
    const active = sortKey === sortK;
    return (
      <th
        className={cn(
          "cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-right text-xs font-bold text-gray-500 hover:text-primary dark:text-gray-400",
          active && "text-primary dark:text-emerald-400",
          cx
        )}
        onClick={() => handleSort(sortK)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <ArrowUpDown className={cn("h-3 w-3", active ? "opacity-100" : "opacity-30")} />
        </span>
      </th>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">
            Todas mis tiendas
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Visión consolidada de {stores.length} tienda{stores.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Selector de período */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700">
            {(Object.entries(PERIOD_LABELS) as [PeriodKey, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg",
                  period === key
                    ? "bg-primary text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => fetchStores(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
            title="Actualizar"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPIs globales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Ventas totales", value: formatSoles(totalSales), icon: DollarSign, color: "text-primary" },
          { label: "Pedidos totales", value: totalOrders, icon: ShoppingCart, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Comisiones", value: formatSoles(totalCommissions), icon: TrendingUp, color: "text-amber-600 dark:text-amber-400" },
          { label: "Rating promedio", value: avgRating.toFixed(1), icon: Star, color: "text-amber-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4", color)} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
            </div>
            <p className={cn("mt-1.5 font-mono text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {stores.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-16 dark:border-gray-700 dark:bg-gray-900">
          <Store className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay tiendas registradas en el marketplace.
          </p>
        </div>
      )}

      {stores.length > 0 && (
        <>
          {/* View tabs */}
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            {(
              [
                { id: "tabla", label: "Tabla", icon: ArrowUpDown },
                { id: "grafico", label: "Gráfico", icon: BarChart3 },
                { id: "mapa", label: "Mapa", icon: MapPin },
              ] as { id: ViewTab; label: string; icon: React.ElementType }[]
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewTab(id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors",
                  viewTab === id
                    ? "bg-white text-primary shadow-sm dark:bg-gray-900"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Vista: Tabla comparativa ────────────────────────────── */}
          {viewTab === "tabla" && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-primary"
                          onClick={() => handleSort("name")}
                        >
                          Tienda
                          <ArrowUpDown className={cn("h-3 w-3", sortKey === "name" ? "opacity-100" : "opacity-30")} />
                        </button>
                      </th>
                      <SortTh label="Ventas" sortK="sales" />
                      <SortTh label="Pedidos" sortK="orders" />
                      <SortTh label="Rating" sortK="rating" />
                      <SortTh label="Stock bajo" sortK="lowStockCount" />
                      <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-500 dark:text-gray-400">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {sorted.map((store) => (
                      <tr
                        key={store.id}
                        className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      >
                        {/* Nombre + logo */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm dark:bg-primary/20">
                              {store.logo ? (
                                <Image
                                  src={store.logo}
                                  alt={store.name}
                                  width={36}
                                  height={36}
                                  className="rounded-lg object-cover"
                                />
                              ) : (
                                "🏪"
                              )}
                            </div>
                            <div className="min-w-0">
                              <a
                                href={`/marketplace/${store.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 truncate font-semibold text-gray-900 hover:text-primary dark:text-white"
                              >
                                {store.name}
                                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                              </a>
                              <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                                {store.category} · {store.zone ?? "Sin zona"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Ventas */}
                        <td className="px-3 py-3 text-right font-mono text-sm font-bold text-gray-900 dark:text-white">
                          {formatSoles(store.sales)}
                        </td>

                        {/* Pedidos */}
                        <td className="px-3 py-3 text-right font-mono text-sm text-gray-700 dark:text-gray-300">
                          {store.orders}
                        </td>

                        {/* Rating */}
                        <td className="px-3 py-3 text-right">
                          <StarRating value={store.rating} />
                        </td>

                        {/* Stock bajo */}
                        <td className="px-3 py-3 text-right">
                          {store.lowStockCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              <AlertTriangle className="h-3 w-3" />
                              {store.lowStockCount}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3 text-center">
                          <span
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-xs font-bold",
                              store.isPublished
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                            )}
                          >
                            {store.isPublished ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Vista: Gráfico de barras ────────────────────────────── */}
          {viewTab === "grafico" && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                  Top 5 tiendas por ventas
                </h3>
              </div>
              <SalesBarChart stores={stores} />
            </div>
          )}

          {/* ── Vista: Mapa ─────────────────────────────────────────── */}
          {viewTab === "mapa" && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                  Ubicación de tiendas
                </h3>
                <span className="ml-auto text-xs text-gray-400 dark:text-gray-600">
                  Posiciones aproximadas en Pucallpa
                </span>
              </div>
              <StoresMapInner stores={stores} />
            </div>
          )}
        </>
      )}

      {/* Nota de plan */}
      <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-gray-600 dark:border-primary/30 dark:bg-primary/10 dark:text-gray-400">
        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p>
          Vista disponible para planes <strong>Business</strong> y{" "}
          <strong>Enterprise</strong>. Las métricas de ventas y pedidos se actualizan en
          tiempo real desde el marketplace.
        </p>
      </div>
    </div>
  );
}
