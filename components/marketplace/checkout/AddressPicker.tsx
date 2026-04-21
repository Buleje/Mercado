"use client";

/**
 * AddressPicker — Cards radio-style para elegir entre direcciones
 * guardadas en este dispositivo.
 *
 * - La más reciente queda con check por default.
 * - Al seleccionar, llena los campos del form (via onSelect callback).
 * - Botón "Usar otra dirección" desmarca y deja al user llenar manual.
 */

import { useMemo } from "react";
import { CheckCircle2, MapPin, Trash2, PlusCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { SavedAddress } from "@/hooks/use-saved-addresses";

interface AddressPickerProps {
  addresses: SavedAddress[];
  /** id de la dirección activa, o null si el user eligió "nueva". */
  activeId: string | null;
  onSelect: (addr: SavedAddress) => void;
  onNew: () => void;
  onRemove: (id: string) => void;
}

export default function AddressPicker({
  addresses,
  activeId,
  onSelect,
  onNew,
  onRemove,
}: AddressPickerProps) {
  const sorted = useMemo(
    () => [...addresses].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)),
    [addresses],
  );

  if (sorted.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-7 space-y-5">
      <div>
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-1.5">
          <span
            aria-hidden
            className="inline-flex h-[3px] w-8 rounded-full bg-[var(--accent)]"
          />
          <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
          Direcciones guardadas
        </p>
        <h2 className="text-xl sm:text-2xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
          ¿A dónde te lo mandamos?
        </h2>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          {sorted.length} {sorted.length === 1 ? "dirección guardada" : "direcciones guardadas"}
          . La última es la predeterminada — tocá otra para cambiar.
        </p>
      </div>

      <ul role="radiogroup" aria-label="Direcciones guardadas" className="space-y-3">
        {sorted.map((addr) => {
          const isActive = addr.id === activeId;
          return (
            <li key={addr.id}>
              <div
                className={cn(
                  "group relative flex items-start gap-4 rounded-2xl p-4 sm:p-5 transition-all cursor-pointer",
                  isActive
                    ? "border-2 border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_6px_20px_-12px_var(--accent)]"
                    : "border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5",
                )}
                onClick={() => onSelect(addr)}
                role="radio"
                aria-checked={isActive}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(addr);
                  }
                }}
              >
                <span
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-full shrink-0",
                    isActive
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--accent-soft)] text-[var(--accent)]",
                  )}
                  aria-hidden
                >
                  <MapPin className="h-5 w-5" strokeWidth={2} />
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold tracking-[-0.01em] text-[var(--text-primary)] truncate">
                    {addr.address}
                  </p>
                  {addr.zone && (
                    <p className="mt-0.5 text-sm text-[var(--text-tertiary)] truncate">
                      {addr.zone}
                    </p>
                  )}
                  {addr.notes && (
                    <p className="mt-1 text-xs text-[var(--text-tertiary)] line-clamp-1">
                      {addr.notes}
                    </p>
                  )}
                </div>

                {isActive ? (
                  <span
                    aria-hidden
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white shrink-0"
                  >
                    <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--rule-base)] shrink-0"
                  />
                )}

                {!isActive && (
                  <button
                    type="button"
                    aria-label="Eliminar dirección"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(addr.id);
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-7 w-7 inline-flex items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error)] transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onNew}
        className={cn(
          "group w-full inline-flex items-center gap-3 rounded-2xl border-2 border-dashed p-4",
          "border-[var(--rule-base)] bg-[var(--surface-sunken)]/50",
          "hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] transition-all",
          "text-left",
        )}
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-tertiary)] group-hover:bg-[var(--accent)] group-hover:text-white group-hover:border-[var(--accent)] transition-colors shrink-0">
          <PlusCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold tracking-[-0.01em] text-[var(--text-primary)]">
            Usar otra dirección
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Llenar los campos manualmente — quedará guardada al confirmar.
          </p>
        </div>
      </button>
    </section>
  );
}
