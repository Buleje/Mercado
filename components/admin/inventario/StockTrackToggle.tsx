"use client";

/**
 * StockTrackToggle — controlar inventario vs stock ilimitado (Brandon
 * 2026-06-06). Extraído de InventoryTab.tsx (2026-06-13). Comidas que se
 * preparan al pedido o productos de stock infinito no deberían obligar a poner
 * números: este toggle elige entre "Controlar stock" e "Ilimitado".
 */

import { Package, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export function StockTrackToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1">
      <div className="grid grid-cols-2 gap-1">
        {([
          [true, "Controlar stock", "Lleva la cuenta de unidades"],
          [false, "Ilimitado", "Se prepara o repone al pedido"],
        ] as const).map(([val, label, hint]) => (
          <button
            key={String(val)}
            type="button"
            onClick={() => onChange(val)}
            className={cn(
              "rounded-lg px-3 py-2 text-left transition-colors",
              value === val
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-bold">
              {val ? <Package className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {label}
            </span>
            <span className={cn("mt-0.5 block text-[length:var(--ts-2xs)] font-medium leading-tight", value === val ? "text-white/80" : "text-[var(--text-tertiary)]")}>
              {hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
