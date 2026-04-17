"use client";

import React from "react";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

interface CashCalculatorProps {
  cashAmount: string;
  onCashAmountChange: (value: string) => void;
  finalTotal: number;
}

export function CashCalculator({ cashAmount, onCashAmountChange, finalTotal }: CashCalculatorProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50 space-y-2">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
        Calculadora de vuelto
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">S/</span>
        <input
          type="number"
          value={cashAmount}
          onChange={(e) => onCashAmountChange(e.target.value)}
          placeholder={finalTotal.toFixed(2)}
          min={0}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>
      {cashAmount && Number(cashAmount) >= finalTotal && (
        <div className="flex justify-between text-sm bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2">
          <span className="text-green-700 dark:text-green-400 font-medium">Tu vuelto:</span>
          <span className="text-green-700 dark:text-green-400 font-bold">{fmt(Number(cashAmount) - finalTotal)}</span>
        </div>
      )}
      {cashAmount && Number(cashAmount) > 0 && Number(cashAmount) < finalTotal && (
        <p className="text-xs text-red-500">El monto no alcanza (faltan {fmt(finalTotal - Number(cashAmount))})</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {[5, 10, 20, 50, 100].map((v) => (
          <button
            key={v}
            onClick={() => onCashAmountChange(String(v))}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            S/{v}
          </button>
        ))}
      </div>
    </div>
  );
}
