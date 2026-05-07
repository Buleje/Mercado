"use client";

/**
 * EarningsTodayHero — card grande con ganancias en tiempo real.
 *
 * Patrón Uber Eats / Rappi / DoorDash: lo PRIMERO que ve el repartidor
 * al abrir la app es cuánto lleva ganado hoy. Reduce fricción ("voy a
 * ganancias para ver"), aumenta dopamina inmediata, dispara más horas
 * online por motivación clara hacia la meta.
 *
 * Datos:
 *   - GET /api/delivery/me/earnings?period=today  → fees + tips + count
 *   - Meta diaria configurable (default S/ 80)
 *   - Hours online estimado a partir del primer ping del día
 *   - Bonus activos (mock-ready, conectar con backend cuando exista)
 *
 * Polling: cada 60s para mantener live sin spamear DB.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CashIcon, MotoIcon, TimerIcon } from "./icons";
import { ArrowRight, TrendingUp, Flame } from "@buleje/design-system/icons";

interface EarningsResp {
  totals: {
    deliveries: number;
    fees: number;
    tips: number;
    total: number;
  };
}

interface Props {
  /** Meta diaria del repartidor en soles (default 80). */
  goal?: number;
  /** Si está online — para mostrar "horas activo hoy". */
  isOnline: boolean;
  /** Hora a la que se conectó hoy (millis epoch). Si no se pasa, usa now. */
  onlineSinceMs?: number | null;
}

const POLL_MS = 60_000;

function formatHours(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export default function EarningsTodayHero({
  goal = 80,
  isOnline,
  onlineSinceMs,
}: Props) {
  const [data, setData] = useState<EarningsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/delivery/me/earnings?period=today", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as EarningsResp;
      setData(json);
    } catch {
      /* silent — vista degrada bien */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Tick cada minuto para refrescar "horas online"
  useEffect(() => {
    if (!isOnline) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [isOnline]);

  const totals = data?.totals ?? { deliveries: 0, fees: 0, tips: 0, total: 0 };
  const earned = totals.total;
  const pctGoal = Math.min(100, Math.max(0, (earned / goal) * 100));
  const remaining = Math.max(0, goal - earned);
  const goalReached = earned >= goal;

  const onlineMs = isOnline && onlineSinceMs ? Math.max(0, now - onlineSinceMs) : 0;

  return (
    <section
      aria-label="Ganancias de hoy"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--accent)] via-[var(--accent)] to-[var(--data-success-700)] text-white shadow-2xl shadow-[var(--accent)]/30 p-5 sm:p-7 lg:p-9"
    >
      {/* Decorative orbs — más capas para profundidad */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-white/12 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-white/8 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-1/4 h-32 w-32 rounded-full bg-emerald-300/20 blur-2xl"
      />
      {/* Grid sutil en background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative">
        {/* Header — layout responsive */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-3 mb-6">
          <div className="flex-1 min-w-0">
            <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-[0.14em] text-white/85">
              <span aria-hidden className="inline-flex h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              Ganancias hoy
            </p>
            <div className="mt-2.5 flex items-baseline gap-2 flex-wrap">
              <span className="text-[length:clamp(2.75rem,9vw,4.5rem)] font-black tabular-nums leading-[0.95] tracking-tight drop-shadow-sm">
                S/ {loading ? "—" : earned.toFixed(2)}
              </span>
              {goalReached && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white text-[var(--accent)] px-3 py-1.5 text-[length:var(--ts-xs)] font-black uppercase tracking-wider shadow-md">
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.75} />
                  ¡Meta!
                </span>
              )}
            </div>
            <p className="mt-2 text-[length:var(--ts-base)] font-bold text-white/90">
              {totals.deliveries} {totals.deliveries === 1 ? "viaje completado" : "viajes completados"}
              {totals.tips > 0 && (
                <>
                  {" · "}<span className="text-yellow-200">S/ {Number(totals.tips).toFixed(2)} en propinas</span>
                </>
              )}
            </p>
          </div>
          <Link
            href="/delivery-app/ganancias"
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border-2 border-white/25 px-4 sm:px-5 h-11 text-[length:var(--ts-sm)] font-extrabold text-white hover:bg-white/25 hover:border-white/40 transition-all active:scale-95 self-start"
            aria-label="Ver detalle de ganancias"
          >
            Ver detalle
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
        </div>

        {/* Progress bar hacia la meta */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-white/75">
              Meta de hoy
            </span>
            <span className="text-[length:var(--ts-sm)] font-extrabold tabular-nums text-white">
              {goalReached ? (
                <span className="inline-flex items-center gap-1.5">
                  +S/ {(earned - goal).toFixed(2)} extra
                  <Flame className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                </span>
              ) : (
                <>S/ {remaining.toFixed(2)} para S/ {goal}</>
              )}
            </span>
          </div>
          <div className="relative h-2.5 rounded-full bg-white/15 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white transition-all duration-700 ease-out shadow-md"
              style={{ width: `${pctGoal}%` }}
            />
            {goalReached && (
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_ease-in-out_infinite]"
              />
            )}
          </div>
          <p className="mt-2 text-[length:var(--ts-xs)] font-semibold tabular-nums text-white/80">
            {pctGoal.toFixed(0)}% completado
          </p>
        </div>

        {/* Mini stats inline: viajes · horas · promedio por viaje */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <MiniStat
            icon={<MotoIcon className="h-4 w-4" />}
            value={String(totals.deliveries)}
            label="viajes"
          />
          <MiniStat
            icon={<TimerIcon className="h-4 w-4" />}
            value={isOnline && onlineMs > 0 ? formatHours(onlineMs) : "—"}
            label="online hoy"
          />
          <MiniStat
            icon={<CashIcon className="h-4 w-4" />}
            value={
              totals.deliveries > 0
                ? `S/${(earned / totals.deliveries).toFixed(0)}`
                : "—"
            }
            label="por viaje"
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }
      `}</style>
    </section>
  );
}

function MiniStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-white/12 backdrop-blur-sm border border-white/15 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-white/80 mb-1">
        {icon}
        <span className="text-[length:var(--ts-2xs,0.6875rem)] font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-[length:var(--ts-lg)] font-black tabular-nums text-white leading-none">
        {value}
      </p>
    </div>
  );
}
