"use client";

import { useState, useEffect } from "react";
import { Truck, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_KEYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

// Default schedule if no deliveryConfig available
const DEFAULT_HOURS: Record<string, { open: string; close: string }> = {
  lunes: { open: "07:00", close: "22:00" },
  martes: { open: "07:00", close: "22:00" },
  miercoles: { open: "07:00", close: "22:00" },
  jueves: { open: "07:00", close: "22:00" },
  viernes: { open: "07:00", close: "22:00" },
  sabado: { open: "07:00", close: "22:00" },
  domingo: { open: "08:00", close: "20:00" },
};

export default function DeliveryTimeWidget() {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<{ text: string; sub: string; icon: "open" | "closing" | "closed" }>({
    text: "", sub: "", icon: "closed",
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function update() {
      const now = new Date();
      const dayIdx = now.getDay();
      const dayKey = DAY_KEYS[dayIdx];
      const hours = DEFAULT_HOURS[dayKey];
      if (!hours) {
        setStatus({ text: "Cerrado hoy", sub: "Sin horario definido", icon: "closed" });
        return;
      }

      const [openH, openM] = hours.open.split(":").map(Number);
      const [closeH, closeM] = hours.close.split(":").map(Number);
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const openMins = openH * 60 + openM;
      const closeMins = closeH * 60 + closeM;

      if (nowMins < openMins) {
        setStatus({
          text: `Abre a las ${hours.open}`,
          sub: DAYS_ES[dayIdx],
          icon: "closed",
        });
      } else if (nowMins >= closeMins) {
        // Find next open day
        const nextDay = DAYS_ES[(dayIdx + 1) % 7];
        const nextKey = DAY_KEYS[(dayIdx + 1) % 7];
        const nextHours = DEFAULT_HOURS[nextKey];
        setStatus({
          text: "Cerrado",
          sub: nextHours ? `Abre ${nextDay} ${nextHours.open}` : "Hasta pronto",
          icon: "closed",
        });
      } else if (closeMins - nowMins <= 60) {
        setStatus({
          text: `Cierra en ${closeMins - nowMins} min`,
          sub: "Pide ahora",
          icon: "closing",
        });
      } else {
        const base = 25;
        const variation = Math.floor((nowMins % 10) * 1.5);
        setStatus({
          text: `Entrega en ~${base + variation}-${base + variation + 10} min`,
          sub: `Abierto hasta ${hours.close}`,
          icon: "open",
        });
      }
    }

    update();
    const interval = setInterval(update, 60_000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (dismissed || !status.text) return null;

  const colors = {
    open: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/50",
    closing: "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/50",
    closed: "bg-gray-50 border-[var(--rule-base)] dark:bg-gray-900 dark:border-[var(--rule-base)]",
  };

  const iconColors = {
    open: "text-emerald-600 dark:text-emerald-400",
    closing: "text-amber-600 dark:text-amber-400",
    closed: "text-gray-500 dark:text-gray-400",
  };

  return (
    <div className={cn(
      "fixed bottom-20 left-4 z-40 rounded-2xl border shadow-lg transition-all duration-[var(--dur-base)] max-w-[220px]",
      colors[status.icon],
    )}>
      {/* Collapsed view */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2.5 w-full text-left"
      >
        <div className={cn("shrink-0", iconColors[status.icon])}>
          {status.icon === "open" ? <Truck className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{status.text}</p>
          <p className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400 truncate">{status.sub}</p>
        </div>
        {expanded ? <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" /> : <ChevronUp className="h-3 w-3 text-gray-400 shrink-0" />}
      </button>

      {/* Expanded: today's schedule */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-[var(--rule-base)] pt-2 space-y-1.5">
          <p className="text-[length:var(--ts-2xs)] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Horario hoy</p>
          {(() => {
            const dayKey = DAY_KEYS[new Date().getDay()];
            const hours = DEFAULT_HOURS[dayKey];
            return hours ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700 dark:text-gray-300 font-medium">{DAYS_ES[new Date().getDay()]}</span>
                <span className="font-bold text-gray-900 dark:text-white">{hours.open} — {hours.close}</span>
              </div>
            ) : <p className="text-xs text-gray-500">Sin horario</p>;
          })()}
          <button
            onClick={() => setDismissed(true)}
            className="text-[length:var(--ts-2xs)] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-1"
          >
            Ocultar
          </button>
        </div>
      )}
    </div>
  );
}
