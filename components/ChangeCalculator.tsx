"use client";

import { useState } from "react";
import { Calculator, Coins } from "@buleje/design-system/icons";

type Bill = { value: number; label: string; color: string };

const BILLS: Bill[] = [
  { value: 200, label: "S/200", color: "bg-red-100 text-red-700 border-red-300" },
  { value: 100, label: "S/100", color: "bg-green-100 text-green-700 border-green-300" },
  { value: 50, label: "S/50", color: "bg-orange-100 text-orange-700 border-orange-300" },
  { value: 20, label: "S/20", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: 10, label: "S/10", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: 5, label: "S/5", color: "bg-purple-100 text-purple-700 border-purple-300" },
  { value: 2, label: "S/2", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { value: 1, label: "S/1", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { value: 0.5, label: "S/0.50", color: "bg-gray-50 text-gray-600 border-gray-200" },
  { value: 0.2, label: "S/0.20", color: "bg-gray-50 text-gray-600 border-gray-200" },
  { value: 0.1, label: "S/0.10", color: "bg-gray-50 text-gray-600 border-gray-200" },
];

type Props = {
  change: number;
};

export function ChangeCalculator({ change }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  if (change <= 0) return null;

  const breakdown = calculateChange(change);

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 transition"
      >
        <Calculator className="w-4 h-4" />
        {isOpen ? "Ocultar" : "Ver"} desglose de vuelto
      </button>

      {isOpen && (
        <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-1">
            <Coins className="w-3 h-3" />
            Sugerencia para dar vuelto:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {breakdown.map((item, i) => (
              <div
                key={i}
                className={`px-2 py-1.5 rounded border text-xs font-medium flex items-center justify-between ${item.color}`}
              >
                <span>{item.label}</span>
                <span className="ml-2 font-bold">×{item.count}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Total: S/{change.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}

function calculateChange(amount: number): (Bill & { count: number })[] {
  let remaining = Math.round(amount * 100) / 100;
  const result: (Bill & { count: number })[] = [];

  for (const bill of BILLS) {
    if (remaining >= bill.value) {
      const count = Math.floor(remaining / bill.value);
      remaining = Math.round((remaining - count * bill.value) * 100) / 100;
      result.push({ ...bill, count });
    }
  }

  return result;
}
