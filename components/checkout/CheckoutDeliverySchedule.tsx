"use client";

import { Clock, CheckCircle2 } from "lucide-react";

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
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
        <Clock className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
        Horario de entrega
      </label>

      {useCustomDateTime ? (
        <div className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                Fecha de entrega
              </label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => onDeliveryDateChange(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-foreground dark:bg-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                Hora preferida
              </label>
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => onDeliveryTimeChange(e.target.value)}
                min="08:00"
                max="20:00"
                className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-foreground dark:bg-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
              />
            </div>
          </div>
          {deliveryDate && deliveryTime && (
            <div className="px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Entrega programada:{" "}
                {new Date(deliveryDate + "T" + deliveryTime).toLocaleString(
                  "es-PE",
                  {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </p>
            </div>
          )}
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Horario de atencion: Lunes a Domingo de 8:00 AM a 8:00 PM
          </p>
          <button
            type="button"
            onClick={() => {
              onUseCustomDateTimeChange(false);
              onDeliverySlotChange("lo-antes-posible");
            }}
            className="w-full text-xs font-semibold text-primary hover:underline py-2"
          >
            &larr; Volver a &ldquo;Lo antes posible&rdquo;
          </button>
        </div>
      ) : (
        <>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
            Cuando quieres recibir tu pedido?
          </p>
          <div className="flex flex-wrap gap-2">
            {(() => {
              const now = new Date(
                new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
              );
              const h = now.getHours();
              const todaySlots = [
                { id: "lo-antes-posible", label: "Lo antes posible", emoji: "⚡", disabled: false },
                { id: "hoy-14-16", label: "Hoy 2-4pm", emoji: "🕑", disabled: h >= 15 },
                { id: "hoy-16-18", label: "Hoy 4-6pm", emoji: "🕓", disabled: h >= 17 },
                { id: "hoy-18-20", label: "Hoy 6-8pm", emoji: "🕕", disabled: h >= 19 },
              ];
              const tomorrowSlots = [
                { id: "manana-8-10", label: "Manana 8-10am", emoji: "🌅", disabled: false },
                { id: "manana-10-12", label: "Manana 10-12pm", emoji: "☀️", disabled: false },
                { id: "manana-14-16", label: "Manana 2-4pm", emoji: "🕑", disabled: false },
              ];
              return [...todaySlots, ...tomorrowSlots].map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  disabled={slot.disabled}
                  onClick={() => onDeliverySlotChange(slot.id)}
                  className={`px-3 py-2 rounded-full text-xs font-bold transition-all ${
                    deliverySlot === slot.id
                      ? "bg-[#00B4A6] text-white shadow-md scale-105"
                      : slot.disabled
                        ? "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
                        : "bg-gray-100 dark:bg-surface text-gray-700 dark:text-gray-300 hover:bg-primary/10 hover:text-primary"
                  }`}
                >
                  {slot.emoji} {slot.label}
                </button>
              ));
            })()}
          </div>
          <button
            type="button"
            onClick={() => onUseCustomDateTimeChange(true)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border-2 border-dashed border-primary/30 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
          >
            <Clock className="h-3.5 w-3.5" />
            Otra fecha y hora especifica?
          </button>
        </>
      )}
    </div>
  );
}
