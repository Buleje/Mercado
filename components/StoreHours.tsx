"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import { MapPin, Clock, Phone } from "lucide-react";

const SCHEDULE = [
  { days: "Lunes a Viernes", short: "L-V", open: 7, close: 21, icon: "ðŸ“…" },
  { days: "SÃ¡bado", short: "SÃ¡b", open: 7, close: 20, icon: "ðŸ›’" },
  { days: "Domingo", short: "Dom", open: 8, close: 14, icon: "â˜€ï¸" },
];

function getCurrentStatus() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours() + now.getMinutes() / 60;

  let schedule;
  if (day === 0) schedule = SCHEDULE[2];
  else if (day === 6) schedule = SCHEDULE[1];
  else schedule = SCHEDULE[0];

  const isOpen = hour >= schedule.open && hour < schedule.close;
  const closesAt = schedule.close;
  const opensAt = schedule.open;

  return { isOpen, closesAt, opensAt, currentHour: hour };
}

export default function StoreHours() {
  const [status, setStatus] = useState<ReturnType<typeof getCurrentStatus> | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    startTransition(() => setStatus(getCurrentStatus()));
    const id = setInterval(() => {
      startTransition(() => setStatus(getCurrentStatus()));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!status) return null;

  return (
    <section
      ref={ref}
      className="py-14 sm:py-20 bg-surface dark:bg-background overflow-hidden"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 bg-primary/8 dark:bg-primary/15 text-primary text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
            <Clock className="w-3.5 h-3.5" />
            Horarios de atenciÃ³n
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground">
            Te atendemos{" "}
            <span className="text-primary">todos los dÃ­as</span>
          </h2>
          <p className="mt-3 text-muted text-sm max-w-sm mx-auto">
            Ven cuando quieras â€” siempre tenemos stock fresco listo para ti.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{
          border: "1px solid rgba(45,106,79,0.18)",
        }}>

          {/* Live status banner */}
          <div className="relative flex items-center justify-between px-6 sm:px-8 py-5" style={{
            background: status.isOpen
              ? "linear-gradient(90deg, #052e16, #14532d)"
              : "linear-gradient(90deg, #1c0505, #450a0a)",
          }}>
            {/* Subtle dot pattern */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
              backgroundSize: "20px 20px", opacity: 0.08,
            }} />

            <div className="relative flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                <span className={`absolute inset-0 rounded-full ${status.isOpen ? "bg-emerald-400 animate-ping" : "bg-red-400"} opacity-75`} />
                <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${status.isOpen ? "bg-emerald-400" : "bg-red-500"}`} />
              </span>
              <span className="text-white font-bold text-base">
                {status.isOpen ? "Abierto ahora" : "Cerrado"}
              </span>
            </div>
            <span className="relative text-xs font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
              {status.isOpen
                ? `Cierra a las ${status.closesAt}:00`
                : `Abre a las ${status.opensAt}:00`}
            </span>
          </div>

          {/* Schedule rows */}
          <div className="bg-card divide-y" style={{ "--tw-divide-opacity": 1, borderColor: "rgba(45,106,79,0.1)" } as React.CSSProperties}>
            {SCHEDULE.map((s) => {
              const barWidth = Math.round(((s.close - s.open) / 24) * 100);
              const barOffset = Math.round((s.open / 24) * 100);
              return (
                <div
                  key={s.days}
                  className="px-6 sm:px-8 py-5 hover:bg-primary/3 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg leading-none">{s.icon}</span>
                      <span className="text-sm sm:text-base font-bold text-foreground">{s.days}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-bold" style={{
                        background: "var(--color-primary)",
                        color: "#fff",
                        borderRadius: "0.5rem",
                        padding: "0.2rem 0.6rem",
                        opacity: 0.9,
                      }}>
                        {s.open}:00
                      </span>
                      <span className="text-muted text-xs">â€“</span>
                      <span className="font-mono text-sm font-bold" style={{
                        background: "var(--color-primary)",
                        color: "#fff",
                        borderRadius: "0.5rem",
                        padding: "0.2rem 0.6rem",
                        opacity: 0.9,
                      }}>
                        {s.close}:00
                      </span>
                    </div>
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
              <p className="text-sm text-muted">
                Jr. Ucayali 450, Pucallpa, Ucayali â€” PerÃº
              </p>
            </div>
            <a
              href="tel:+51916409675"
              className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/15">
                <Phone className="w-4 h-4 text-primary" />
              </div>
              916 409 675
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

