"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import PinLoginModal from "./PinLoginModal";

// ── Types ──────────────────────────────────────────────────────────────────────

interface InactivityLockProps {
  children: ReactNode;
  timeout?: number;       // ms until lock (default 10 min)
  warningBefore?: number; // ms before lock to show warning (default 60s)
}

// ── Component ──────────────────────────────────────────────────────────────────

const TRACKED_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

export default function InactivityLock({
  children,
  timeout = 600_000,      // 10 minutes
  warningBefore = 60_000, // 60 seconds warning
}: InactivityLockProps) {
  const [locked, setLocked] = useState(false);
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // ── Clear all timers ─────────────────────────────────────────────────────────
  const clearTimers = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  // ── Start countdown display during warning period ────────────────────────────
  const startCountdown = useCallback((durationMs: number) => {
    setSecondsLeft(Math.ceil(durationMs / 1000));
    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Reset timers on activity ─────────────────────────────────────────────────
  const resetTimers = useCallback(() => {
    if (locked) return; // Don't reset if already locked

    lastActivityRef.current = Date.now();
    clearTimers();
    setWarning(false);
    setSecondsLeft(0);

    // Schedule warning
    const warnAt = timeout - warningBefore;
    warnTimerRef.current = setTimeout(() => {
      setWarning(true);
      startCountdown(warningBefore);
    }, Math.max(warnAt, 0));

    // Schedule lock
    lockTimerRef.current = setTimeout(() => {
      setLocked(true);
      setWarning(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }, timeout);
  }, [locked, timeout, warningBefore, clearTimers, startCountdown]);

  // ── Attach/detach event listeners ────────────────────────────────────────────
  useEffect(() => {
    const handler = () => resetTimers();

    TRACKED_EVENTS.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));
    resetTimers(); // Start initial timer

    return () => {
      TRACKED_EVENTS.forEach((evt) => window.removeEventListener(evt, handler));
      clearTimers();
    };
    // resetTimers and clearTimers are stable callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  // ── Unlock on successful PIN ─────────────────────────────────────────────────
  const handleUnlock = useCallback(() => {
    setLocked(false);
    setWarning(false);
    // resetTimers will be triggered on next user event, or we force it here
    lastActivityRef.current = Date.now();
  }, []);

  return (
    <>
      {children}

      {/* Warning banner */}
      {warning && !locked && (
        <div
          className={cn(
            "fixed bottom-4 left-1/2 -translate-x-1/2 z-40",
            "flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg",
            "bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700",
            "text-amber-800 dark:text-amber-300 text-sm font-medium",
            "animate-in slide-in-from-bottom-4 duration-300"
          )}
          role="alert"
        >
          <Clock size={16} className="shrink-0" />
          <span>
            La sesion se bloqueara en{" "}
            <strong className="tabular-nums">{secondsLeft}</strong>{" "}
            segundo{secondsLeft !== 1 ? "s" : ""} por inactividad
          </span>
          <button
            onClick={resetTimers}
            className="ml-2 text-xs underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200 transition-colors"
          >
            Seguir activo
          </button>
        </div>
      )}

      {/* Lock overlay */}
      {locked && (
        <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-md flex flex-col items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-2 text-white mb-2">
            <Clock size={40} className="text-[#2d6a4f]" />
            <h2 className="text-2xl font-bold">Sesion bloqueada</h2>
            <p className="text-gray-400 text-sm">Ingresa tu PIN para continuar</p>
          </div>
          <PinLoginModal
            onSuccess={handleUnlock}
            title="Desbloquear sesion"
          />
        </div>
      )}
    </>
  );
}
