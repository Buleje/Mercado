"use client";

/**
 * HorariosModal v3 (2026-05-10) — diseño app-moderna / Rappi-like.
 *
 *  - Countdown vivo (HH:MM:SS) hasta la próxima apertura cuando está cerrada,
 *    o hasta el cierre cuando está abierta.
 *  - Strip horizontal con chips de los 7 días + mini-barra visual que muestra
 *    el rango de horas abiertas (8–20 = ~50% del día).
 *  - Card grande "HOY" con estado y próximo cambio.
 *  - CTA "Armar pedido" sticky abajo.
 */

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { Clock, ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type DayHours = { open?: string; close?: string; closed?: boolean };

interface HorariosModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeName: string;
  hours: unknown;
  isOpenNow: boolean;
  nextOpeningAt?: string | null;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
}

// Lun=0 (alineado al getDay()-1 mod 7 — el getDay() nativo arranca en Dom=0).
const DAYS: Array<{ key: string; letter: string; short: string; full: string; jsDay: number }> = [
  { key: "mon", letter: "L", short: "Lun", full: "Lunes",     jsDay: 1 },
  { key: "tue", letter: "M", short: "Mar", full: "Martes",    jsDay: 2 },
  { key: "wed", letter: "M", short: "Mié", full: "Miércoles", jsDay: 3 },
  { key: "thu", letter: "J", short: "Jue", full: "Jueves",    jsDay: 4 },
  { key: "fri", letter: "V", short: "Vie", full: "Viernes",   jsDay: 5 },
  { key: "sat", letter: "S", short: "Sáb", full: "Sábado",    jsDay: 6 },
  { key: "sun", letter: "D", short: "Dom", full: "Domingo",   jsDay: 0 },
];

function parseHM(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return h * 60 + mm;
}

/** Hook countdown: devuelve {h, m, s, expired} desde ahora hasta `targetISO`. */
function useCountdown(targetISO: string | null | undefined): {
  h: number;
  m: number;
  s: number;
  totalSeconds: number;
  expired: boolean;
} {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!targetISO) return;
    // PERF 2026-05-12 (audit Performance P0): visibility guard — no actualizar
    // si el tab está oculto. Antes ~30% CPU en background en Android.
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [targetISO]);
  if (!targetISO) return { h: 0, m: 0, s: 0, totalSeconds: 0, expired: true };
  const target = new Date(targetISO).getTime();
  const diff = Math.max(0, Math.floor((target - now) / 1000));
  return {
    h: Math.floor(diff / 3600),
    m: Math.floor((diff % 3600) / 60),
    s: diff % 60,
    totalSeconds: diff,
    expired: diff <= 0,
  };
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatNextOpeningHuman(iso?: string | null): string | null {
  if (!iso) return null;
  const next = new Date(iso);
  if (Number.isNaN(next.getTime())) return null;
  const now = new Date();
  const sameDay = next.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = next.toDateString() === tomorrow.toDateString();
  const time = next.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", hour12: true });
  if (sameDay) return `hoy a las ${time}`;
  if (isTomorrow) return `mañana a las ${time}`;
  const day = next.toLocaleDateString("es-PE", { weekday: "long" });
  return `el ${day} a las ${time}`;
}

export default function HorariosModal({
  isOpen,
  onClose,
  storeName,
  hours,
  isOpenNow,
  nextOpeningAt,
  onPrimaryAction,
  primaryActionLabel,
}: HorariosModalProps) {
  const todayJsDay = useMemo(() => new Date().getDay(), []);
  const hoursMap = useMemo(
    () => (hours && typeof hours === "object" ? (hours as Record<string, DayHours>) : {}),
    [hours],
  );
  const countdown = useCountdown(!isOpenNow ? nextOpeningAt ?? null : null);
  const nextHuman = useMemo(() => formatNextOpeningHuman(nextOpeningAt), [nextOpeningAt]);

  const today = DAYS.find((d) => d.jsDay === todayJsDay);
  const todayHours = today ? hoursMap[today.key] : undefined;
  const todayClosed = !todayHours || todayHours.closed === true;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      animation="scale"
      showCloseButton
      closeOnBackdropClick
      closeOnEscape
      className="!max-w-xl !p-0 overflow-hidden"
    >
      {/* ── Top: countdown banner sobre ink ── */}
      <div
        className={cn(
          "relative px-6 pt-6 pb-5",
          "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 backdrop-blur"
          >
            <Clock className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1 pr-10">
            {!isOpenNow && nextOpeningAt && !countdown.expired ? (
              <>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] opacity-60">
                  Hasta abrir
                </p>
                <p
                  className="font-mono tabular-nums text-3xl sm:text-4xl font-extrabold leading-none"
                  aria-live="polite"
                  aria-label={`Faltan ${countdown.h} horas ${countdown.m} minutos`}
                >
                  {pad(countdown.h)}
                  <span className="opacity-40">:</span>
                  {pad(countdown.m)}
                  <span className="opacity-40">:</span>
                  {pad(countdown.s)}
                </p>
              </>
            ) : (
              <>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] opacity-60">
                  Estado
                </p>
                <p className="text-2xl sm:text-3xl font-extrabold leading-tight">
                  {isOpenNow ? "Abierta ahora" : "Cerrada"}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Store name + status pill ── */}
      <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-3 border-b border-[var(--rule-soft)]">
        <h2
          id="modal-title"
          className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight truncate"
        >
          {storeName}
        </h2>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0",
            isOpenNow
              ? "bg-[var(--data-success-50,var(--accent-soft))] text-[var(--data-success-700,var(--accent))]"
              : "bg-[var(--data-warning-50)] text-[var(--data-warning-700)]",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isOpenNow ? "bg-[var(--data-success-600,var(--accent))] animate-pulse" : "bg-[var(--data-warning-500)]",
            )}
          />
          {isOpenNow ? "Abierta" : "Cerrada"}
        </span>
      </div>

      {/* ── Day chips strip (Rappi-style) ── */}
      <div className="px-6 pt-5 pb-2">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
          Esta semana
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map(({ key, letter, jsDay, short }) => {
            const day = hoursMap[key];
            const closed = !day || day.closed === true;
            const isToday = jsDay === todayJsDay;
            const openMin = parseHM(day?.open);
            const closeMin = parseHM(day?.close);
            // Mini barra: 24h timeline, marcamos las horas abiertas.
            const barOpen = !closed && openMin != null && closeMin != null;
            const fillStart = barOpen ? (openMin! / 1440) * 100 : 0;
            const fillEnd = barOpen ? (closeMin! / 1440) * 100 : 0;
            return (
              <div
                key={key}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl py-2.5 px-1 border-2 transition-colors",
                  isToday
                    ? "border-[var(--accent)] bg-primary/10"
                    : closed
                      ? "border-transparent bg-[var(--surface-sunken)]"
                      : "border-transparent bg-[var(--surface-raised)]",
                )}
                aria-label={`${short}: ${closed ? "Cerrado" : `${day?.open} a ${day?.close}`}`}
              >
                <span
                  className={cn(
                    "text-[length:var(--ts-xs)] font-extrabold uppercase tracking-wider",
                    isToday
                      ? "text-[var(--accent)]"
                      : closed
                        ? "text-[var(--text-tertiary)]"
                        : "text-[var(--text-primary)]",
                  )}
                >
                  {letter}
                </span>
                {/* Mini timeline 24h */}
                <span
                  aria-hidden
                  className="relative block h-1 w-full rounded-full bg-[var(--rule-soft)] overflow-hidden"
                >
                  {barOpen && (
                    <span
                      className={cn(
                        "absolute top-0 bottom-0 rounded-full",
                        isToday ? "bg-[var(--accent)]" : "bg-[var(--text-primary)]/40",
                      )}
                      style={{ left: `${fillStart}%`, width: `${Math.max(4, fillEnd - fillStart)}%` }}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[length:var(--ts-2xs)] font-bold tabular-nums leading-none",
                    closed ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]",
                  )}
                >
                  {closed ? "—" : `${day?.open?.slice(0, 2) ?? "—"}–${day?.close?.slice(0, 2) ?? "—"}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Card HOY ── */}
      <div className="px-6 pt-4 pb-2">
        <div
          className={cn(
            "rounded-2xl p-5 border-2",
            todayClosed
              ? "border-[var(--data-warning-200,var(--rule-base))] bg-[var(--data-warning-50)]"
              : "border-[var(--accent)]/30 bg-primary/10",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Hoy · {today?.full ?? ""}
              </p>
              <p
                className={cn(
                  "mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight",
                  todayClosed ? "text-[var(--data-warning-700)]" : "text-[var(--accent)]",
                )}
              >
                {todayClosed ? "Cerrado" : `${todayHours?.open} – ${todayHours?.close}`}
              </p>
              {todayClosed && nextHuman && (
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-snug">
                  Abre{" "}
                  <strong className="font-extrabold text-[var(--text-primary)]">
                    {nextHuman}
                  </strong>
                </p>
              )}
              {!todayClosed && (
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-snug">
                  Hacé tu pedido y te lo entregamos hoy mismo.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer CTA ── */}
      <div className="px-6 pt-4 pb-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
        >
          Cerrar
        </button>
        <button
          type="button"
          onClick={() => {
            if (onPrimaryAction) onPrimaryAction();
            else onClose();
          }}
          className="group inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-base font-extrabold text-white shadow-md hover:gap-2.5 hover:shadow-lg transition-all"
          style={{ backgroundColor: "var(--accent-600, var(--accent))" }}
        >
          {primaryActionLabel ?? "Armar pedido"}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.5}
            aria-hidden
          />
        </button>
      </div>
    </Modal>
  );
}
