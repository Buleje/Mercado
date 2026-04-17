"use client";

import { useState } from "react";
import { Percent, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface POSGlobalDiscountProps {
  subtotal: number;
  onDiscountChange: (discount: { monto: number; porcentaje: number }) => void;
}

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

export default function POSGlobalDiscount({
  subtotal,
  onDiscountChange,
}: POSGlobalDiscountProps) {
  const [mode, setMode] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");

  const numValue = Number(value) || 0;
  const discountAmount =
    mode === "percent"
      ? subtotal * (Math.min(numValue, 100) / 100)
      : Math.min(numValue, subtotal);
  const discountPercent =
    mode === "percent" ? Math.min(numValue, 100) : subtotal > 0 ? (numValue / subtotal) * 100 : 0;
  const total = subtotal - discountAmount;

  const handleValueChange = (v: string) => {
    setValue(v);
    const n = Number(v) || 0;
    if (mode === "percent") {
      const pct = Math.min(n, 100);
      onDiscountChange({
        monto: subtotal * (pct / 100),
        porcentaje: pct,
      });
    } else {
      const monto = Math.min(n, subtotal);
      onDiscountChange({
        monto,
        porcentaje: subtotal > 0 ? (monto / subtotal) * 100 : 0,
      });
    }
  };

  const applyQuick = (quickVal: number) => {
    const v = String(quickVal);
    setValue(v);
    handleValueChange(v);
  };

  const quickPercent = [5, 10, 15];
  const quickFixed = [5, 10, 50];
  const quickValues = mode === "percent" ? quickPercent : quickFixed;

  return (
    <div className="space-y-2 bg-gray-50 dark:bg-surface rounded-xl p-2.5 border border-[var(--rule-soft)] dark:border-card-border">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-600 dark:text-muted">
          Descuento:
        </span>
        {/* Toggle % / S/ */}
        <div className="flex bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-lg overflow-hidden">
          <button
            onClick={() => {
              setMode("percent");
              setValue("");
              onDiscountChange({ monto: 0, porcentaje: 0 });
            }}
            className={cn(
              "px-2 py-1 text-xs font-bold transition-colors flex items-center gap-0.5",
              mode === "percent"
                ? "bg-primary text-white"
                : "text-gray-400 dark:text-muted hover:text-gray-600"
            )}
          >
            <Percent className="h-3 w-3" />
          </button>
          <button
            onClick={() => {
              setMode("fixed");
              setValue("");
              onDiscountChange({ monto: 0, porcentaje: 0 });
            }}
            className={cn(
              "px-2 py-1 text-xs font-bold transition-colors flex items-center gap-0.5",
              mode === "fixed"
                ? "bg-primary text-white"
                : "text-gray-400 dark:text-muted hover:text-gray-600"
            )}
          >
            <DollarSign className="h-3 w-3" />
          </button>
        </div>
        <input
          type="number"
          min="0"
          max={mode === "percent" ? 100 : subtotal}
          step={mode === "percent" ? 1 : 0.5}
          value={value}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder="0"
          className="w-16 px-2 py-1 text-xs font-bold border border-[var(--rule-base)] dark:border-card-border rounded-lg text-gray-900 dark:text-foreground outline-none focus:border-primary text-center"
        />
      </div>

      {/* Quick buttons */}
      <div className="flex flex-wrap gap-1">
        {quickValues.map((q) => (
          <button
            key={q}
            onClick={() => applyQuick(q)}
            className={cn(
              "px-2 py-1 rounded-lg text-[length:var(--ts-xs)] font-bold border transition-colors",
              Number(value) === q
                ? "border-primary bg-primary/10 text-primary"
                : "border-[var(--rule-base)] dark:border-card-border text-gray-500 dark:text-muted hover:bg-gray-100"
            )}
          >
            {mode === "percent" ? `${q}%` : `S/${q}`}
          </button>
        ))}
      </div>

      {/* Summary */}
      {discountAmount > 0 && (
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between text-gray-400 dark:text-muted">
            <span>Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between text-red-500 font-semibold">
            <span>
              Desc. {mode === "percent" ? `${discountPercent.toFixed(0)}%` : ""}
            </span>
            <span>-{fmt(discountAmount)}</span>
          </div>
          <div className="flex justify-between text-gray-900 dark:text-foreground font-extrabold border-t border-[var(--rule-base)] dark:border-card-border pt-1">
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
