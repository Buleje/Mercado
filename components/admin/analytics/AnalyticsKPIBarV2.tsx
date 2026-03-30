"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  DollarSign,
  ShoppingCart,
  Percent,
  Users,
  AlertTriangle,
  RotateCw,
  RefreshCw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

// V2 endpoint shape (from /api/analytics/kpis-v2)
interface KPIDataV2 {
  ingresosHoy: { valor: number; cambio: number; sparkline: number[] };
  ticketPromedio: { valor: number; cambio: number };
  margenOperativo: { valor: number; estado: "verde" | "amarillo" | "rojo" };
  clientesActivos: { valor: number; cambio: number };
  fiadoPendiente: { valor: number; totalClientes: number; vencidos: number };
  rotacionInventario: { valor: number; subtexto: string };
}

// V1 fallback shape (from /api/analytics/kpis)
interface KPIDataV1 {
  ingresosHoy: { valor: number; cambio: number };
  ticketPromedio: { valor: number; cambio: number };
  transaccionesHoy: { valor: number; cambio: number };
  margenOperativo: { valor: number; cambio: number };
  fiadoPendiente: { valor: number; count: number };
  stockCritico: { valor: number };
}

interface KPICard {
  key: string;
  label: string;
  value: string;
  subtitle?: string;
  cambio?: number;
  icon: React.ElementType;
  color: "green" | "yellow" | "red";
  sparkline?: { v: number }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isV2(data: KPIDataV2 | KPIDataV1): data is KPIDataV2 {
  return "clientesActivos" in data;
}

function fmt(v: number): string {
  if (v >= 1000) return `S/ ${(v / 1000).toFixed(1)}k`;
  return `S/ ${v.toFixed(2)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AnalyticsKPIBarV2() {
  const [data, setData] = useState<KPIDataV2 | KPIDataV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(false);
      // Try v2 first, fallback to v1
      let res = await fetch("/api/analytics/kpis-v2", { credentials: "include" });
      if (!res.ok) {
        res = await fetch("/api/analytics/kpis", { credentials: "include" });
      }
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 animate-pulse p-3"
          >
            <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // ── Error state ──
  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-24 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400 mr-3">
          No se pudieron cargar los KPIs
        </p>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/40 transition-colors"
        >
          <RefreshCw className="h-3 w-3 inline mr-1" />
          Reintentar
        </button>
      </div>
    );
  }

  // ── Build KPI cards from v2 or v1 ──
  let cards: KPICard[];

  if (isV2(data)) {
    // Real sparkline data from backend
    const sparkline = data.ingresosHoy.sparkline.map((v) => ({ v }));

    const margenColor: Record<string, "green" | "yellow" | "red"> = {
      verde: "green", amarillo: "yellow", rojo: "red",
    };

    const fiadoColor: "green" | "yellow" | "red" =
      data.fiadoPendiente.vencidos > 5 ? "red" : data.fiadoPendiente.vencidos > 0 ? "yellow" : "green";

    cards = [
      {
        key: "ingresosHoy",
        label: "INGRESOS HOY",
        value: fmt(data.ingresosHoy.valor),
        cambio: data.ingresosHoy.cambio,
        icon: DollarSign,
        color: data.ingresosHoy.cambio >= 0 ? "green" : data.ingresosHoy.cambio > -10 ? "yellow" : "red",
        sparkline,
      },
      {
        key: "ticketPromedio",
        label: "TICKET PROMEDIO",
        value: fmt(data.ticketPromedio.valor),
        cambio: data.ticketPromedio.cambio,
        icon: ShoppingCart,
        color: data.ticketPromedio.cambio >= 0 ? "green" : data.ticketPromedio.cambio > -10 ? "yellow" : "red",
      },
      {
        key: "margenOperativo",
        label: "MARGEN",
        value: `${data.margenOperativo.valor.toFixed(1)}%`,
        icon: Percent,
        color: margenColor[data.margenOperativo.estado] ?? "green",
      },
      {
        key: "clientesActivos",
        label: "CLIENTES ACTIVOS",
        value: String(data.clientesActivos.valor),
        cambio: data.clientesActivos.cambio,
        icon: Users,
        color: data.clientesActivos.cambio >= 0 ? "green" : data.clientesActivos.cambio > -10 ? "yellow" : "red",
      },
      {
        key: "fiadoPendiente",
        label: "FIADO PENDIENTE",
        value: fmt(data.fiadoPendiente.valor),
        subtitle: data.fiadoPendiente.vencidos > 0 ? `${data.fiadoPendiente.vencidos} vencidos` : undefined,
        icon: AlertTriangle,
        color: fiadoColor,
      },
      {
        key: "rotacionInventario",
        label: "ROTACION INV.",
        value: `${data.rotacionInventario.valor}x`,
        subtitle: data.rotacionInventario.subtexto,
        icon: RotateCw,
        color: data.rotacionInventario.valor >= 6 ? "green" : data.rotacionInventario.valor >= 3 ? "yellow" : "red",
      },
    ];
  } else {
    // V1 fallback: generate synthetic sparkline
    const sparkline = Array.from({ length: 7 }, (_, i) => ({
      v: Math.max(0, data.ingresosHoy.valor * (0.3 + Math.sin(i / 2) * 0.3 + (i / 7) * 0.4)),
    }));

    const getColor = (cambio?: number): "green" | "yellow" | "red" => {
      if (cambio === undefined) return "green";
      return cambio >= 0 ? "green" : cambio > -10 ? "yellow" : "red";
    };

    cards = [
      {
        key: "ingresosHoy",
        label: "INGRESOS HOY",
        value: fmt(data.ingresosHoy.valor),
        cambio: data.ingresosHoy.cambio,
        icon: DollarSign,
        color: getColor(data.ingresosHoy.cambio),
        sparkline,
      },
      {
        key: "ticketPromedio",
        label: "TICKET PROMEDIO",
        value: fmt(data.ticketPromedio.valor),
        cambio: data.ticketPromedio.cambio,
        icon: ShoppingCart,
        color: getColor(data.ticketPromedio.cambio),
      },
      {
        key: "transaccionesHoy",
        label: "TRANSACCIONES",
        value: String(data.transaccionesHoy.valor),
        cambio: data.transaccionesHoy.cambio,
        icon: Users,
        color: getColor(data.transaccionesHoy.cambio),
      },
      {
        key: "margenOperativo",
        label: "MARGEN",
        value: `${data.margenOperativo.valor.toFixed(1)}%`,
        cambio: data.margenOperativo.cambio,
        icon: Percent,
        color: getColor(data.margenOperativo.cambio),
      },
      {
        key: "fiadoPendiente",
        label: "FIADO PENDIENTE",
        value: fmt(data.fiadoPendiente.valor),
        icon: AlertTriangle,
        color: data.fiadoPendiente.valor > 500 ? "red" : data.fiadoPendiente.valor > 100 ? "yellow" : "green",
      },
      {
        key: "stockCritico",
        label: "STOCK CRITICO",
        value: String(data.stockCritico.valor),
        icon: RotateCw,
        color: data.stockCritico.valor > 5 ? "red" : data.stockCritico.valor > 0 ? "yellow" : "green",
      },
    ];
  }

  const borderColor: Record<string, string> = {
    green: "border-l-emerald-500",
    yellow: "border-l-amber-500",
    red: "border-l-red-500",
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className={cn(
              "rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col justify-between border-l-[3px] transition-shadow hover:shadow-md",
              "min-h-[96px]",
              borderColor[card.color]
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider truncate">
                {card.label}
              </span>
              <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
            </div>

            <div className="flex items-end justify-between gap-1">
              <div className="min-w-0">
                <p className="text-2xl font-mono font-bold text-gray-900 dark:text-white truncate" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {card.value}
                </p>
                {card.cambio !== undefined ? (
                  <span
                    className={cn(
                      "text-[10px] font-mono px-2 py-0.5 rounded-full font-medium inline-block mt-0.5",
                      card.cambio >= 0
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    )}
                  >
                    {card.cambio >= 0 ? "+" : ""}
                    {card.cambio.toFixed(1)}%
                  </span>
                ) : card.subtitle ? (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate block">
                    {card.subtitle}
                  </span>
                ) : null}
              </div>

              {card.sparkline && card.sparkline.length > 0 && (
                <div className="shrink-0">
                  <AreaChart width={60} height={28} data={card.sparkline}>
                    <defs>
                      <linearGradient id="kpi-green-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f766e" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="#0f766e"
                      fill="url(#kpi-green-gradient)"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
