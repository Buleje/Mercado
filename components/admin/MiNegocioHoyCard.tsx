"use client";

import { SectionTitle } from "@buleje/design-system";
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
} from "@buleje/design-system/icons";
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
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-[var(--surface-raised)]/80 border border-[var(--rule-base)] dark:border-[var(--rule-base)] backdrop-blur-sm text-sm hover:bg-gray-50 dark:hover:bg-[var(--surface-raised)] transition-colors"
      >
        <Star className="h-4 w-4 text-primary" />
        <span className="font-semibold text-[var(--text-primary)]">Hoy:</span>
        <span className="text-primary font-bold">{fmt(data.ventas.total)}</span>
        <span className="text-[var(--text-tertiary)]">·</span>
        <span className="text-[var(--text-secondary)]">{data.ventas.cantidadVentas} ventas</span>
        {data.alertas.totalAlertas > 0 && (
          <>
            <span className="text-[var(--text-tertiary)]">·</span>
            <span className="text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium">
              {data.alertas.totalAlertas} alertas
            </span>
          </>
        )}
        <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] ml-auto" />
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
            <SectionTitle className="text-sm font-bold text-[var(--text-primary)]">
              Mi Negocio Hoy
            </SectionTitle>
            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">Actualizado a las {hora}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={refresh}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-[var(--text-tertiary)] hover:text-primary transition-colors"
            title="Actualizar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
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
          className="group relative overflow-hidden rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 text-left hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
            </div>
            {data.ventas.cambioVsAyer !== 0 && (
              <div
                className={cn(
                  "flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full",
                  data.ventas.cambioVsAyer > 0
                    ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)] dark:bg-primary/15"
                    : "text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30"
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
          <p className="text-xl font-extrabold text-[var(--text-primary)]">
            {fmt(data.ventas.total)}
          </p>
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">
            {data.ventas.cantidadVentas} ventas hoy
          </p>
          <div className="mt-2 flex gap-3 text-[length:var(--ts-2xs)] tabular-nums">
            <span className="text-[var(--text-tertiary)]">
              <span className="text-[var(--text-secondary)] font-bold uppercase tracking-wider mr-1">Mostrador</span>
              {fmt(data.ventas.ventasMostrador)}
            </span>
            <span className="text-[var(--text-tertiary)]">
              <span className="text-[var(--text-secondary)] font-bold uppercase tracking-wider mr-1">Online</span>
              {fmt(data.ventas.ventasOnline)}
            </span>
          </div>
        </button>

        {/* Card 2: Pedidos */}
        <button
          onClick={() => onNavigate?.("pedidos")}
          className="group relative overflow-hidden rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 text-left hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
            </div>
            {data.pedidos.pendientes > 0 && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 px-1.5 py-0.5 rounded-full">
                <Clock className="h-3 w-3" />
                {data.pedidos.pendientes}
              </span>
            )}
          </div>
          <p className="text-xl font-extrabold text-[var(--text-primary)]">
            {data.pedidos.hoy}
          </p>
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">
            Pedidos hoy
          </p>
          {data.pedidos.pendientes > 0 && (
            <p className="text-[length:var(--ts-xs)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-1 font-medium">
              {data.pedidos.pendientes} esperan tu atención
            </p>
          )}
        </button>

        {/* Card 3: Alertas */}
        <button
          onClick={() => onNavigate?.("inventario")}
          className="group relative overflow-hidden rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 text-left hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center",
                data.alertas.totalAlertas > 0
                  ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20"
                  : "bg-primary/10 dark:bg-primary/15"
              )}
            >
              {data.alertas.totalAlertas > 0 ? (
                <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" />
              ) : (
                <Package className="h-5 w-5 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
              )}
            </div>
          </div>
          <p className="text-xl font-extrabold text-[var(--text-primary)]">
            {data.alertas.totalAlertas}
          </p>
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">
            {data.alertas.totalAlertas === 0 ? "Todo en orden" : "Alertas"}
          </p>
          {data.alertas.totalAlertas > 0 && (
            <div className="mt-1.5 space-y-0.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">
              {data.alertas.sinStock > 0 && (
                <p className="text-[var(--data-error-500)]">{data.alertas.sinStock} agotados</p>
              )}
              {data.alertas.stockBajo > 0 && (
                <p className="text-[var(--data-warning-500)]">{data.alertas.stockBajo} stock bajo</p>
              )}
              {data.alertas.porVencer > 0 && (
                <p className="text-[var(--data-warning-500)]">{data.alertas.porVencer} por vencer</p>
              )}
            </div>
          )}
        </button>

        {/* Card 4: Top producto */}
        <div className="relative overflow-hidden rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
          <div className="flex items-center mb-2">
            <div className="w-9 h-9 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center">
              <Star className="h-5 w-5 text-[var(--text-secondary)] dark:text-[var(--text-primary)]" />
            </div>
          </div>
          {data.topProducto ? (
            <>
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                {data.topProducto.nombre}
              </p>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mt-0.5">
                Más vendido hoy
              </p>
              <p className="text-lg font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">
                {data.topProducto.cantidad} {data.topProducto.cantidad === 1 ? "unidad" : "unidades"}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-[var(--text-tertiary)] dark:text-muted">
                Sin ventas aún
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                Aquí verás el producto estrella del día
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
