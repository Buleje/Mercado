"use client";

import { cn } from "@/lib/utils";
import { X, Package } from "lucide-react";

const LOT_OPTIONS = [
  { label: "Unidad", units: 1, icon: "1" },
  { label: "Pack x6", units: 6, icon: "6" },
  { label: "Docena x12", units: 12, icon: "12" },
  { label: "Caja x24", units: 24, icon: "24" },
  { label: "Saco x50", units: 50, icon: "50" },
] as const;

interface Props {
  product: { id: number; name: string; costPrice?: number | null };
  open: boolean;
  onClose: () => void;
  onSelect: (units: number, totalPrice: number) => void;
}

export default function PuntoCompraLotSelector({ product, open, onClose, onSelect }: Props) {
  if (!open) return null;

  const unitPrice = product.costPrice ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-xs overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-card-border">
          <div className="flex items-center gap-2 min-w-0">
            <Package className="h-4 w-4 text-[#00B4A6] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                Seleccionar lote
              </h3>
              <p className="text-[10px] text-gray-400 truncate">{product.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-6 w-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Unit price reference */}
        <div className="px-3 pt-2 pb-1">
          <p className="text-[10px] text-gray-400">
            Precio unitario: <span className="font-mono font-medium text-gray-600 dark:text-gray-300">S/{unitPrice.toFixed(2)}</span>
          </p>
        </div>

        {/* Lot options */}
        <div className="p-3 space-y-1.5">
          {LOT_OPTIONS.map((lot) => {
            const totalPrice = unitPrice * lot.units;
            const savingsPct = lot.units > 1 ? Math.round((lot.units - 1) * 0.5) : 0; // illustrative
            return (
              <button
                key={lot.units}
                type="button"
                onClick={() => onSelect(lot.units, totalPrice)}
                className={cn(
                  "w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all",
                  "border border-gray-200 dark:border-card-border",
                  "hover:border-[#00B4A6] hover:bg-[#00B4A6]/5 dark:hover:bg-[#00B4A6]/10",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
                )}
              >
                {/* Badge */}
                <span className="shrink-0 h-8 w-8 rounded-lg bg-[#00B4A6]/10 text-[#00B4A6] flex items-center justify-center text-xs font-bold">
                  {lot.icon}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-white">
                    {lot.label}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {lot.units} unidad{lot.units !== 1 ? "es" : ""}
                  </p>
                </div>

                {/* Price */}
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold font-mono text-[#00B4A6]">
                    S/{totalPrice.toFixed(2)}
                  </p>
                  {savingsPct > 0 && (
                    <p className="text-[9px] text-green-600 dark:text-green-400 font-medium">
                      Mayor volumen
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Cancel */}
        <div className="p-3 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-1.5 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
