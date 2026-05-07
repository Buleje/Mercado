'use client';

import { useState, useEffect } from "react";
import { m as motion } from "framer-motion";
import { PiggyBank, TrendingUp, Sparkles } from "@buleje/design-system/icons";

type SavingsData = {
  monthTotal: number;
  allTimeTotal: number;
  itemCount: number;
};

function getCurrentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SavingsCounter() {
  const [savings, setSavings] = useState<SavingsData>({ monthTotal: 0, allTimeTotal: 0, itemCount: 0 });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("buleje-savings-data");
      if (raw) {
        const all: Record<string, { total: number; count: number }> = JSON.parse(raw);
        const monthKey = getCurrentMonthKey();
        const monthData = all[monthKey] || { total: 0, count: 0 };
        const allTimeTotal = Object.values(all).reduce((sum, v) => sum + v.total, 0);
        setSavings({
          monthTotal: monthData.total,
          allTimeTotal,
          itemCount: monthData.count,
        });
      }
    } catch { /* ignore */ }
  }, []);

  const hasSavings = savings.monthTotal > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[var(--surface-sunken)] rounded-2xl border border-[var(--rule-base)] p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
          <PiggyBank className="h-6 w-6 text-[var(--data-warning-600)] dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Tu ahorro este mes
          </h3>
          {hasSavings ? (
            <>
              <p className="text-3xl font-extrabold text-[var(--data-warning-700)] dark:text-amber-300 mt-1">
                S/ {Number(savings.monthTotal).toFixed(2)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-[var(--data-warning-500)]" />
                {savings.itemCount} producto{savings.itemCount !== 1 ? "s" : ""} con descuento
              </p>
              {savings.allTimeTotal > savings.monthTotal && (
                <p className="text-xs text-[var(--text-tertiary)] mt-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Total acumulado: S/ {Number(savings.allTimeTotal).toFixed(2)}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-[var(--text-tertiary)] mt-1">
                S/ 0.00
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1.5 leading-relaxed">
                Empieza a comprar productos con ofertas para ahorrar. Tus descuentos se acumulan aqui.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Visual bar */}
      {hasSavings && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[length:var(--ts-2xs)] text-gray-400 mb-1">
            <span>Ahorro del mes</span>
            <span>Meta: S/ 100</span>
          </div>
          <div className="h-2.5 rounded-full bg-amber-100 dark:bg-amber-900/30 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[var(--data-warning-500)]"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((savings.monthTotal / 100) * 100, 100)}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
