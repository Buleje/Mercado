"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Package,
  Clock,
  RefreshCw,
  Star,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TodaySummary {
  ventas: {
    total: number;
    ventasMostrador: number;
    ventasOnline: number;
    cantidadVentas: number;
    cambioVsAyer: number;
  };
  pedidos: {
    hoy: number;
    pendientes: number;
  };
  alertas: {
    stockBajo: number;
    sinStock: number;
    porVencer: number;
    totalAlertas: number;
  };
  topProducto: { nombre: string; cantidad: number } | null;
  generadoA: string;
}

interface MiNegocioHoyCardProps {
  onNavigate?: (module: string) => void;
}

export default function MiNegocioHoyCard({ onNavigate }: MiNegocioHoyCardProps) {
  const [data, setData] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/today-summary");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/admin/today-summary");
        if (res.ok && active) {
          const json = await res.json();
          setData(json);
        }
      } catch { /* silent */ }
      if (active) setLoading(false);
    }

    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-gray-200 dark:bg-gray-700/50 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const fmt = (n: number) =>
    n >= 1000 ? `S/ ${(n / 1000).toFixed(1)}k` : `S/ ${n.toFixed(2)}`;

  const hora = new Date(data.generadoA).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-card/80 border border-gray-200 dark:border-card-border backdrop-blur-sm text-sm hover:bg-gray-50 dark:hover:bg-card transition-colors"
      >
        <Star className="h-4 w-4 text-primary" />
        <span className="font-semibold text-gray-700 dark:text-white">Hoy:</span>
        <span className="text-primary font-bold">{fmt(data.ventas.total)}</span>
        <span className="text-gray-400">·</span>
        <span className="text-gray-600 dark:text-gray-300">{data.ventas.cantidadVentas} ventas</span>
        {data.alertas.totalAlertas > 0 && (
          <>
            <span className="text-gray-400">·</span>
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {data.alertas.totalAlertas} alertas
            </span>
          </>
        )}
        <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Star className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              Mi Negocio Hoy
            </h2>
            <p className="text-[11px] text-gray-400">Actualizado a las {hora}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={refresh}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-400 hover:text-primary transition-colors"
            title="Actualizar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
          >
            Minimizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Ventas del día */}
        <button
          onClick={() => onNavigate?.("analytics-pro")}
          className="group relative overflow-hidden rounded-xl bg-white dark:bg-card border border-gray-200 dark:border-card-border p-4 text-left hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            {data.ventas.cambioVsAyer !== 0 && (
              <div
                className={cn(
                  "flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full",
                  data.ventas.cambioVsAyer > 0
                    ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30"
                    : "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30"
                )}
              >
                {data.ventas.cambioVsAyer > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {data.ventas.cambioVsAyer > 0 ? "+" : ""}
                {data.ventas.cambioVsAyer}%
              </div>
            )}
          </div>
          <p className="text-xl font-extrabold text-gray-900 dark:text-white">
            {fmt(data.ventas.total)}
          </p>
          <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
            {data.ventas.cantidadVentas} ventas hoy
          </p>
          <div className="mt-2 flex gap-2 text-[10px]">
            <span className="text-gray-400">
              🏪 {fmt(data.ventas.ventasMostrador)}
            </span>
            <span className="text-gray-400">
              🌐 {fmt(data.ventas.ventasOnline)}
            </span>
          </div>
        </button>

        {/* Card 2: Pedidos */}
        <button
          onClick={() => onNavigate?.("pedidos")}
          className="group relative overflow-hidden rounded-xl bg-white dark:bg-card border border-gray-200 dark:border-card-border p-4 text-left hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            {data.pedidos.pendientes > 0 && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                <Clock className="h-3 w-3" />
                {data.pedidos.pendientes}
              </span>
            )}
          </div>
          <p className="text-xl font-extrabold text-gray-900 dark:text-white">
            {data.pedidos.hoy}
          </p>
          <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
            Pedidos hoy
          </p>
          {data.pedidos.pendientes > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
              {data.pedidos.pendientes} esperan tu atención
            </p>
          )}
        </button>

        {/* Card 3: Alertas */}
        <button
          onClick={() => onNavigate?.("inventario")}
          className="group relative overflow-hidden rounded-xl bg-white dark:bg-card border border-gray-200 dark:border-card-border p-4 text-left hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center",
                data.alertas.totalAlertas > 0
                  ? "bg-amber-50 dark:bg-amber-900/20"
                  : "bg-emerald-50 dark:bg-emerald-900/20"
              )}
            >
              {data.alertas.totalAlertas > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
          </div>
          <p className="text-xl font-extrabold text-gray-900 dark:text-white">
            {data.alertas.totalAlertas}
          </p>
          <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
            {data.alertas.totalAlertas === 0 ? "Todo en orden" : "Alertas"}
          </p>
          {data.alertas.totalAlertas > 0 && (
            <div className="mt-1.5 space-y-0.5 text-[10px] text-gray-500 dark:text-muted">
              {data.alertas.sinStock > 0 && (
                <p className="text-red-500">🚫 {data.alertas.sinStock} agotados</p>
              )}
              {data.alertas.stockBajo > 0 && (
                <p className="text-amber-500">⚠️ {data.alertas.stockBajo} stock bajo</p>
              )}
              {data.alertas.porVencer > 0 && (
                <p className="text-orange-500">📅 {data.alertas.porVencer} por vencer</p>
              )}
            </div>
          )}
        </button>

        {/* Card 4: Top producto */}
        <div className="relative overflow-hidden rounded-xl bg-white dark:bg-card border border-gray-200 dark:border-card-border p-4">
          <div className="flex items-center mb-2">
            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
              <Star className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          {data.topProducto ? (
            <>
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {data.topProducto.nombre}
              </p>
              <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
                ⭐ Más vendido hoy
              </p>
              <p className="text-lg font-extrabold text-purple-600 dark:text-purple-400 mt-1">
                {data.topProducto.cantidad} {data.topProducto.cantidad === 1 ? "unidad" : "unidades"}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-400 dark:text-muted">
                Sin ventas aún
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Aquí verás el producto estrella del día
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
