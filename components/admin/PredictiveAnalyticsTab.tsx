"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, TrendingDown, AlertTriangle, Calendar,
  Users, Clock, RefreshCw, ExternalLink, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type StockRiskItem = {
  id: string;
  name: string;
  stock: number;
  daysLeft: number;
  image: string | null;
};

type ChurnItem = {
  id: string;
  name: string;
  phone: string;
  daysAgo: number | null;
  whatsappUrl: string | null;
};

type PeakHour = {
  hour: number;
  label: string;
  salesCount: number;
};

type BestPurchaseDay = {
  day: string;
  reason: string;
  avgSales: number;
};

type Predictions = {
  salesForecast: number;
  trendPct: number;
  stockRisk: StockRiskItem[];
  bestPurchaseDay: BestPurchaseDay;
  churnRisk: ChurnItem[];
  peakHour: PeakHour;
  generatedAt: string;
};

/* ── PredictionCard wrapper ─────────────────────────────────────────────────── */

function PredCard({
  icon: Icon,
  title,
  iconBg,
  children,
}: {
  icon: typeof TrendingUp;
  title: string;
  iconBg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          <Icon className="h-4.5 w-4.5 text-white" />
        </div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/* ── ClockVisual ────────────────────────────────────────────────────────────── */

function ClockVisual({ hour }: { hour: number }) {
  // Manecilla de hora: 0-23 → angulo en el reloj (360/12 * (hour % 12))
  const angle = ((hour % 12) / 12) * 360 - 90;
  const rad = (angle * Math.PI) / 180;
  const x = 50 + 28 * Math.cos(rad);
  const y = 50 + 28 * Math.sin(rad);
  const ampm = hour < 12 ? "AM" : "PM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  return (
    <div className="flex items-center gap-4">
      <svg width={80} height={80} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={44} fill="none" stroke="currentColor" strokeWidth={2} className="text-gray-200 dark:text-gray-700" />
        {[12, 3, 6, 9].map((n, i) => {
          const a = (i * 90 - 90) * Math.PI / 180;
          return (
            <text key={n} x={50 + 34 * Math.cos(a)} y={50 + 34 * Math.sin(a) + 3.5}
              textAnchor="middle" fontSize={8} className="fill-gray-400 dark:fill-gray-500">{n}</text>
          );
        })}
        <line x1={50} y1={50} x2={x} y2={y}
          stroke="#00B4A6" strokeWidth={3} strokeLinecap="round" />
        <circle cx={50} cy={50} r={3} fill="#00B4A6" />
      </svg>
      <div>
        <p className="text-3xl font-extrabold text-gray-900 dark:text-white">{h12}:00 {ampm}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">Hora con mas clientes</p>
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────────── */

export default function PredictiveAnalyticsTab() {
  const [data, setData] = useState<Predictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analytics/predictions", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: Predictions = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar predicciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-40 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 space-y-4">

      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold text-gray-900 dark:text-white">Predicciones IA</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Basado en historial de 28 dias · {new Date(data.generatedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>

      {/* Card 1: Ventas próxima semana */}
      <PredCard icon={data.trendPct >= 0 ? TrendingUp : TrendingDown} title="Ventas próxima semana" iconBg={data.trendPct >= 0 ? "bg-emerald-500" : "bg-red-500"}>
        <div className="flex items-end gap-3">
          <p className="text-4xl font-extrabold text-gray-900 dark:text-white">S/{data.salesForecast.toFixed(2)}</p>
          <span className={cn(
            "text-sm font-bold px-2 py-0.5 rounded-full mb-1",
            data.trendPct >= 0
              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
              : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
          )}>
            {data.trendPct >= 0 ? "+" : ""}{data.trendPct}%
          </span>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {data.trendPct >= 0
            ? "La tendencia esta subiendo respecto al promedio de las 4 semanas anteriores"
            : "La tendencia esta bajando respecto al promedio de las 4 semanas anteriores"}
        </p>
      </PredCard>

      {/* Card 2: Productos en riesgo */}
      <PredCard icon={AlertTriangle} title="Productos que se agotan pronto" iconBg="bg-amber-500">
        {data.stockRisk.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No hay productos en riesgo esta semana</p>
        ) : (
          <div className="space-y-2">
            {data.stockRisk.map(p => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                  <Package className="h-4 w-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">{p.stock} unidades restantes</p>
                </div>
                <span className={cn(
                  "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full",
                  p.daysLeft <= 2
                    ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                    : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
                )}>
                  {p.daysLeft <= 0 ? "Hoy" : `${p.daysLeft}d`}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Calculado como: stock actual / promedio de ventas diarias
        </p>
      </PredCard>

      {/* Card 3: Mejor día para comprar */}
      <PredCard icon={Calendar} title="Mejor dia para ir al proveedor" iconBg="bg-blue-500">
        <div>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-white">{data.bestPurchaseDay.day}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{data.bestPurchaseDay.reason}</p>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Ir ese dia significa menos clientes esperando mientras recibes mercaderia
        </p>
      </PredCard>

      {/* Card 4: Clientes por recuperar */}
      <PredCard icon={Users} title="Clientes que no regresan" iconBg="bg-rose-500">
        {data.churnRisk.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Todos los clientes compraron recientemente</p>
        ) : (
          <div className="space-y-2">
            {data.churnRisk.map(c => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{c.name}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    {c.daysAgo !== null ? `Sin comprar hace ${c.daysAgo} dias` : "Sin historial reciente"}
                  </p>
                </div>
                {c.whatsappUrl && (
                  <a
                    href={c.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-green-600 text-white text-[11px] font-bold hover:bg-green-500 transition-colors min-h-[44px]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    WhatsApp
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Clientes que no compran hace mas de 30 dias tienen mayor riesgo de no volver
        </p>
      </PredCard>

      {/* Card 5: Hora pico */}
      <PredCard icon={Clock} title="Hora con mas clientes" iconBg="bg-violet-500">
        <ClockVisual hour={data.peakHour.hour} />
        <p className="text-xs text-gray-400 dark:text-gray-500">
          En los ultimos 28 dias, la hora con mas ventas fue a las {data.peakHour.label} con {data.peakHour.salesCount} transacciones
        </p>
      </PredCard>
    </div>
  );
}
