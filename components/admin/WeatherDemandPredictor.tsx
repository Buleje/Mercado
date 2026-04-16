 
"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw, Thermometer, CloudRain, Wind, Sun } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type WeatherCondition = "hot" | "rainy" | "cold" | "normal";

interface WeatherData {
  temp: number;
  condition: WeatherCondition;
  description: string;
  humidity: number;
  icon: string;
}

interface Suggestion {
  product: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

// ── Suggestions map ───────────────────────────────────────────────────────────

const SUGGESTIONS: Record<WeatherCondition, Suggestion[]> = {
  hot: [
    { product: "Agua mineral 625ml", reason: "Alta demanda en calor extremo", priority: "high" },
    { product: "Gaseosas frias", reason: "Preferidas a mas de 30 C", priority: "high" },
    { product: "Helados y paletas", reason: "Ventas x3 en dias calurosos", priority: "high" },
    { product: "Jugos naturales", reason: "Alternativa saludable al calor", priority: "medium" },
    { product: "Electrolitos / Gatorade", reason: "Para hidratacion en calor", priority: "medium" },
    { product: "Bloqueador solar", reason: "Accesorio imprescindible", priority: "low" },
  ],
  rainy: [
    { product: "Sopas instantaneas", reason: "Confort en dias de lluvia", priority: "high" },
    { product: "Paraguas / Impermeable", reason: "Demanda directa por lluvia", priority: "high" },
    { product: "Galletas y snacks", reason: "Gente prefiere quedarse en casa", priority: "medium" },
    { product: "Te e infusiones", reason: "Bebida caliente en dias frios", priority: "medium" },
    { product: "Fideos y arroz", reason: "Para cocinar en casa sin salir", priority: "medium" },
    { product: "Velas / Fósforos", reason: "Cortes de luz son comunes", priority: "low" },
  ],
  cold: [
    { product: "Cafe instantaneo", reason: "Bebida caliente muy demandada", priority: "high" },
    { product: "Chocolate caliente", reason: "Clasico en dias frios", priority: "high" },
    { product: "Sopas y caldos", reason: "Calefaccion natural", priority: "high" },
    { product: "Frazadas / Mantas", reason: "Busqueda directa por frio", priority: "medium" },
    { product: "Leche evaporada", reason: "Para bebidas calientes", priority: "medium" },
    { product: "Pan y mantequilla", reason: "Desayunos caseros frios", priority: "low" },
  ],
  normal: [
    { product: "Productos de primera necesidad", reason: "Demanda regular estable", priority: "medium" },
    { product: "Frutas y verduras", reason: "Consumo diario equilibrado", priority: "medium" },
    { product: "Lacteos", reason: "Flujo constante", priority: "low" },
  ],
};

// ── Mock weather (Pucallpa) ───────────────────────────────────────────────────

function getMockWeather(): WeatherData {
  const hour = new Date().getHours();
  const temp = hour >= 10 && hour <= 16 ? 34 : hour >= 17 && hour <= 19 ? 28 : 24;
  const condition: WeatherCondition = temp > 30 ? "hot" : temp < 20 ? "cold" : "normal";
  return {
    temp,
    condition,
    description: temp > 30 ? "Calor intenso" : temp < 20 ? "Fresco" : "Templado",
    humidity: 82,
    icon: temp > 30 ? "sun" : "cloud",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConditionLabel(c: WeatherCondition): string {
  const map: Record<WeatherCondition, string> = {
    hot: "Calor intenso (>30 C)",
    rainy: "Lluvia",
    cold: "Frio (<20 C)",
    normal: "Temperatura normal",
  };
  return map[c];
}

function WeatherIcon({ condition, className }: { condition: WeatherCondition; className?: string }) {
  if (condition === "hot") return <Sun className={cn("text-[#f97316]", className)} />;
  if (condition === "rainy") return <CloudRain className={cn("text-emerald-400", className)} />;
  if (condition === "cold") return <Wind className={cn("text-cyan-400", className)} />;
  return <Sun className={cn("text-yellow-400", className)} />;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-[#f97316]/10 text-[#f97316]",
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const PRIORITY_LABEL: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Normal",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function WeatherDemandPredictor() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    try {
      // Pucallpa coordinates: -8.3791, -74.5539
      const res = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=-8.3791&longitude=-74.5539&current=temperature_2m,precipitation,weathercode&timezone=America/Lima",
        { cache: "no-store" }
      );
      if (res.ok) {
        const json = await res.json();
        const temp: number = json.current?.temperature_2m ?? 28;
        const precip: number = json.current?.precipitation ?? 0;
        const condition: WeatherCondition =
          precip > 0.5 ? "rainy" : temp > 30 ? "hot" : temp < 20 ? "cold" : "normal";
        setWeather({
          temp: Math.round(temp),
          condition,
          description: getConditionLabel(condition),
          humidity: 0,
          icon: condition,
        });
        setUsingMock(false);
      } else {
        throw new Error("API no disponible");
      }
    } catch {
      setWeather(getMockWeather());
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  const suggestions = weather ? SUGGESTIONS[weather.condition] : [];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden ">
      {/* Header */}
      <div
        className={cn(
          "p-5 flex items-center justify-between",
          weather?.condition === "hot"
            ? "bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-950/30 dark:to-yellow-950/30"
            : weather?.condition === "rainy"
              ? "bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-950/30 dark:to-cyan-950/30"
              : weather?.condition === "cold"
                ? "bg-gradient-to-r from-cyan-50 to-slate-50 dark:from-cyan-950/30 dark:to-slate-950/30"
                : "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30"
        )}
      >
        <div className="flex items-center gap-4">
          {loading ? (
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
          ) : weather ? (
            <WeatherIcon condition={weather.condition} className="w-12 h-12" />
          ) : null}
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white text-base">
              Prediccion de demanda — Pucallpa
            </h2>
            {weather && (
              <>
                <p className="text-2xl font-black text-gray-900 dark:text-white">
                  {weather.temp} C
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {weather.description}
                  {usingMock && (
                    <span className="ml-2 text-xs text-[#f97316]">(datos estimados)</span>
                  )}
                </p>
              </>
            )}
          </div>
        </div>
        <button
          onClick={fetchWeather}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors"
          aria-label="Actualizar clima"
        >
          <RefreshCw
            className={cn("w-5 h-5 text-gray-500", loading && "animate-spin")}
          />
        </button>
      </div>

      {/* Suggestions */}
      <div className="p-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">
          Productos recomendados para stockear
        </p>
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
              />
            ))
          ) : (
            suggestions.map((sug, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Thermometer className="w-4 h-4 text-[#00B4A6] flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                      {sug.product}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {sug.reason}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    "flex-shrink-0 text-xs font-bold px-2 py-1 rounded-full",
                    PRIORITY_STYLES[sug.priority]
                  )}
                >
                  {PRIORITY_LABEL[sug.priority]}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
