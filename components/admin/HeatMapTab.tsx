"use client";

import { useState, useMemo } from "react";
import { Activity, BarChart3, TrendingUp, Download, Filter } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type HeatCell = { hour: number; day: string; value: number };

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am to 8pm

// Generate heat map data for sales
function generateSalesHeat(): HeatCell[] {
  return [];
}

function generateProductHeat() {
  const products: string[] = [];
  return products.map(name => ({
    name,
    values: DAYS.map(day => ({ day, value: 0 })),
  }));
}

const SALES_HEAT = generateSalesHeat();
const PRODUCT_HEAT = generateProductHeat();

function getColor(value: number, max: number) {
  const ratio = value / max;
  if (ratio > 0.8) return "bg-primary/90 text-white";
  if (ratio > 0.6) return "bg-primary/60 text-white";
  if (ratio > 0.4) return "bg-primary/40 text-white";
  if (ratio > 0.2) return "bg-primary/20 text-gray-700 dark:text-gray-300";
  return "bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted";
}

export default function HeatMapTab() {
  const [view, setView] = useState<"sales" | "products">("sales");
  const maxSales = Math.max(...SALES_HEAT.map(c => c.value));
  const maxProduct = Math.max(...PRODUCT_HEAT.flatMap(p => p.values.map(v => v.value)));

  const totalTransactions = SALES_HEAT.reduce((s, c) => s + c.value, 0);
  const peakHour = HOURS.reduce((best, h) => {
    const sum = SALES_HEAT.filter(c => c.hour === h).reduce((s, c) => s + c.value, 0);
    return sum > best.sum ? { hour: h, sum } : best;
  }, { hour: 7, sum: 0 });
  const peakDay = DAYS.reduce((best, d) => {
    const sum = SALES_HEAT.filter(c => c.day === d).reduce((s, c) => s + c.value, 0);
    return sum > best.sum ? { day: d, sum } : best;
  }, { day: "Lun", sum: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><Activity className="h-6 w-6 text-primary" /> Mapa de Calor</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Patrones de actividad por hora, día y producto</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView("sales")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "sales" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Ventas por hora</button>
          <button onClick={() => setView("products")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "products" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Productos por día</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Transacciones (semana)", value: totalTransactions, color: "text-blue-500" },
          { label: "Hora pico", value: `${peakHour.hour}:00`, color: "text-emerald-500" },
          { label: "Día más activo", value: peakDay.day, color: "text-violet-500" },
          { label: "Promedio/hora", value: Math.round(totalTransactions / (DAYS.length * HOURS.length)), color: "text-amber-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-2xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {view === "sales" ? (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5 overflow-x-auto">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-4">Transacciones por hora y día de la semana</h3>
          <div className="min-w-[600px]">
            <div className="grid" style={{ gridTemplateColumns: `60px repeat(${HOURS.length}, 1fr)` }}>
              {/* Header */}
              <div />
              {HOURS.map(h => <div key={h} className="text-center text-[10px] font-bold text-gray-400 pb-1">{h}:00</div>)}
              {/* Rows */}
              {DAYS.map(day => (
                <div key={day} className="contents">
                  <div className="text-xs font-bold text-gray-500 dark:text-muted flex items-center pr-2">{day}</div>
                  {HOURS.map(hour => {
                    const cell = SALES_HEAT.find(c => c.day === day && c.hour === hour);
                    return (
                      <div key={`${day}-${hour}`} className={cn("m-0.5 rounded-md flex items-center justify-center text-[10px] font-bold h-8 transition-all cursor-default", getColor(cell?.value ?? 0, maxSales))} title={`${day} ${hour}:00 → ${cell?.value ?? 0} transacciones`}>
                        {cell?.value ?? 0}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-2 mt-4 justify-center">
              <span className="text-[10px] text-gray-400">Menos</span>
              {[10, 30, 50, 70, 90].map(p => <div key={p} className={cn("h-4 w-8 rounded", `bg-primary/${p}`)} />)}
              <span className="text-[10px] text-gray-400">Más</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5 overflow-x-auto">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-4">Demanda por producto y día</h3>
          <div className="min-w-[500px]">
            <div className="grid" style={{ gridTemplateColumns: `150px repeat(${DAYS.length}, 1fr)` }}>
              <div />
              {DAYS.map(d => <div key={d} className="text-center text-[10px] font-bold text-gray-400 pb-1">{d}</div>)}
              {PRODUCT_HEAT.map(p => (
                <div key={p.name} className="contents">
                  <div className="text-xs font-bold text-gray-700 dark:text-foreground flex items-center pr-2 truncate">{p.name}</div>
                  {p.values.map(v => (
                    <div key={`${p.name}-${v.day}`} className={cn("m-0.5 rounded-md flex items-center justify-center text-[10px] font-bold h-8 transition-all cursor-default", getColor(v.value, maxProduct))} title={`${p.name} ${v.day} → ${v.value} unidades`}>
                      {v.value}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
