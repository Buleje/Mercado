"use client";

/**
 * OrderTimeline — Timeline vertical Amazon-style con 5 pasos.
 *
 * Confirmado → En preparación → En camino → Cerca de ti → Entregado.
 * Check marks animados en pasos completados.
 * Dot pulsante en paso actual.
 */
import { Check, Package, ChefHat, Truck, MapPin, CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { TrackingStep, TrackingStatus } from "@/lib/mocks/order-tracking.mock";

interface Props {
  timeline: TrackingStep[];
  className?: string;
}

const STEP_ICONS: Record<TrackingStatus, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  confirmed: Check,
  preparing: ChefHat,
  shipping: Truck,
  nearby: MapPin,
  delivered: CheckCircle2,
  canceled: Package,
};

function fmtTime(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return null;
  }
}

export function OrderTimeline({ timeline, className }: Props) {
  return (
    <section
      aria-labelledby="tracking-timeline-heading"
      className={cn(
        "rounded-2xl border border-gray-100 dark:border-card-border bg-white dark:bg-card p-5 sm:p-6",
        className,
      )}
    >
      <div className="mb-5">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.22em] text-muted">
          Estado del pedido
        </span>
        <h2
          id="tracking-timeline-heading"
          className="text-base sm:text-lg font-extrabold tracking-tight text-foreground mt-0.5"
        >
          Progreso en tiempo real
        </h2>
      </div>

      <ol className="relative space-y-5">
        {/* Línea vertical conectora */}
        <span
          className="absolute left-[13px] top-5 w-px bg-gray-200 dark:bg-card-border"
          style={{ bottom: "20px" }}
          aria-hidden
        />

        {timeline.map((step) => {
          const Icon = STEP_ICONS[step.step] ?? Package;
          const timestamp = fmtTime(step.timestamp);
          const isDone = step.done && !step.current;
          const isCurrent = !!step.current;
          const isFuture = !step.done && !step.current;

          return (
            <li key={step.step} className="relative flex items-start gap-3 pl-0">
              <span
                className={cn(
                  "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 z-10 transition-colors",
                  isDone &&
                    "bg-foreground border-foreground text-white dark:text-background",
                  isCurrent && "bg-primary border-primary text-white",
                  isFuture &&
                    "bg-white dark:bg-card border-gray-200 dark:border-card-border text-muted",
                )}
                aria-hidden
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
                {isCurrent && (
                  <span className="absolute inset-0 rounded-full bg-primary opacity-40 animate-ping" />
                )}
              </span>

              <div className="flex-1 min-w-0 pb-1">
                <p
                  className={cn(
                    "text-sm font-extrabold tracking-tight",
                    (isDone || isCurrent) && "text-foreground",
                    isFuture && "text-muted",
                  )}
                >
                  {step.label}
                </p>
                {timestamp && (
                  <p className="text-[length:var(--ts-2xs)] text-muted font-semibold tabular-nums mt-0.5">
                    {timestamp}
                  </p>
                )}
                {isCurrent && (
                  <p className="text-[length:var(--ts-2xs)] font-semibold text-primary mt-0.5 uppercase tracking-[0.14em]">
                    En curso
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
