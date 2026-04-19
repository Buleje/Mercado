"use client";

import { CheckCircle2, MapPin, Home } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { SavedLocation } from "@/contexts/customer-context";

/**
 * SavedAddressList — selector de direcciones guardadas para el caso
 * en que el cliente está editando o no tiene una tarjeta verificada.
 * Permite también pedir "usar otra dirección".
 */

export type SavedAddressListProps = {
  locations: SavedLocation[];
  selectedLocId: string | null;
  onSelect: (loc: SavedLocation) => void;
  onAddNew: () => void;
};

export function SavedAddressList({
  locations,
  selectedLocId,
  onSelect,
  onAddNew,
}: SavedAddressListProps) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
        Dirección de entrega
      </label>
      <div className="space-y-2">
        {locations.map((loc) => (
          <button
            type="button"
            key={loc.id}
            onClick={() => onSelect(loc)}
            className={cn(
              "w-full text-left flex items-start gap-3 p-3 rounded-xl border-2 transition-all",
              selectedLocId === loc.id
                ? "border-primary bg-primary/5"
                : "border-gray-100 hover:border-primary/30"
            )}
          >
            <div
              className={cn(
                "mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                selectedLocId === loc.id
                  ? "border-primary bg-primary"
                  : "border-gray-300"
              )}
            >
              {selectedLocId === loc.id && (
                <CheckCircle2 className="h-3.5 w-3.5 text-white fill-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold truncate",
                  selectedLocId === loc.id ? "text-primary" : "text-gray-900"
                )}
              >
                {loc.location}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Home className="h-3 w-3 shrink-0" />
                {loc.reference}
              </p>
            </div>
          </button>
        ))}
        <button
          type="button"
          onClick={onAddNew}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-400 hover:text-primary hover:border-primary/30 transition-all"
        >
          <MapPin className="h-4 w-4" /> Usar otra dirección
        </button>
      </div>
    </div>
  );
}
