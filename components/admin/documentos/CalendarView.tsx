"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, AlarmClock } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";

/**
 * Vista calendario de vencimientos: coloca cada documento con `expiresAt` en su
 * día, coloreado por urgencia (vencido / ≤7d / ≤30d / futuro). Puro cliente,
 * usa la data que ya viene en el listado. Click en un doc → abre su preview.
 */
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function urgencyClass(days: number): string {
  if (days < 0) return "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/25 dark:text-[var(--data-error-500)] border-[var(--data-error-500)]/30";
  if (days <= 7) return "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/25 dark:text-[var(--data-warning-500)] border-[var(--data-warning-500)]/30";
  if (days <= 30) return "bg-[var(--data-warning-500)]/8 text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)] border-[var(--data-warning-500)]/15";
  return "bg-primary/12 text-[var(--accent-ink)] dark:text-[var(--accent)] dark:bg-primary/25 border-primary/25";
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarView({ docs, onOpenDoc }: { docs: DbDocument[]; onOpenDoc: (doc: DbDocument) => void }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const withExpiry = useMemo(() => docs.filter((d) => d.expiresAt), [docs]);
  const noExpiryCount = docs.length - withExpiry.length;

  // Mapa día(YYYY-MM-DD, hora LOCAL) → documentos que vencen ese día. Usamos la
  // fecha local (no el slice UTC del ISO) para que coincida con las celdas.
  const byDay = useMemo(() => {
    const m = new Map<string, DbDocument[]>();
    for (const d of withExpiry) {
      const key = ymd(new Date(d.expiresAt as string));
      const arr = m.get(key) ?? [];
      arr.push(d);
      m.set(key, arr);
    }
    return m;
  }, [withExpiry]);

  // Grilla del mes: arranca el lunes de la semana del día 1.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7; // 0=lunes
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  }, [cursor]);

  const todayKey = ymd(today);
  const monthDocsCount = useMemo(
    () => withExpiry.filter((d) => ymd(new Date(d.expiresAt as string)).slice(0, 7) === ymd(cursor).slice(0, 7)).length,
    [withExpiry, cursor],
  );

  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </CardTitle>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] tabular-nums">{monthDocsCount} vencen</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))} className="rounded-lg px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
            Hoy
          </button>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]" aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]" aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{w}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          const key = ymd(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const dayDocs = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className={cn(
                "min-h-[76px] rounded-lg border p-1 transition-colors",
                inMonth ? "border-[var(--rule-base)] bg-[var(--surface-sunken)]/40" : "border-transparent bg-transparent opacity-40",
                isToday && "ring-2 ring-primary",
              )}
            >
              <div className={cn("mb-0.5 text-right text-[length:var(--ts-2xs,11px)] font-bold tabular-nums", isToday ? "text-primary" : "text-[var(--text-tertiary)]")}>
                {day.getDate()}
              </div>
              <div className="flex flex-col gap-0.5">
                {dayDocs.slice(0, 3).map((d) => {
                  const days = Math.ceil((new Date(d.expiresAt as string).getTime() - today.getTime()) / 86_400_000);
                  return (
                    <button
                      key={d.id}
                      onClick={() => onOpenDoc(d)}
                      title={`${d.name} — ${days < 0 ? `venció hace ${-days}d` : days === 0 ? "vence hoy" : `en ${days}d`}`}
                      className={cn("flex items-center gap-1 truncate rounded border px-1 py-0.5 text-left text-[length:var(--ts-2xs,11px)] font-semibold leading-tight", urgencyClass(days))}
                    >
                      {days <= 7 && <AlarmClock className="h-2.5 w-2.5 shrink-0" />}
                      <span className="truncate">{d.name}</span>
                    </button>
                  );
                })}
                {dayDocs.length > 3 && (
                  <button onClick={() => onOpenDoc(dayDocs[3])} className="text-left text-[length:var(--ts-2xs,11px)] font-bold text-[var(--text-tertiary)] hover:text-primary">
                    +{dayDocs.length - 3} más
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[length:var(--ts-2xs,11px)] font-semibold text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[var(--data-error-500)]" /> Vencido</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)]" /> ≤ 7 días</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)]/50" /> ≤ 30 días</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Futuro</span>
        {noExpiryCount > 0 && <span className="ml-auto">{noExpiryCount} sin fecha de vencimiento</span>}
      </div>
    </div>
  );
}
