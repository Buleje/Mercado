"use client";

import { useState, useEffect } from "react";
import {
  Smartphone,
  TrendingUp,
  ShoppingBag,
  Target,
  RefreshCw,
  Plus,
  Info,
  ChevronRight,
  Wifi,
  Battery,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyStats {
  salesTotal: number;
  ordersCount: number;
  dailyGoal: number;
  currency: string;
}

const DEFAULT_STATS: DailyStats = {
  salesTotal: 0,
  ordersCount: 0,
  dailyGoal: 1500,
  currency: "S/",
};

const fmt = (n: number) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Mini Widget ─────────────────────────────────────────────────────────────

function MiniWidget({ stats }: { stats: DailyStats }) {
  const pct = Math.min(100, (stats.salesTotal / stats.dailyGoal) * 100);

  return (
    <div className="w-full rounded-2xl bg-gradient-to-br from-[#2d6a4f] to-[#1b4332] p-4 text-white shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-green-200">Bodega San Martin</span>
        <span className="text-xs text-green-300">hoy</span>
      </div>

      <div className="mb-1 text-2xl font-bold">
        {stats.currency} {fmt(stats.salesTotal)}
      </div>
      <div className="mb-3 text-xs text-green-200">ventas del día</div>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-[#f4a261] transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-green-200">
          <ShoppingBag className="h-3 w-3" />
          {stats.ordersCount} pedidos
        </div>
        <div className="text-green-300">
          Meta: {Math.round(pct)}%
        </div>
      </div>
    </div>
  );
}

// ─── Phone Mockup ─────────────────────────────────────────────────────────────

function PhoneMockup({ stats }: { stats: DailyStats }) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="relative mx-auto w-56 overflow-hidden rounded-[2.5rem] border-[5px] border-gray-800 bg-gray-900 shadow-2xl dark:border-gray-600">
      {/* Notch */}
      <div className="flex items-center justify-between bg-black px-4 py-1.5">
        <span className="text-xs font-semibold text-white">{timeStr}</span>
        <div className="flex items-center gap-1">
          <Wifi className="h-3 w-3 text-white" />
          <Battery className="h-3 w-3 text-white" />
        </div>
      </div>

      {/* Home screen */}
      <div className="bg-gradient-to-b from-sky-500 to-sky-700 p-4">
        {/* Date */}
        <p className="mb-1 text-center text-xs text-white/70">
          {now.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <p className="mb-4 text-center text-3xl font-thin text-white">{timeStr}</p>

        {/* Widget */}
        <MiniWidget stats={stats} />

        {/* App grid placeholder */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {["bg-green-500", "bg-blue-500", "bg-red-500", "bg-yellow-500",
            "bg-purple-500", "bg-pink-500", "bg-indigo-500", "bg-teal-500"].map((color, i) => (
            <div
              key={i}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-2xl",
                color
              )}
            >
              {i === 0 && <ShoppingBag className="h-5 w-5 text-white" />}
            </div>
          ))}
        </div>
      </div>

      {/* Home indicator */}
      <div className="flex justify-center bg-gray-900 py-2">
        <div className="h-1 w-20 rounded-full bg-white/30" />
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SalesWidgetPreview() {
  const [stats, setStats] = useState<DailyStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [goalInput, setGoalInput] = useState(1500);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  useEffect(() => {
    // Try to load today's sales from API
    fetch("/api/sales?limit=500")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data)) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todaySales = data.filter(
            (s: { createdAt: string }) => new Date(s.createdAt) >= today
          );
          const total = todaySales.reduce(
            (sum: number, s: { total: number }) => sum + (s.total ?? 0),
            0
          );
          setStats((prev) => ({
            ...prev,
            salesTotal: total,
            ordersCount: todaySales.length,
          }));
        } else {
          // Demo data
          setStats({
            salesTotal: 1243.5,
            ordersCount: 34,
            dailyGoal: goalInput,
            currency: "S/",
          });
        }
      })
      .catch(() => {
        setStats({
          salesTotal: 1243.5,
          ordersCount: 34,
          dailyGoal: goalInput,
          currency: "S/",
        });
      })
      .finally(() => setLoading(false));
  }, [goalInput]);

  const pct = Math.min(100, (stats.salesTotal / stats.dailyGoal) * 100);

  const PWA_STEPS: { title: string; detail: string }[] = [
    {
      title: "Abre la bodega en Chrome o Safari",
      detail: "Asegúrate de estar en la URL principal de la tienda.",
    },
    {
      title: 'Toca el botón "Compartir" o el menu de opciones',
      detail: "En iOS: botón cuadrado con flecha arriba. En Android: tres puntos verticales.",
    },
    {
      title: 'Selecciona "Agregar a pantalla de inicio"',
      detail: "La app se instalará como acceso directo sin necesidad de Play Store o App Store.",
    },
    {
      title: "Abre desde el ícono instalado",
      detail:
        "La bodega se abrirá en pantalla completa. El widget de ventas aparecerá en el panel de administración.",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <TrendingUp className="h-3.5 w-3.5 text-[#2d6a4f]" />
            Ventas hoy
          </div>
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
          ) : (
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">
              S/ {fmt(stats.salesTotal)}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <ShoppingBag className="h-3.5 w-3.5 text-[#2d6a4f]" />
            Pedidos
          </div>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-100">
            {loading ? "-" : stats.ordersCount}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Target className="h-3.5 w-3.5 text-[#f4a261]" />
            Meta
          </div>
          <p
            className={cn(
              "text-lg font-bold",
              pct >= 100
                ? "text-green-600 dark:text-green-400"
                : pct >= 60
                ? "text-[#f4a261]"
                : "text-gray-800 dark:text-gray-100"
            )}
          >
            {loading ? "-" : `${Math.round(pct)}%`}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Phone mockup */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Así se ve en tu celular
          </p>
          <PhoneMockup stats={{ ...stats, dailyGoal: goalInput }} />

          {/* Goal configurator */}
          <div className="w-full max-w-56">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Meta diaria (S/)
            </label>
            <input
              type="number"
              min={100}
              step={100}
              value={goalInput}
              onChange={(e) => {
                const v = Number(e.target.value);
                setGoalInput(v);
                setStats((prev) => ({ ...prev, dailyGoal: v }));
              }}
              className={cn(
                "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm",
                "text-gray-800 outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/20",
                "dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              )}
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-[#2d6a4f]" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Agregar a pantalla de inicio (PWA)
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {PWA_STEPS.map((step, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(activeStep === i ? null : i)}
                className={cn(
                  "w-full rounded-xl border p-4 text-left transition",
                  activeStep === i
                    ? "border-[#2d6a4f] bg-[#2d6a4f]/5 dark:bg-[#2d6a4f]/10"
                    : "border-gray-200 bg-white hover:border-[#2d6a4f]/30 dark:border-gray-700 dark:bg-gray-900"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      activeStep === i
                        ? "bg-[#2d6a4f] text-white"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
                    )}
                  >
                    {i + 1}
                  </div>
                  <p className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {step.title}
                  </p>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-gray-400 transition",
                      activeStep === i && "rotate-90"
                    )}
                  />
                </div>
                {activeStep === i && (
                  <p className="ml-9 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {step.detail}
                  </p>
                )}
              </button>
            ))}
          </div>

          {/* Info box */}
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                Sin descargar nada
              </p>
              <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">
                Como PWA, la bodega funciona sin Play Store ni App Store. Se instala directo
                desde el navegador y puede funcionar sin conexion con datos guardados localmente.
              </p>
            </div>
          </div>

          {/* Quick action */}
          <button
            className="flex items-center justify-center gap-2 rounded-xl bg-[#2d6a4f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#245a40]"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.open(window.location.origin, "_blank");
              }
            }}
          >
            <Plus className="h-4 w-4" />
            Abrir bodega para instalar
          </button>
        </div>
      </div>

      {/* Widget preview standalone */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Widget de resumen (vista directa)
        </p>
        <div className="max-w-sm">
          <MiniWidget stats={{ ...stats, dailyGoal: goalInput }} />
        </div>
      </div>
    </div>
  );
}
