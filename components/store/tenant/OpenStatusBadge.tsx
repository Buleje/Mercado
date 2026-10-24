"use client";

/**
 * OpenStatusBadge — pastilla "Abierto ahora · cierra 10:00 pm" / "Cerrado · abre
 * lun 7:00 am" (Brandon 2026-06-26, Modo Creativo > Automatización). Calcula el
 * estado con la hora de Lima (America/Lima) sobre los horarios que el dueño ya
 * carga en Contacto. Client-only (la hora corre en vivo); no renderiza hasta
 * hidratar para evitar mismatch.
 */
import { useEffect, useState } from "react";
import { Clock } from "@buleje/design-system/icons";

type Schedule = Record<string, { open: string; close: string }>;
const ORDEN = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const ABREV: Record<string, string> = { lunes: "lun", martes: "mar", miercoles: "mié", jueves: "jue", viernes: "vie", sabado: "sáb", domingo: "dom" };
const EN_A_ES: Record<string, string> = { monday: "lunes", tuesday: "martes", wednesday: "miercoles", thursday: "jueves", friday: "viernes", saturday: "sabado", sunday: "domingo" };

function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function pretty(hhmm: string): string {
  const min = toMin(hhmm);
  if (min == null) return hhmm;
  let h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
function limaNow(): { day: string; minutes: number } {
  const d = new Date();
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "long" }).format(d).toLowerCase();
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const [h, m] = hm.split(":").map(Number);
  return { day: EN_A_ES[wd] ?? "lunes", minutes: (h || 0) * 60 + (m || 0) };
}

type Exception = { date: string; label: string; closed: boolean };
function limaDateKey(): string {
  // YYYY-MM-DD en hora de Lima (en-CA da ese formato).
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

interface Status { open: boolean; label: string; sub: string }
function computeStatus(schedules: Schedule, exceptions?: Exception[]): Status | null {
  // Excepciones de horario (Lote C): un feriado/fecha especial pisa el horario.
  const exc = (exceptions || []).find((e) => e?.date === limaDateKey());
  if (exc) {
    if (exc.closed) return { open: false, label: exc.label || "Cerrado hoy", sub: "" };
    if (exc.label) return { open: true, label: "Abierto", sub: exc.label };
  }
  if (!schedules || typeof schedules !== "object") return null;
  const { day, minutes } = limaNow();
  const todayIdx = ORDEN.indexOf(day);
  if (todayIdx < 0) return null;

  const today = schedules[day];
  const o = today ? toMin(today.open) : null;
  const c = today ? toMin(today.close) : null;
  if (o != null && c != null) {
    const abierto = c > o ? minutes >= o && minutes < c : minutes >= o || minutes < c; // cruza medianoche
    if (abierto) return { open: true, label: "Abierto ahora", sub: `cierra ${pretty(today.close)}` };
    if (minutes < o) return { open: false, label: "Cerrado", sub: `abre hoy ${pretty(today.open)}` };
  }
  // Buscar el próximo día con horario (1..7 días adelante)
  for (let i = 1; i <= 7; i++) {
    const k = ORDEN[(todayIdx + i) % 7];
    const s = schedules[k];
    if (s && toMin(s.open) != null) {
      return { open: false, label: "Cerrado", sub: `abre ${ABREV[k]} ${pretty(s.open)}` };
    }
  }
  return { open: false, label: "Cerrado", sub: "" };
}

export default function OpenStatusBadge({ schedules, exceptions }: { schedules: Schedule; exceptions?: Exception[] }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const tick = () => setStatus(computeStatus(schedules, exceptions));
    tick();
    const id = setInterval(tick, 60000); // refresca cada minuto
    return () => clearInterval(id);
  }, [schedules, exceptions]);

  if (!status) return null;

  return (
    <span
      data-pb="open-status"
      className="inline-flex items-center gap-2 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm font-bold text-[var(--text-primary)] shadow-sm"
    >
      <span className={`relative flex h-2.5 w-2.5 shrink-0 ${status.open ? "" : "opacity-90"}`} aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full" style={{ background: status.open ? "var(--data-success-500)" : "var(--data-error-500)" }} />
        {status.open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "var(--data-success-500)" }} />}
      </span>
      <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={2.25} aria-hidden />
      {status.label}
      {status.sub && <span className="font-medium text-[var(--text-tertiary)]">· {status.sub}</span>}
    </span>
  );
}
