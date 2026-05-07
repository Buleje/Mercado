"use client";

/**
 * ClosedNowBanner — banner sticky/inline que se muestra al inicio del
 * storefront cuando la tienda está fuera de su horario configurado.
 *
 * Comunica al cliente:
 *  - Que la tienda está cerrada AHORA.
 *  - Cuándo abre próximamente.
 *  - Los horarios completos de la semana (collapse expandible).
 *  - Que puede armar el carrito y reservar el pedido para entrega cuando
 *    la tienda abra (cancelación gratuita antes de la confirmación).
 */

import { useState } from "react";
import { Moon, ChevronDown, Calendar, Info } from "lucide-react";

const DAY_LABELS: Array<{ key: string; full: string }> = [
  { key: "mon", full: "Lunes" },
  { key: "tue", full: "Martes" },
  { key: "wed", full: "Miércoles" },
  { key: "thu", full: "Jueves" },
  { key: "fri", full: "Viernes" },
  { key: "sat", full: "Sábado" },
  { key: "sun", full: "Domingo" },
];

function formatNextOpeningISO(iso?: string | null): string | null {
  if (!iso) return null;
  const next = new Date(iso);
  if (Number.isNaN(next.getTime())) return null;
  const now = new Date();
  const sameDay = next.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = next.toDateString() === tomorrow.toDateString();
  const time = next.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", hour12: true });
  if (sameDay) return `Abre hoy a las ${time}`;
  if (isTomorrow) return `Abre mañana a las ${time}`;
  const day = next.toLocaleDateString("es-PE", { weekday: "long" });
  return `Abre el ${day} a las ${time}`;
}

interface ClosedNowBannerProps {
  hours: unknown;
  nextOpeningAt?: string | null;
  storeName: string;
}

export default function ClosedNowBanner({ hours, nextOpeningAt, storeName }: ClosedNowBannerProps) {
  const [showHours, setShowHours] = useState(false);
  const nextLabel = formatNextOpeningISO(nextOpeningAt);
  const hoursMap =
    hours && typeof hours === "object" ? (hours as Record<string, { open?: string; close?: string; closed?: boolean }>) : {};

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-linear-to-r from-amber-50 via-amber-100 to-amber-50 dark:from-amber-950/40 dark:via-amber-900/30 dark:to-amber-950/40 border-y-2 border-amber-300 dark:border-[var(--data-warning-700)]"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
          <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 shrink-0">
            <Moon className="h-6 w-6" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-bold text-amber-950 dark:text-amber-100">
              {storeName} está cerrada ahora
            </p>
            <p className="text-sm sm:text-base text-amber-900/80 dark:text-amber-200/80 leading-relaxed mt-0.5">
              {nextLabel ?? "Sin horario configurado"} ·{" "}
              <strong>puedes armar el pedido y lo entregaremos cuando abramos</strong>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <button
            type="button"
            onClick={() => setShowHours((v) => !v)}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-2xl border-2 border-amber-300 dark:border-[var(--data-warning-700)] bg-white/80 dark:bg-amber-900/40 text-sm font-bold text-amber-950 dark:text-amber-100 hover:bg-white transition-colors"
            aria-expanded={showHours}
          >
            <Calendar className="h-4 w-4" />
            Ver horarios
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showHours ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>
      {showHours && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
          <div className="rounded-2xl border-2 border-amber-300 dark:border-[var(--data-warning-700)] bg-white/90 dark:bg-amber-900/30 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {DAY_LABELS.map(({ key, full }) => {
              const day = hoursMap[key];
              const closed = !day || day.closed === true;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm ${
                    closed
                      ? "bg-amber-50 dark:bg-amber-950/40 text-amber-900/60 dark:text-amber-200/60"
                      : "bg-amber-100/60 dark:bg-amber-800/30 text-amber-950 dark:text-amber-100"
                  }`}
                >
                  <span className="font-bold">{full}</span>
                  <span className="font-medium tabular-nums">
                    {closed ? "Cerrado" : `${day?.open ?? "—"} – ${day?.close ?? "—"}`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-amber-900/80 dark:text-amber-200/80 flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            Tu reserva queda <strong className="font-bold mx-1">sin cargo</strong>
            hasta que la tienda confirme. Puedes cancelar gratis antes de la apertura.
          </p>
        </div>
      )}
    </div>
  );
}
