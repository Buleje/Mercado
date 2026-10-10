"use client";

import { useMemo } from "react";
import { Clock, MapPin, Truck, Package, CheckCircle2, Zap, Sunrise, Sun, Moon, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface DeliveryEstimationProps {
  deliverySlot: string;
  distanceKm?: number;
  orderCount?: number;
}

/* ── Slot definitions ── */
const SLOTS: { id: string; label: string; Icon: LucideIcon; range: string }[] = [
  { id: "lo-antes-posible", label: "Lo antes posible", Icon: Zap, range: "30-45 min" },
  { id: "manana", label: "Mañana", Icon: Sunrise, range: "8:00 - 12:00" },
  { id: "tarde", label: "Tarde", Icon: Sun, range: "12:00 - 17:00" },
  { id: "noche", label: "Noche", Icon: Moon, range: "17:00 - 20:00" },
];

/* ── Dynamic ETA calculation ── */
function computeETA(slotId: string, distanceKm?: number): {
  primary: string;
  secondary: string;
  isToday: boolean;
  confidence: "high" | "medium" | "low";
} {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const h = now.getHours();
  const isOpen = h >= 8 && h < 20;

  // Base delivery time: 25-40 min
  // Add ~5 min per km beyond 1km
  const extraMinutes = distanceKm && distanceKm > 1 ? Math.round((distanceKm - 1) * 5) : 0;
  const baseMin = 25 + extraMinutes;
  const baseMax = 40 + extraMinutes;

  switch (slotId) {
    case "lo-antes-posible":
      if (!isOpen) {
        return {
          primary: "Mañana a primera hora",
          secondary: "Tu pedido será el primero del día (8:00)",
          isToday: false,
          confidence: "high",
        };
      }
      return {
        primary: `~${baseMin}-${baseMax} min`,
        secondary: distanceKm
          ? `A ${distanceKm.toFixed(1)} km de la bodega`
          : "Saldremos lo antes posible",
        isToday: true,
        confidence: distanceKm && distanceKm < 2 ? "high" : "medium",
      };

    case "manana": {
      const isToday = h < 12;
      return {
        primary: isToday ? "Hoy entre 8:00 - 12:00" : "Mañana entre 8:00 - 12:00",
        secondary: isToday ? "Recibirás tu pedido esta mañana" : "Primera ronda de entregas",
        isToday,
        confidence: "high",
      };
    }

    case "tarde": {
      const isToday = h < 17;
      return {
        primary: isToday ? "Hoy entre 12:00 - 17:00" : "Mañana entre 12:00 - 17:00",
        secondary: isToday ? "Entrega durante la tarde" : "Entrega mañana por la tarde",
        isToday,
        confidence: "high",
      };
    }

    case "noche": {
      const isToday = h < 20;
      return {
        primary: isToday ? "Hoy entre 17:00 - 20:00" : "Mañana entre 17:00 - 20:00",
        secondary: isToday ? "Última ronda de entregas del día" : "Entrega mañana en la noche",
        isToday,
        confidence: "medium",
      };
    }

    default:
      return { primary: "", secondary: "", isToday: false, confidence: "low" };
  }
}

/* ── Progress steps for visual timeline ── */
const DELIVERY_STEPS = [
  { id: "confirmed", label: "Confirmado", Icon: CheckCircle2 },
  { id: "preparing", label: "Preparando", Icon: Package },
  { id: "on_way", label: "En camino", Icon: Truck },
  { id: "delivered", label: "Entregado", Icon: MapPin },
];

export default function DeliveryEstimation({
  deliverySlot,
  distanceKm,
  orderCount,
}: DeliveryEstimationProps) {
  const eta = useMemo(
    () => computeETA(deliverySlot, distanceKm),
    [deliverySlot, distanceKm]
  );

  if (!eta.primary) return null;

  const slot = SLOTS.find((s) => s.id === deliverySlot);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/3 dark:bg-primary/6 overflow-hidden">
      {/* Header with ETA */}
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <Truck className="h-4 w-4 text-primary" />
              <span className="text-sm font-extrabold text-[var(--text-primary)]">{eta.primary}</span>
            </div>
            <p className="text-[length:var(--ts-2xs)] text-muted leading-relaxed">{eta.secondary}</p>
          </div>
          {/* Confidence indicator */}
          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-full text-[length:var(--ts-2xs)] font-bold shrink-0",
            eta.confidence === "high"
              ? "bg-emerald-50 text-[var(--data-success-600)] dark:bg-emerald-950/30 dark:text-emerald-400"
              : eta.confidence === "medium"
              ? "bg-amber-50 text-[var(--data-warning-600)] dark:bg-amber-950/30 dark:text-amber-400"
              : "bg-gray-100 text-gray-500 dark:bg-surface dark:text-muted"
          )}>
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              eta.confidence === "high" ? "bg-[var(--data-success-500)]" :
              eta.confidence === "medium" ? "bg-[var(--data-warning-500)]" : "bg-gray-400"
            )} />
            {eta.confidence === "high" ? "Preciso" : eta.confidence === "medium" ? "Estimado" : "Aproximado"}
          </div>
        </div>
      </div>

      {/* Visual delivery timeline */}
      <div className="px-4 pb-3.5">
        <div className="flex items-center">
          {DELIVERY_STEPS.map((step, i) => {
            const { Icon } = step;
            const isFirst = i === 0;
            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-initial">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center transition-colors",
                    isFirst
                      ? "bg-primary/20 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "bg-gray-100 dark:bg-surface text-gray-300 dark:text-gray-600"
                  )}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <span className={cn(
                    "text-[length:var(--ts-2xs)] mt-0.5 font-medium text-center leading-tight",
                    isFirst ? "text-primary" : "text-gray-400"
                  )}>
                    {step.label}
                  </span>
                </div>
                {i < DELIVERY_STEPS.length - 1 && (
                  <div className={cn(
                    "flex-1 h-0.5 mx-1 rounded-full -mt-3",
                    isFirst ? "bg-primary/30" : "bg-gray-100 dark:bg-surface"
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Extra info chips */}
      <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
        {slot && (
          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-muted bg-[var(--surface-raised)] px-2 py-1 rounded-full border border-[var(--rule-base)]">
            <Clock className="h-3 w-3" />
            <slot.Icon aria-hidden="true" className="h-3 w-3" />
            {slot.label}
          </span>
        )}
        {eta.isToday && deliverySlot === "lo-antes-posible" && (
          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 px-2 py-1 rounded-full">
            <Zap className="h-3 w-3" />
            Entrega express
          </span>
        )}
        {distanceKm != null && (
          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-muted bg-[var(--surface-raised)] px-2 py-1 rounded-full border border-[var(--rule-base)]">
            <MapPin className="h-3 w-3" />
            {distanceKm.toFixed(1)} km
          </span>
        )}
        {orderCount != null && orderCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--data-warning-600)] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-full">
            <Package className="h-3 w-3" />
            {orderCount} pedido{orderCount > 1 ? "s" : ""} antes
          </span>
        )}
      </div>
    </div>
  );
}
