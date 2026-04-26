"use client";

/**
 * SuscripcionesHero — Encabezado del dashboard /cuenta/suscripciones.
 *
 * Monocromo, sin gradientes. Alineado a ADR-068/075. Muestra 3 StatCards
 * con KPIs del usuario: total ahorrado (proyectado), productos activos,
 * próxima entrega.
 */

import { useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  CalendarClock,
  PackageCheck,
  Repeat,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { useSubscriptions } from "@/contexts/subscription-context";
import { CalendarioEntrega } from "@/components/ui-system/illustrations";

// Bug original: `minimumFractionDigits: 2` con `maximumFractionDigits: 0`
// rompe Intl. Para ahorros proyectados redondeamos a entero (sin decimales)
// — es un monto agregado, no precio unitario.
const fmtMoney = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

function fmtDateShort(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "—";
  }
}

export default function SuscripcionesHero() {
  const { projectedYearlySavings, activeCount, upcomingDelivery } =
    useSubscriptions();

  // Stable "now" per render cycle (mount-time). Avoids re-render tearing.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, [upcomingDelivery?.nextDelivery]);

  const upcomingLabel = useMemo(() => {
    if (!upcomingDelivery) return "Sin entregas";
    if (now === null) return "—";
    const days = Math.ceil(
      (new Date(upcomingDelivery.nextDelivery).getTime() - now) /
        (1000 * 60 * 60 * 24),
    );
    if (days < 0) return "Listo para enviar";
    if (days === 0) return "Hoy";
    if (days === 1) return "Manana";
    return `En ${days} dias`;
  }, [upcomingDelivery, now]);

  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex items-start gap-4 mb-6">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center">
            <Repeat
              className="h-5 w-5 text-[var(--text-secondary)]"
              aria-hidden
            />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[length:var(--ts-2xl)] font-extrabold text-[var(--text-primary)] leading-tight">
              Bodega al Mes
            </h1>
            <p className="mt-1 text-[length:var(--ts-sm)] text-[var(--text-secondary)] max-w-2xl">
              Tus productos recurrentes llegan solos. Ahorra 5% en cada entrega,
              pausa o cancela cuando quieras.
            </p>
          </div>
          {/* Ilustración editorial — calendario de entregas recurrentes */}
          <div
            className="hidden sm:flex shrink-0 text-[var(--text-secondary)] opacity-85"
            aria-hidden="true"
          >
            <CalendarioEntrega size={110} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Ahorro anual estimado"
            value={fmtMoney(projectedYearlySavings)}
            icon={BadgePercent}
            emphasis="success"
            subValue="Si mantienes tus activas"
          />
          <StatCard
            label="Productos activos"
            value={activeCount}
            icon={PackageCheck}
            subValue={
              activeCount === 0
                ? "Sin suscripciones"
                : activeCount === 1
                  ? "1 suscripcion"
                  : `${activeCount} suscripciones`
            }
          />
          <StatCard
            label="Próxima entrega"
            value={fmtDateShort(upcomingDelivery?.nextDelivery)}
            icon={CalendarClock}
            subValue={upcomingLabel}
          />
        </div>
      </div>
    </section>
  );
}
