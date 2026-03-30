"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
interface CashFlowWaterfallProps {
  initialBalance?: number;
  cashSales?: number;
  digitalSales?: number;
  supplierPayments?: number;
  operationalCosts?: number;
}

interface WaterfallBar {
  id: string;
  label: string;
  sublabel: string;
  value: number;
  isPositive: boolean;
  isFinal: boolean;
  runningTotal: number;
  offsetPct: number;
  heightPct: number;
  color: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  const prefix = n < 0 ? "-S/ " : "S/ ";
  return `${prefix}${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtShort(n: number) {
  const abs = Math.abs(n);
  const prefix = n < 0 ? "-S/" : "S/";
  if (abs >= 1_000_000) return `${prefix}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${prefix}${(abs / 1_000).toFixed(1)}k`;
  return `${prefix}${abs.toFixed(0)}`;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CashFlowWaterfall({
  initialBalance  = 0,
  cashSales       = 0,
  digitalSales    = 0,
  supplierPayments = 0,
  operationalCosts = 0,
}: CashFlowWaterfallProps) {
  const steps = useMemo(() => {
    const raw: { id: string; label: string; sublabel: string; value: number; isPositive: boolean; isFinal: boolean }[] = [
      {
        id: "initial",
        label: "Saldo inicial",
        sublabel: "Caja al inicio",
        value: initialBalance,
        isPositive: true,
        isFinal: false,
      },
      {
        id: "cash-sales",
        label: "Ventas efectivo",
        sublabel: "Cobros en caja",
        value: cashSales,
        isPositive: true,
        isFinal: false,
      },
      {
        id: "digital-sales",
        label: "Cobros digitales",
        sublabel: "Yape / Plin / Tarjeta",
        value: digitalSales,
        isPositive: true,
        isFinal: false,
      },
      {
        id: "suppliers",
        label: "Pago proveedores",
        sublabel: "Compras del periodo",
        value: -Math.abs(supplierPayments),
        isPositive: false,
        isFinal: false,
      },
      {
        id: "ops",
        label: "Gastos operativos",
        sublabel: "Luz, agua, personal, etc.",
        value: -Math.abs(operationalCosts),
        isPositive: false,
        isFinal: false,
      },
      {
        id: "final",
        label: "Saldo final",
        sublabel: "Caja al cierre",
        value: initialBalance + cashSales + digitalSales - Math.abs(supplierPayments) - Math.abs(operationalCosts),
        isPositive: false,
        isFinal: true,
      },
    ];

    // Compute running totals
    let running = 0;
    const bars: WaterfallBar[] = [];

    raw.forEach((step) => {
      let runningTotal: number;
      if (step.isFinal) {
        runningTotal = step.value;
        running = 0;
      } else if (step.id === "initial") {
        running = step.value;
        runningTotal = step.value;
      } else {
        if (step.value >= 0) {
          runningTotal = running + step.value;
        } else {
          runningTotal = running;
        }
        running += step.value;
      }

      bars.push({
        ...step,
        runningTotal,
        offsetPct: 0,  // computed after min/max
        heightPct: 0,
        color: step.isFinal
          ? "#3b82f6"
          : step.isPositive
          ? "#0f766e"
          : "#ef4444",
      });
    });

    // Compute scale
    const allVals = bars.map((b) => b.runningTotal);
    const minVal = Math.min(...allVals, 0);
    const maxVal = Math.max(...allVals, 0.01);
    const range = maxVal - minVal || 1;

    let acc = 0;
    bars.forEach((b, i) => {
      if (b.isFinal || i === 0) {
        b.heightPct = (Math.abs(b.value) / range) * 90;
        b.offsetPct = ((b.value >= 0 ? b.value - maxVal : -maxVal) / range) * 90 + 5;
      } else if (b.value >= 0) {
        const base = acc;
        b.offsetPct = ((maxVal - base - b.value) / range) * 90 + 5;
        b.heightPct = (b.value / range) * 90;
      } else {
        b.offsetPct = ((maxVal - acc) / range) * 90 + 5;
        b.heightPct = (Math.abs(b.value) / range) * 90;
      }

      if (!b.isFinal) acc += b.value;
      if (i === 0) acc = b.value;
    });

    return bars;
  }, [initialBalance, cashSales, digitalSales, supplierPayments, operationalCosts]);

  const finalBalance = steps.find((s) => s.isFinal);
  const isPositiveFinal = (finalBalance?.value ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Summary */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 text-center">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Entradas</p>
          <p className="text-sm font-bold text-[#0f766e] dark:text-[#14b8a6]">
            {fmt(initialBalance + cashSales + digitalSales)}
          </p>
        </div>
        <div className="flex-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 text-center">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Salidas</p>
          <p className="text-sm font-bold text-red-600 dark:text-red-400">
            {fmt(-(Math.abs(supplierPayments) + Math.abs(operationalCosts)))}
          </p>
        </div>
        <div
          className={cn(
            "flex-1 rounded-lg border p-2 text-center",
            isPositiveFinal
              ? "bg-[#0f766e]/10 dark:bg-[#0f766e]/20 border-[#0f766e]/30"
              : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800"
          )}
        >
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Saldo final</p>
          <p
            className={cn(
              "text-sm font-bold",
              isPositiveFinal ? "text-[#0f766e] dark:text-[#14b8a6]" : "text-red-600 dark:text-red-400"
            )}
          >
            {fmt(finalBalance?.value ?? 0)}
          </p>
        </div>
      </div>

      {/* Waterfall chart */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
        <div className="relative flex items-end gap-1.5" style={{ height: "140px" }}>
          {steps.map((bar, i) => (
            <div
              key={bar.id}
              className="flex-1 flex flex-col items-center relative"
              style={{ height: "140px" }}
            >
              {/* Value label on top */}
              <div
                className="absolute w-full text-center"
                style={{ top: `${Math.max(0, bar.offsetPct - 12)}%` }}
              >
                <span className="text-[9px] font-medium" style={{ color: bar.color }}>
                  {fmtShort(bar.value)}
                </span>
              </div>

              {/* Bar */}
              <div
                className="absolute w-full rounded-sm transition-all duration-500"
                style={{
                  top: `${bar.offsetPct}%`,
                  height: `${Math.max(2, bar.heightPct)}%`,
                  backgroundColor: bar.color,
                  opacity: bar.isFinal ? 1 : 0.85,
                }}
              />

              {/* Connector line to next bar */}
              {i < steps.length - 1 && !bar.isFinal && (
                <div
                  className="absolute right-0 w-1.5 border-t border-dashed border-gray-400 dark:border-gray-500"
                  style={{ top: `${bar.value >= 0 ? bar.offsetPct : bar.offsetPct + bar.heightPct}%` }}
                />
              )}
            </div>
          ))}
        </div>

        {/* X-axis labels */}
        <div className="flex gap-1.5 mt-1">
          {steps.map((bar) => (
            <div key={bar.id} className="flex-1 text-center">
              <p className="text-[9px] leading-tight text-gray-600 dark:text-gray-300 font-medium">
                {bar.label}
              </p>
              <p className="text-[8px] leading-tight text-gray-400 dark:text-gray-500">
                {bar.sublabel}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 justify-center text-[10px] text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#0f766e" }} />
          Entradas
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#ef4444" }} />
          Salidas
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#3b82f6" }} />
          Saldo
        </div>
      </div>

      {/* Detail rows */}
      <div className="flex flex-col gap-1">
        {steps.filter((s) => !s.isFinal).map((bar) => (
          <div
            key={bar.id}
            className="flex items-center justify-between px-2 py-1 rounded bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: bar.color }} />
              <div>
                <p className="font-medium text-gray-800 dark:text-foreground">{bar.label}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">{bar.sublabel}</p>
              </div>
            </div>
            <span
              className="font-bold"
              style={{ color: bar.color }}
            >
              {fmt(bar.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
