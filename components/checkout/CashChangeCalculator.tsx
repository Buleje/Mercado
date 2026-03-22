"use client";

import { useState } from "react";
import { Banknote } from "lucide-react";

export function CashChangeCalculator({ finalTotal }: { finalTotal: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const bills = [10, 20, 50, 100, 200];
  const change = selected !== null ? selected - finalTotal : null;

  return (
    <div className="mt-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
      <div className="flex items-center gap-2 mb-3">
        <Banknote className="h-5 w-5 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          Pago contra entrega — Total: S/{finalTotal.toFixed(2)}
        </p>
      </div>
      <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-2">
        ¿Con cuánto vas a pagar? Así preparamos tu vuelto
      </p>
      <div className="flex flex-wrap gap-2">
        {bills.filter(b => b >= finalTotal).map(bill => (
          <button
            key={bill}
            type="button"
            onClick={() => setSelected(prev => prev === bill ? null : bill)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              selected === bill
                ? "bg-emerald-600 text-white shadow-md scale-105"
                : "bg-white dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:border-emerald-500"
            }`}
          >
            S/{bill}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelected(null)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            selected === null
              ? "bg-emerald-600 text-white shadow-md"
              : "bg-white dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:border-emerald-500"
          }`}
        >
          Monto exacto
        </button>
      </div>
      {change !== null && change > 0 && (
        <div className="mt-3 p-2.5 rounded-lg bg-white dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-700">
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
            Tu vuelto: S/{change.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
