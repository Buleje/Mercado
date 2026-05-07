"use client";

import { CheckCircle2, User, Phone, MapPin, Home, Award } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { SavedLocation } from "@/contexts/customer-context";

/**
 * CustomerVerifiedCard — tarjeta read-only que muestra los datos
 * del cliente identificado (foundCustomer / customer del context).
 *
 * Si el cliente tiene > 1 dirección guardada, permite cambiar.
 */

export type CustomerVerifiedCardProps = {
  variant: "found" | "saved";
  name: string;
  phone: string;
  location: string;
  reference: string;
  loyaltyPoints: number | null;
  locations: SavedLocation[];
  selectedLocId: string | null;
  onEditData: () => void;
  onSelectLocation: (loc: SavedLocation) => void;
  onAddNewAddress: () => void;
};

export function CustomerVerifiedCard({
  variant,
  name,
  phone,
  location,
  reference,
  loyaltyPoints,
  locations,
  selectedLocId,
  onEditData,
  onSelectLocation,
  onAddNewAddress,
}: CustomerVerifiedCardProps) {
  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/10 bg-white/60 dark:bg-black/10">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--data-success-500)]" />
          <span className="text-xs font-bold text-[var(--data-success-700)] dark:text-emerald-400 uppercase tracking-wider">
            {variant === "found" ? "Cuenta verificada" : "Datos guardados"}
          </span>
        </div>
        <button
          type="button"
          onClick={onEditData}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Cambiar datos
        </button>
      </div>

      <div className="divide-y divide-primary/10">
        <div className="flex items-center gap-2.5 px-3 py-1.5">
          <User className="h-3.5 w-3.5 text-primary/60 shrink-0" />
          <span className="text-xs font-bold text-gray-900 dark:text-foreground">
            {name}
          </span>
        </div>
        {phone && (
          <div className="flex items-center gap-2.5 px-3 py-1.5">
            <Phone className="h-3.5 w-3.5 text-primary/60 shrink-0" />
            <span className="text-xs text-gray-700 dark:text-foreground">{phone}</span>
          </div>
        )}
        {location && (
          <div className="flex items-start gap-2.5 px-3 py-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary/60 shrink-0 mt-0.5" />
            <span className="text-xs text-gray-700 dark:text-foreground leading-tight">
              {location}
            </span>
          </div>
        )}
        {reference && (
          <div className="flex items-start gap-2.5 px-3 py-1.5">
            <Home className="h-3.5 w-3.5 text-primary/60 shrink-0 mt-0.5" />
            <span className="text-xs text-gray-500 leading-tight">{reference}</span>
          </div>
        )}
        {loyaltyPoints !== null && loyaltyPoints > 0 && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-amber-50/60 dark:bg-amber-900/10">
            <Award className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0" />
            <span className="text-xs font-bold text-[var(--data-warning-700)] dark:text-amber-400">
              {loyaltyPoints} pts
            </span>
          </div>
        )}
      </div>

      {locations.length > 1 && (
        <div className="mt-3 px-3 pb-3">
          <p className="text-[length:var(--ts-2xs)] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Dirección de entrega
          </p>
          <div className="space-y-2">
            {locations.map((loc) => (
              <button
                type="button"
                key={loc.id}
                onClick={() => onSelectLocation(loc)}
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
                      selectedLocId === loc.id
                        ? "text-primary"
                        : "text-gray-900 dark:text-foreground"
                    )}
                  >
                    {loc.location}
                  </p>
                  {loc.reference && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <Home className="h-3 w-3 shrink-0" />
                      {loc.reference}
                    </p>
                  )}
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={onAddNewAddress}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-400 hover:text-primary hover:border-primary/30 transition-all"
            >
              <MapPin className="h-4 w-4" /> Agregar nueva dirección
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
