"use client";

/**
 * Despacho › los motorizados: los libres (tocar uno lo asigna) y, plegados,
 * los ocupados. Salieron de `DespachoSection.tsx` (10-10). Se fue el chip
 * «Libre» de cada fila: la lista sólo tiene libres y la cabecera dice cuántos.
 */
import { ChevronDown, Loader2, MapPin, Star, UserCheck } from "@buleje/design-system/icons";
import type { DeliveryPartnerLive } from "../hooks/useDeliveryPartnersLive";

interface LibresProps {
  libres: readonly DeliveryPartnerLive[];
  asignando: string | null;
  driverColor: (name: string) => string;
  onAsignar: (p: DeliveryPartnerLive) => void;
}

function Inicial({
  nombre,
  color,
  grande = false,
}: {
  nombre: string;
  color: string;
  grande?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${grande ? "h-11 w-11 text-base" : "h-9 w-9 text-sm"}`}
      style={{ backgroundColor: color }}
    >
      {nombre.charAt(0).toUpperCase()}
    </span>
  );
}

export function ListaLibres({ libres, asignando, driverColor, onAsignar }: LibresProps) {
  if (libres.length === 0) return null;
  return (
    <ul className="divide-y divide-[var(--rule-soft)]">
      {libres.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onAsignar(p)}
            disabled={asignando !== null}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Inicial nombre={p.name} color={driverColor(p.name)} grande />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
                {p.name}
              </span>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-0.5">
                  <Star
                    className="h-3.5 w-3.5 text-[var(--data-warning-500)]"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  {Number(p.rating).toFixed(1)}
                </span>
                <span aria-hidden>·</span>
                <span>{Math.round(p.acceptanceRate * 100)}% acepta</span>
                <span aria-hidden>·</span>
                <span className="capitalize">{p.vehicleType}</span>
                {p.lat != null && p.lng != null && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-0.5 font-bold text-[var(--data-success-ink)]">
                      <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      GPS
                    </span>
                  </>
                )}
              </p>
            </div>
            <span className="inline-flex h-12 shrink-0 items-center gap-1 rounded-xl bg-[var(--text-primary)] px-3 text-sm font-bold text-[var(--surface-canvas)]">
              {asignando === p.id ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-label="Asignando" />
              ) : (
                <>
                  <UserCheck className="h-4 w-4" aria-hidden /> Asignar
                </>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ListaOcupados({
  ocupados,
  driverColor,
}: {
  ocupados: readonly DeliveryPartnerLive[];
  driverColor: (name: string) => string;
}) {
  if (ocupados.length === 0) return null;
  return (
    <details className="group border-t border-[var(--rule-soft)]">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
        Ocupados ahora ({ocupados.length})
      </summary>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {ocupados.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2">
            <Inicial nombre={p.name} color={driverColor(p.name)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--text-primary)]">{p.name}</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Atendiendo #{p.currentOrderId?.slice(-6)}
              </p>
            </div>
            <span className="text-sm font-bold text-[var(--data-warning-ink)]">Ocupado</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
