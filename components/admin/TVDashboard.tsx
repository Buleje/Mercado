 
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  ShoppingCart,
  Target,
  Medal,
  Maximize,
  Minimize,
  RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  salesToday: number;
  dailyGoal: number;
  activeOrders: number;
  topCashier: string;
  topCashierSales: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const REFRESH_MS = 30_000;

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pct(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((value / goal) * 100));
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

const MOCK: DashboardData = {
  salesToday: 1_847.5,
  dailyGoal: 3_000,
  activeOrders: 7,
  topCashier: "Maria R.",
  topCashierSales: 942,
};

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}

function KpiCard({ label, value, icon, accent }: KpiCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-3xl p-10 gap-4",
        "border-2 transition-colors",
        accent
          ? "border-secondary bg-secondary/10"
          : "border-primary bg-primary/10"
      )}
    >
      <div
        className={cn(
          "p-5 rounded-full",
          accent ? "bg-secondary/20" : "bg-primary/20"
        )}
      >
        {icon}
      </div>
      <p className="text-3xl font-bold text-gray-900 tracking-tight text-center">
        {value}
      </p>
      <p className="text-xl font-semibold text-gray-500 text-center">
        {label}
      </p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TVDashboard() {
  const [data, setData] = useState<DashboardData>(MOCK);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData({
          salesToday: json.salesToday ?? MOCK.salesToday,
          dailyGoal: json.dailyGoal ?? MOCK.dailyGoal,
          activeOrders: json.activeOrders ?? MOCK.activeOrders,
          topCashier: json.topCashier ?? MOCK.topCashier,
          topCashierSales: json.topCashierSales ?? MOCK.topCashierSales,
        });
      }
    } catch {
      // fallback to mock
    } finally {
      setLoading(false);
      setLastUpdate(new Date());
    }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const progress = pct(data.salesToday, data.dailyGoal);
  const barColor =
    progress >= 80
      ? "bg-primary"
      : progress >= 50
        ? "bg-secondary"
        : "bg-red-500";

  return (
    <div
      ref={containerRef}
      className={cn(
        "min-h-screen bg-gray-50 text-gray-900",
        "flex flex-col p-10 gap-10 select-none"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-5xl font-extrabold tracking-tight text-primary">
            Buleje
          </h1>
          <p className="text-2xl text-gray-500 mt-1">
            Panel en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-lg text-gray-400">
            Actualizado:{" "}
            {lastUpdate.toLocaleTimeString("es-PE", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-3 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
            aria-label="Actualizar"
          >
            <RefreshCw
              className={cn(
                "w-7 h-7 text-primary",
                loading && "animate-spin"
              )}
            />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-3 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
            aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {fullscreen ? (
              <Minimize className="w-7 h-7 text-primary" />
            ) : (
              <Maximize className="w-7 h-7 text-primary" />
            )}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 flex-1">
        <KpiCard
          label="Ventas hoy"
          value={fmt(data.salesToday)}
          icon={<TrendingUp className="w-14 h-14 text-primary" />}
        />
        <KpiCard
          label="Meta %"
          value={`${progress}%`}
          icon={<Target className="w-14 h-14 text-primary" />}
          accent={progress >= 100}
        />
        <KpiCard
          label="Pedidos activos"
          value={String(data.activeOrders)}
          icon={<ShoppingCart className="w-14 h-14 text-primary" />}
        />
        <KpiCard
          label={`#1 Cajero — ${data.topCashier}`}
          value={fmt(data.topCashierSales)}
          icon={<Medal className="w-14 h-14 text-secondary" />}
          accent
        />
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-3">
        <div className="flex justify-between text-2xl font-bold">
          <span>Meta diaria</span>
          <span>
            {fmt(data.salesToday)} / {fmt(data.dailyGoal)}
          </span>
        </div>
        <div className="w-full h-16 rounded-full bg-gray-200 overflow-hidden shadow-inner">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-[var(--dur-slower)] ease-out",
              barColor
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-2xl font-semibold text-gray-500">
          {progress >= 100
            ? "Meta cumplida"
            : `Faltan ${fmt(data.dailyGoal - data.salesToday)} para la meta`}
        </p>
      </div>
    </div>
  );
}
