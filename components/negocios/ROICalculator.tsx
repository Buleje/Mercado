"use client";

import { useState, useMemo } from "react";
import NumberFlow from "@number-flow/react";
import { TrendingUp, DollarSign, Clock, AlertTriangle } from "@buleje/design-system/icons";

/**
 * ROICalculator
 *
 * Estimación Feynman:
 * - Ventas actuales × 1.18 (online +18%) = ventas con Buleje
 * - 2h/día ahorradas × 25 días × 15 S/hora = S/750/mes en tiempo
 * - 3% menos mermas/fiados perdidos × ventas = ahorro en pérdidas
 * - Costo Buleje = S/49 plan Pro
 */
export default function ROICalculator() {
  const [monthlySales, setMonthlySales] = useState(8000);

  const calc = useMemo(() => {
    const salesIncrease = monthlySales * 0.18; // +18% con online
    const timeSaved = 750; // S/ por mes (2h/día × 25 días × S/15/h)
    const lossReduction = monthlySales * 0.03; // -3% mermas/fiados
    const total = salesIncrease + timeSaved + lossReduction;
    const cost = 49; // Plan Pro
    const net = total - cost;
    const roi = (net / cost) * 100;
    return { salesIncrease, timeSaved, lossReduction, total, cost, net, roi };
  }, [monthlySales]);

  return (
    <section className="py-20 sm:py-24 bg-gray-50 dark:bg-gray-950 border-y border-gray-200 dark:border-gray-800">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400">
            Calculadora ROI
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            ¿Cuánto ganarías con Buleje?
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 leading-relaxed">
            Deslizá para ajustar tus ventas actuales y mira en vivo el retorno
            estimado sobre la inversión.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Slider control */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
            <label className="block">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                ¿Cuánto vendes al mes hoy?
              </span>
              <div className="mt-3 text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white tabular-nums">
                S/
                <NumberFlow
                  value={monthlySales}
                  format={{ maximumFractionDigits: 0 }}
                  locales="es-PE"
                />
              </div>
            </label>

            <input
              type="range"
              min={2000}
              max={60000}
              step={500}
              value={monthlySales}
              onChange={(e) => setMonthlySales(Number(e.target.value))}
              aria-label="Ventas mensuales"
              className="mt-6 w-full h-2 rounded-full appearance-none cursor-pointer bg-linear-to-r from-emerald-400 to-[var(--data-success-600)] accent-emerald-600"
            />
            <div className="mt-2 flex justify-between text-xs text-gray-400 font-bold tabular-nums">
              <span>S/2k</span>
              <span>S/30k</span>
              <span>S/60k</span>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Estimación basada en promedio de bodegas activas: +18% ventas online,
                2h/día ahorradas y 3% menos pérdidas.
              </p>
            </div>
          </div>

          {/* Breakdown + Total */}
          <div className="space-y-4">
            {[
              {
                icon: TrendingUp,
                label: "Ventas online estimadas",
                value: calc.salesIncrease,
                desc: "+18% por aparecer en marketplace",
              },
              {
                icon: Clock,
                label: "Tiempo ahorrado",
                value: calc.timeSaved,
                desc: "2 horas/día × 25 días × S/15/h",
              },
              {
                icon: DollarSign,
                label: "Menos pérdidas",
                value: calc.lossReduction,
                desc: "−3% mermas y fiados perdidos",
              },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.label}
                  className="flex items-center gap-4 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"
                >
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">
                      + {row.label}
                    </p>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500 mt-0.5">{row.desc}</p>
                  </div>
                  <span className="text-base font-extrabold tabular-nums shrink-0 text-gray-900 dark:text-white">
                    S/
                    <NumberFlow value={Math.round(row.value)} format={{ maximumFractionDigits: 0 }} />
                  </span>
                </div>
              );
            })}

            {/* Total — card editorial dark */}
            <div className="relative rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 p-6 border border-gray-900 dark:border-gray-200">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/55 dark:text-gray-500">
                Beneficio neto estimado / mes
              </p>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-4xl sm:text-[56px] font-extrabold tabular-nums tracking-tight leading-none">
                  S/
                  <NumberFlow
                    value={Math.round(calc.net)}
                    format={{ maximumFractionDigits: 0 }}
                  />
                </span>
                <span className="text-white/40 dark:text-gray-400 line-through text-xs tabular-nums">
                  −S/{calc.cost}
                </span>
              </div>
              <p className="mt-3 text-xs text-white/70 dark:text-gray-500">
                ROI:{" "}
                <span className="font-extrabold tabular-nums text-white dark:text-gray-900">
                  <NumberFlow
                    value={Math.round(calc.roi)}
                    format={{ maximumFractionDigits: 0 }}
                  />
                  %
                </span>{" "}
                sobre tu inversión mensual
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
