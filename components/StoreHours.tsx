"use client";

import { useState, useEffect, startTransition } from "react";
import { MapPin, Clock, Phone } from "@buleje/design-system/icons";
import { useSettings } from "@/contexts/settings-context";

// Maps day name (as stored in settings) to JS getDay() index (0 = Sunday)
const DAY_TO_JS: Record<string, number> = {
  Domingo: 0, Lunes: 1, Martes: 2, "Miércoles": 3, Jueves: 4, Viernes: 5, Sábado: 6,
};
const DAY_ORDER = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function parseHour(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

export default function StoreHours() {
  const { deliveryConfig } = useSettings();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    startTransition(() => setNow(new Date()));
    const id = setInterval(() => startTransition(() => setNow(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;
  if (!deliveryConfig.hours || deliveryConfig.hours.length === 0) return null;

  const jsDay = now.getDay();
  const currentHour = now.getHours() + now.getMinutes() / 60;

  const todayEntry = deliveryConfig.hours.find(h => DAY_TO_JS[h.day] === jsDay);
  const isOpen = !!(
    todayEntry?.enabled &&
    currentHour >= parseHour(todayEntry.open) &&
    currentHour < parseHour(todayEntry.close)
  );
  const closesAt = todayEntry?.close ?? "--:--";
  const opensAt = todayEntry?.open ?? "--:--";
  const closingSoon = isOpen && todayEntry ? (parseHour(todayEntry.close) - currentHour) <= 1 : false;
  const minutesLeft = isOpen && todayEntry ? Math.round((parseHour(todayEntry.close) - currentHour) * 60) : 0;

  // Sort by natural week order, show all entries
  const sortedHours = [...deliveryConfig.hours].sort(
    (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)
  );

  return (
    <section className="py-14 sm:py-20 bg-surface dark:bg-background overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 bg-primary/8 dark:bg-primary/15 text-primary text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
            <Clock className="w-3.5 h-3.5" />
            Horarios de atención
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[var(--text-primary)]">
            Te atendemos{" "}
            <span className="text-primary">todos los días</span>
          </h2>
          <p className="mt-3 text-muted text-sm max-w-sm mx-auto">
            Ven cuando quieras — siempre tenemos stock fresco listo para ti.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl overflow-hidden shadow-[var(--shadow-xl)]" style={{
          border: "1px solid rgba(45,106,79,0.18)",
        }}>

          {/* Live status banner */}
          <div className="relative flex items-center justify-between px-6 sm:px-8 py-5" style={{
            background: closingSoon
              ? "linear-gradient(90deg, #422006, #713f12)"
              : isOpen
              ? "linear-gradient(90deg, #052e16, #14532d)"
              : "linear-gradient(90deg, #1c0505, #450a0a)",
          }}>
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
              backgroundSize: "20px 20px", opacity: 0.08,
            }} />
            <div className="relative flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                <span className={`absolute inset-0 rounded-full ${closingSoon ? "bg-amber-400 animate-ping" : isOpen ? "bg-emerald-400 animate-ping" : "bg-red-400"} opacity-75`} />
                <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${closingSoon ? "bg-amber-400" : isOpen ? "bg-emerald-400" : "bg-[var(--data-error-500)]"}`} />
              </span>
              <span className="text-white font-bold text-base">
                {closingSoon ? "Cierra pronto" : isOpen ? "Abierto ahora" : "Cerrado"}
              </span>
            </div>
            <span className="relative text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
              {closingSoon
                ? `Quedan ${minutesLeft} min - Cierra a las ${closesAt}`
                : isOpen
                ? `Cierra a las ${closesAt}`
                : `Abre a las ${opensAt}`}
            </span>
          </div>

          {/* Schedule rows */}
          <div className="bg-[var(--surface-raised)] divide-y" style={{ borderColor: "rgba(45,106,79,0.1)" } as React.CSSProperties}>
            {sortedHours.map((s) => {
              const openH = parseHour(s.open);
              const closeH = parseHour(s.close);
              const barWidth = s.enabled ? Math.round(((closeH - openH) / 24) * 100) : 0;
              const barOffset = s.enabled ? Math.round((openH / 24) * 100) : 0;
              return (
                <div key={s.day} className="px-6 sm:px-8 py-5 hover:bg-primary/3 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm sm:text-base font-bold text-[var(--text-primary)]">{s.day}</span>
                    {s.enabled ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-bold" style={{
                          background: "var(--color-primary)", color: "#fff",
                          borderRadius: "0.5rem", padding: "0.2rem 0.6rem", opacity: 0.9,
                        }}>
                          {s.open}
                        </span>
                        <span className="text-muted text-xs">—</span>
                        <span className="font-mono text-sm font-bold" style={{
                          background: "var(--color-primary)", color: "#fff",
                          borderRadius: "0.5rem", padding: "0.2rem 0.6rem", opacity: 0.9,
                        }}>
                          {s.close}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-muted bg-gray-100 dark:bg-surface px-3 py-1 rounded-full">Cerrado</span>
                    )}
                  </div>
                  {/* Time bar */}
                  <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      marginLeft: `${barOffset}%`,
                      width: `${barWidth}%`,
                      background: "linear-gradient(90deg, var(--color-primary), #4ade80)",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="bg-primary/5 dark:bg-primary/10 px-6 sm:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/15">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-muted">Jr. Ucayali 450, Ucayali — Perú</p>
            </div>
            <a
              href="tel:+51929340532"
              className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/15">
                <Phone className="w-4 h-4 text-primary" />
              </div>
              929 340 532
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

