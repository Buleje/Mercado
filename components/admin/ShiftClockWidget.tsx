"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ShiftEntry = {
  date: string;      // "YYYY-MM-DD"
  entry: string;     // "HH:MM"
  exit: string | null;
  hoursWorked: number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "shift-clock-log";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function calcHours(entry: string, exit: string): number {
  const [eh, em] = entry.split(":").map(Number);
  const [xh, xm] = exit.split(":").map(Number);
  return Math.max(0, (xh * 60 + xm - (eh * 60 + em)) / 60);
}

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm.toString().padStart(2, "0")}m`;
}

function dayLabel(dateStr: string): string {
  try {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

function loadLog(): ShiftEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShiftEntry[]) : [];
  } catch {
    return [];
  }
}

function saveLog(log: ShiftEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // ignorar
  }
}

function weekLog(log: ShiftEntry[]): ShiftEntry[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return log.filter((e) => new Date(e.date + "T00:00:00") >= monday).slice(-7);
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ShiftClockWidget({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [log, setLog] = useState<ShiftEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  // Reloj en tiempo real
  useEffect(() => {
    setNow(new Date());
    setMounted(true);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Cargar historial
  useEffect(() => {
    if (mounted) setLog(loadLog());
  }, [mounted]);

  const today = todayStr();
  const todayEntry = log.find((e) => e.date === today) ?? null;
  const hasEntry = todayEntry !== null;
  const hasExit = todayEntry?.exit !== null;

  const handleEntry = useCallback(() => {
    if (hasEntry) return;
    const newEntry: ShiftEntry = { date: today, entry: nowHHMM(), exit: null, hoursWorked: null };
    const next = [...log, newEntry];
    saveLog(next);
    setLog(next);
  }, [hasEntry, today, log]);

  const handleExit = useCallback(() => {
    if (!hasEntry || hasExit) return;
    const exitTime = nowHHMM();
    const next = log.map((e) => {
      if (e.date !== today) return e;
      const hours = calcHours(e.entry, exitTime);
      return { ...e, exit: exitTime, hoursWorked: hours };
    });
    saveLog(next);
    setLog(next);
  }, [hasEntry, hasExit, today, log]);

  const week = weekLog(log);
  const totalWeekHours = week.reduce((acc, e) => acc + (e.hoursWorked ?? 0), 0);

  const timeDisplay = now
    ? now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "--:--:--";

  if (!mounted) {
    return (
      <div className={cn("rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900 p-4", className)}>
        <div className="h-48 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-white dark:bg-gray-900",
        "border-[var(--rule-base)]",
        "p-4 ",
        className
      )}
      role="region"
      aria-label="Control de turno"
    >
      {/* Titulo */}
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-5 w-5 text-[#00B4A6] dark:text-[#3a8a65]" aria-hidden="true" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Reloj de Turno</h2>
      </div>

      {/* Hora actual */}
      <div
        className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3 text-center"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="font-mono text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          {timeDisplay}
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Estado actual */}
      {todayEntry && (
        <div className="mb-3 rounded-lg bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 px-3 py-2 text-sm">
          <p className="text-gray-700 dark:text-gray-200">
            Entrada: <span className="font-semibold">{todayEntry.entry}</span>
            {todayEntry.exit && (
              <>
                &nbsp;— Salida: <span className="font-semibold">{todayEntry.exit}</span>
                &nbsp;— Total: <span className="font-semibold">{fmtHours(todayEntry.hoursWorked)}</span>
              </>
            )}
          </p>
        </div>
      )}

      {/* Botones */}
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={handleEntry}
          disabled={hasEntry}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold",
            "transition-colors duration-[var(--dur-fast)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B4A6]",
            hasEntry
              ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
              : "bg-[#00B4A6] text-white hover:bg-[#235c42] dark:bg-[#00B4A6] dark:hover:bg-[#3a8a65]"
          )}
          aria-label="Marcar entrada"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Marcar Entrada
        </button>

        <button
          type="button"
          onClick={handleExit}
          disabled={!hasEntry || hasExit}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold",
            "transition-colors duration-[var(--dur-fast)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]",
            !hasEntry || hasExit
              ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
              : "bg-[#f97316] text-white hover:bg-[#e08c4a]"
          )}
          aria-label="Marcar salida"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Marcar Salida
        </button>
      </div>

      {/* Historial de la semana */}
      {week.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            Esta semana
          </h3>
          <div className="overflow-hidden rounded-lg border border-[var(--rule-base)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-400">Dia</th>
                  <th className="px-2 py-1.5 text-center font-medium text-gray-600 dark:text-gray-400">Entrada</th>
                  <th className="px-2 py-1.5 text-center font-medium text-gray-600 dark:text-gray-400">Salida</th>
                  <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-400">Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {week.map((entry) => (
                  <tr key={entry.date} className={entry.date === today ? "bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10" : ""}>
                    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{dayLabel(entry.date)}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-gray-700 dark:text-gray-300">{entry.entry}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-gray-700 dark:text-gray-300">{entry.exit ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-gray-700 dark:text-gray-300">{fmtHours(entry.hoursWorked)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <td colSpan={3} className="px-2 py-1.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Total semanal
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs font-bold text-[#00B4A6] dark:text-[#3a8a65]">
                    {fmtHours(totalWeekHours)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShiftClockWidget;
