"use client";

import { useState } from "react";
import { Calculator, TrendingUp, Clock, DollarSign } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export default function SaasSavingsCalculator() {
  const [salesPerDay, setSalesPerDay] = useState(30);
  const [employees, setEmployees] = useState(2);
  const [wastePercent, setWastePercent] = useState(5);

  // Calculos
  const hoursManual = Math.round(salesPerDay * 0.03 * 30); // 1.8 min por venta manual * 30 dias
  const hoursSaved = Math.round(hoursManual * 0.7); // 70% reduccion con POS
  const wasteSaved = Math.round(salesPerDay * 15 * 30 * (wastePercent / 100) * 0.4); // 40% menos merma
  const salesIncrease = Math.round(salesPerDay * 15 * 30 * 0.15); // 15% mas ventas con tienda online

  const results = [
    { label: "Horas ahorradas/mes", value: `${hoursSaved}h`, icon: <Clock className="h-5 w-5" />, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Ahorro en merma/mes", value: `S/ ${wasteSaved.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Ventas extra con delivery", value: `+S/ ${salesIncrease.toLocaleString()}`, icon: <TrendingUp className="h-5 w-5" />, color: "text-[var(--accent)] bg-violet-50 dark:bg-violet-950/30" },
  ];

  return (
    <section className="py-20 sm:py-28 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <Calculator className="h-3 w-3" /> Calculadora
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Cuanto ahorras con Buleje?
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Mueve los controles y ve el impacto en tu negocio</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Controles */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700 space-y-8">
            {/* Ventas por dia */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ventas por dia</label>
                <span className="text-sm font-extrabold text-teal-600">{salesPerDay}</span>
              </div>
              <input
                type="range"
                min={5}
                max={200}
                value={salesPerDay}
                onChange={(e) => setSalesPerDay(Number(e.target.value))}
                className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 appearance-none cursor-pointer accent-teal-600"
              />
              <div className="flex justify-between text-[length:var(--ts-2xs)] text-gray-400">
                <span>5</span><span>50</span><span>100</span><span>200</span>
              </div>
            </div>

            {/* Empleados */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Empleados</label>
                <span className="text-sm font-extrabold text-teal-600">{employees}</span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                value={employees}
                onChange={(e) => setEmployees(Number(e.target.value))}
                className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 appearance-none cursor-pointer accent-teal-600"
              />
              <div className="flex justify-between text-[length:var(--ts-2xs)] text-gray-400">
                <span>1</span><span>5</span><span>10</span><span>20</span>
              </div>
            </div>

            {/* Merma */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Merma actual (%)</label>
                <span className="text-sm font-extrabold text-teal-600">{wastePercent}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={15}
                value={wastePercent}
                onChange={(e) => setWastePercent(Number(e.target.value))}
                className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 appearance-none cursor-pointer accent-teal-600"
              />
              <div className="flex justify-between text-[length:var(--ts-2xs)] text-gray-400">
                <span>1%</span><span>5%</span><span>10%</span><span>15%</span>
              </div>
            </div>
          </div>

          {/* Resultados */}
          <div className="space-y-4">
            {results.map((r) => (
              <div
                key={r.label}
                className={cn("flex items-center gap-4 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-all")}
              >
                <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", r.color)}>
                  {r.icon}
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{r.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{r.label}</p>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="p-5 rounded-2xl bg-linear-to-r from-teal-500 to-emerald-600 text-white">
              <p className="text-xs font-bold uppercase tracking-wider text-white/70">Beneficio total estimado/mes</p>
              <p className="text-3xl font-extrabold mt-1">
                S/ {(wasteSaved + salesIncrease).toLocaleString()}
              </p>
              <a
                href="/registro"
                className="inline-block mt-3 px-5 py-2 rounded-xl bg-white text-teal-700 text-sm font-bold hover:bg-white/90 transition-colors"
              >
                Empezar gratis
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
