"use client";

import { Clock, CheckCircle2, Calendar, Zap } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface CheckoutDeliveryScheduleProps {
  deliverySlot: string;
  onDeliverySlotChange: (slot: string) => void;
  deliveryDate: string;
  onDeliveryDateChange: (date: string) => void;
  deliveryTime: string;
  onDeliveryTimeChange: (time: string) => void;
  useCustomDateTime: boolean;
  onUseCustomDateTimeChange: (v: boolean) => void;
}

/**
 * CheckoutDeliverySchedule — selector de horario de entrega.
 *
 * Rediseño 2026-05-05: chips agrupados por día (Hoy / Mañana) con
 * separadores visibles, "Lo antes posible" destacado como CTA primario,
 * inputs de fecha/hora con tokens del DS y label brand-tinted.
 */
export function CheckoutDeliverySchedule({
  deliverySlot,
  onDeliverySlotChange,
  deliveryDate,
  onDeliveryDateChange,
  deliveryTime,
  onDeliveryTimeChange,
  useCustomDateTime,
  onUseCustomDateTimeChange,
}: CheckoutDeliveryScheduleProps) {
  const inputClass =
    "w-full h-12 px-3 rounded-xl border-2 border-[var(--rule-soft)] bg-white dark:bg-card text-foreground focus:border-[var(--color-primary,#00B4A6)] focus:outline-none transition-colors text-sm tabular-nums";

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-1.5 text-sm font-bold text-foreground">
        <Clock
          className="h-4 w-4"
          strokeWidth={2}
          style={{ color: "var(--color-primary, #00B4A6)" }}
        />
        ¿Cuándo entregamos?
      </label>

      {useCustomDateTime ? (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" strokeWidth={2.25} />
                Fecha
              </label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => onDeliveryDateChange(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" strokeWidth={2.25} />
                Hora
              </label>
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => onDeliveryTimeChange(e.target.value)}
                min="08:00"
                max="20:00"
                className={inputClass}
              />
            </div>
          </div>
          {deliveryDate && deliveryTime && (
            <div
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
              style={{
                background:
                  "color-mix(in oklch, var(--data-success-500) 8%, transparent)",
                border:
                  "1px solid color-mix(in oklch, var(--data-success-500) 30%, transparent)",
              }}
            >
              <CheckCircle2
                className="h-4 w-4 shrink-0"
                strokeWidth={2.25}
                style={{ color: "var(--data-success-600)" }}
              />
              <p
                className="text-sm font-bold leading-tight"
                style={{ color: "var(--data-success-700)" }}
              >
                {new Date(
                  deliveryDate + "T" + deliveryTime,
                ).toLocaleString("es-PE", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          )}
          <p className="text-xs text-muted leading-relaxed">
            Atendemos lunes a domingo de 8:00 AM a 8:00 PM
          </p>
          <button
            type="button"
            onClick={() => {
              onUseCustomDateTimeChange(false);
              onDeliverySlotChange("lo-antes-posible");
            }}
            className="w-full h-10 inline-flex items-center justify-center gap-1 text-sm font-bold rounded-xl border-2 border-[var(--rule-soft)] hover:border-[var(--color-primary,#00B4A6)]/40 transition-colors"
            style={{ color: "var(--color-primary, #00B4A6)" }}
          >
            ← Volver a horarios rápidos
          </button>
        </div>
      ) : (
        <>
          {/* Lo antes posible — destacado como opción primary */}
          {(() => {
            const isAsap = deliverySlot === "lo-antes-posible";
            return (
              <button
                type="button"
                onClick={() => onDeliverySlotChange("lo-antes-posible")}
                className={cn(
                  "w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-all text-left",
                  isAsap
                    ? "shadow-sm"
                    : "border-[var(--rule-soft)] bg-white dark:bg-card hover:border-[var(--color-primary,#00B4A6)]/40",
                )}
                style={
                  isAsap
                    ? {
                        borderColor: "var(--color-primary, #00B4A6)",
                        background:
                          "color-mix(in oklch, var(--color-primary, #00B4A6) 6%, var(--color-card))",
                      }
                    : undefined
                }
              >
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: isAsap
                      ? "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)"
                      : "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)",
                  }}
                >
                  <Zap
                    className="h-5 w-5"
                    strokeWidth={2.25}
                    style={{
                      color: isAsap
                        ? "white"
                        : "var(--color-primary, #00B4A6)",
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-extrabold text-foreground leading-tight">
                    Lo antes posible
                  </p>
                  <p className="text-xs text-muted leading-tight mt-0.5">
                    Recomendado · ~30 min
                  </p>
                </div>
                {isAsap && (
                  <CheckCircle2
                    className="h-5 w-5 shrink-0"
                    strokeWidth={2.5}
                    style={{ color: "var(--color-primary, #00B4A6)" }}
                  />
                )}
              </button>
            );
          })()}

          {/* Slots por día */}
          {(() => {
            const now = new Date(
              new Date().toLocaleString("en-US", {
                timeZone: "America/Lima",
              }),
            );
            const h = now.getHours();
            const todaySlots = [
              { id: "hoy-14-16", label: "2-4 pm", disabled: h >= 15 },
              { id: "hoy-16-18", label: "4-6 pm", disabled: h >= 17 },
              { id: "hoy-18-20", label: "6-8 pm", disabled: h >= 19 },
            ];
            const tomorrowSlots = [
              { id: "manana-8-10", label: "8-10 am", disabled: false },
              { id: "manana-10-12", label: "10-12 pm", disabled: false },
              { id: "manana-14-16", label: "2-4 pm", disabled: false },
            ];

            const renderSlots = (
              label: string,
              slots: typeof todaySlots,
            ) => (
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted uppercase tracking-wider">
                  {label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => {
                    const active = deliverySlot === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={slot.disabled}
                        onClick={() => onDeliverySlotChange(slot.id)}
                        className={cn(
                          "h-10 px-4 rounded-full text-sm font-bold transition-all border-2 tabular-nums",
                          active
                            ? "border-transparent text-white shadow-sm"
                            : slot.disabled
                              ? "border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-muted opacity-50 cursor-not-allowed line-through"
                              : "border-[var(--rule-soft)] bg-white dark:bg-card text-foreground hover:border-[var(--color-primary,#00B4A6)]/40 hover:text-[var(--color-primary,#00B4A6)]",
                        )}
                        style={
                          active
                            ? {
                                background:
                                  "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                              }
                            : undefined
                        }
                      >
                        {slot.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );

            return (
              <div className="space-y-3">
                {renderSlots("Hoy", todaySlots)}
                {renderSlots("Mañana", tomorrowSlots)}
              </div>
            );
          })()}

          <button
            type="button"
            onClick={() => onUseCustomDateTimeChange(true)}
            className="w-full h-10 flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--rule-soft)] hover:border-[var(--color-primary,#00B4A6)]/40 hover:bg-[var(--surface-sunken)]/40 text-sm font-bold transition-colors"
            style={{ color: "var(--color-primary, #00B4A6)" }}
          >
            <Calendar className="h-4 w-4" strokeWidth={2.25} />
            Otra fecha y hora
          </button>
        </>
      )}
    </div>
  );
}
