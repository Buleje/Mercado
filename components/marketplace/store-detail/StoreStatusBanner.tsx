"use client";

/**
 * StoreStatusBanner — franja delgada de estado + tiempo de entrega.
 *
 * • Abierto → fondo éxito suave + "Abierto ahora · Entrega 25–35 min"
 * • Cerrado → fondo advertencia suave + "Cerrado · abre [hora]"  (el detalle
 *   completo de horarios sigue en ClosedNowBanner que ya existe).
 *
 * Se muestra como una línea informativa compacta —no invasiva— justo después
 * del StoreBannerArea y antes del BackToTiendas button (la integración la hace
 * StoreDetailClient).
 *
 * No reemplaza ClosedNowBanner: ese componente tiene el accordeon de horarios.
 * Este es el "estado actual" en un vistazo.
 */

import { Clock, Truck, Moon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNextOpenLabel(isoTimestamp?: string | null): string | null {
  if (!isoTimestamp) return null;
  const next = new Date(isoTimestamp);
  if (Number.isNaN(next.getTime())) return null;
  const now = new Date();
  const sameDay = next.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = next.toDateString() === tomorrow.toDateString();
  const time = next.toLocaleTimeString("es-PE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (sameDay) return `abre hoy a las ${time}`;
  if (isTomorrow) return `abre mañana a las ${time}`;
  const weekday = next.toLocaleDateString("es-PE", { weekday: "long" });
  return `abre el ${weekday} a las ${time}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface StoreStatusBannerProps {
  isOpen: boolean;
  /** Tiempo promedio de entrega (minutos). Default: 25. */
  deliveryMin?: number;
  /** Tiempo máximo de entrega (minutos). Default: 35. */
  deliveryMax?: number;
  /** ISO timestamp de próxima apertura (derivado server-side). */
  nextOpeningAt?: string | null;
  /** Etiqueta de horario legible (ej: "Lun a Dom · 7am – 11pm"). */
  scheduleLabel?: string;
  className?: string;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function StoreStatusBanner({
  isOpen,
  deliveryMin = 25,
  deliveryMax = 35,
  nextOpeningAt,
  scheduleLabel,
  className,
}: StoreStatusBannerProps) {
  const nextOpenLabel = formatNextOpenLabel(nextOpeningAt);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-2",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl max-md:rounded-none px-4 py-2.5 border",
          isOpen
            ? [
                "bg-[color-mix(in_oklch,var(--data-success-500)_8%,transparent)]",
                "border-[color-mix(in_oklch,var(--data-success-500)_25%,transparent)]",
                "dark:bg-[color-mix(in_oklch,var(--data-success-500)_12%,transparent)]",
                "dark:border-[color-mix(in_oklch,var(--data-success-500)_20%,transparent)]",
              ]
            : [
                "bg-[color-mix(in_oklch,var(--data-warning-500)_8%,transparent)]",
                "border-[color-mix(in_oklch,var(--data-warning-500)_25%,transparent)]",
                "dark:bg-[color-mix(in_oklch,var(--data-warning-500)_12%,transparent)]",
                "dark:border-[color-mix(in_oklch,var(--data-warning-500)_20%,transparent)]",
              ],
        )}
      >
        {/* Indicador + estado */}
        <div className="flex items-center gap-2">
          {isOpen ? (
            <>
              {/* Dot animado */}
              <span
                aria-hidden
                className="relative inline-flex h-2.5 w-2.5 shrink-0"
              >
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500)] opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)]" />
              </span>
              <span className="text-sm font-bold text-[var(--data-success-500)]">
                Abierto ahora
              </span>
            </>
          ) : (
            <>
              <Moon
                className="h-4 w-4 shrink-0 text-[var(--data-warning-500)]"
                strokeWidth={2}
                aria-hidden
              />
              <span className="text-sm font-bold text-[var(--data-warning-500)]">
                Cerrado
              </span>
            </>
          )}
        </div>

        {/* Separador */}
        <span
          aria-hidden
          className="hidden sm:inline-block h-3.5 w-px bg-current opacity-20"
        />

        {/* Info adicional */}
        {isOpen ? (
          <div className="flex items-center gap-1.5">
            <Truck
              className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-500)]"
              strokeWidth={2.25}
              aria-hidden
            />
            <span className="text-sm font-semibold text-[var(--text-secondary)]">
              Entrega en{" "}
              <strong className="font-black text-[var(--text-primary)]">
                {deliveryMin}–{deliveryMax} min
              </strong>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Clock
              className="h-3.5 w-3.5 shrink-0 text-[var(--data-warning-500)]"
              strokeWidth={2.25}
              aria-hidden
            />
            <span className="text-sm font-semibold text-[var(--text-secondary)]">
              {nextOpenLabel ? (
                <>
                  Próximamente{" "}
                  <strong className="font-black text-[var(--text-primary)]">
                    {nextOpenLabel}
                  </strong>
                </>
              ) : scheduleLabel ? (
                <>
                  Horario:{" "}
                  <strong className="font-black text-[var(--text-primary)]">
                    {scheduleLabel}
                  </strong>
                </>
              ) : (
                <span className="text-[var(--text-tertiary)]">
                  Sin horario configurado
                </span>
              )}
            </span>
          </div>
        )}

        {/* Separador + horario general (solo desktop, si está abierto) */}
        {isOpen && scheduleLabel && (
          <>
            <span
              aria-hidden
              className="hidden lg:inline-block h-3.5 w-px bg-current opacity-20"
            />
            <span className="hidden lg:inline text-xs font-semibold text-[var(--text-tertiary)]">
              {scheduleLabel}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
