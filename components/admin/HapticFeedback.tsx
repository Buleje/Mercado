"use client";
import { SectionTitle } from "@buleje/design-system";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback, ReactNode } from "react";
import { Vibrate, VolumeX, Volume2, Check, Settings } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/* ── Storage key ── */
const STORAGE_KEY = "haptic_feedback_enabled";

/* ── Hook principal ── */
export function useHaptic() {
  const [enabled, setEnabled] = useState(true);

  /* Cargar preferencia al montar */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setEnabled(JSON.parse(stored));
    } catch {
      /* silencio */
    }
  }, []);

  /* Vibrar con patrón — fallback silencioso si no hay soporte */
  const vibrate = useCallback(
    (pattern: number | number[]) => {
      if (!enabled) return;
      if (typeof navigator === "undefined") return;
      if (!("vibrate" in navigator)) return;
      try {
        navigator.vibrate(pattern);
      } catch {
        /* silencio */
      }
    },
    [enabled]
  );

  const vibrateShort = useCallback(() => vibrate(50), [vibrate]);
  const vibrateLong = useCallback(() => vibrate(200), [vibrate]);
  const vibrateDouble = useCallback(() => vibrate([50, 50, 50]), [vibrate]);
  const vibrateSuccess = useCallback(() => vibrate([50, 30, 100]), [vibrate]);
  const vibrateError = useCallback(() => vibrate([100, 50, 100, 50, 100]), [vibrate]);
  const vibrateWarning = useCallback(() => vibrate([80, 40, 80]), [vibrate]);

  const toggle = useCallback((val?: boolean) => {
    setEnabled((prev) => {
      const next = val !== undefined ? val : !prev;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isSupported =
    typeof navigator !== "undefined" && "vibrate" in navigator;

  return {
    enabled,
    isSupported,
    toggle,
    vibrateShort,
    vibrateLong,
    vibrateDouble,
    vibrateSuccess,
    vibrateError,
    vibrateWarning,
  };
}

/* ── Tipos de evento que pueden disparar vibración ── */
type HapticEvent = "click" | "success" | "error" | "warning";

type HapticPattern = "short" | "long" | "double" | "success" | "error" | "warning";

const EVENT_TO_PATTERN: Record<HapticEvent, HapticPattern> = {
  click: "short",
  success: "success",
  error: "error",
  warning: "warning",
};

/* ── Componente wrapper ── */
interface HapticWrapperProps {
  children: ReactNode;
  event?: HapticEvent;
  pattern?: HapticPattern;
  className?: string;
  disabled?: boolean;
}

export function HapticWrapper({
  children,
  event = "click",
  pattern,
  className,
  disabled = false,
}: HapticWrapperProps) {
  const haptic = useHaptic();
  const resolvedPattern = pattern ?? EVENT_TO_PATTERN[event];

  const handleClick = useCallback(() => {
    if (disabled) return;
    const fn = {
      short: haptic.vibrateShort,
      long: haptic.vibrateLong,
      double: haptic.vibrateDouble,
      success: haptic.vibrateSuccess,
      error: haptic.vibrateError,
      warning: haptic.vibrateWarning,
    }[resolvedPattern];
    fn?.();
  }, [disabled, resolvedPattern, haptic]);

  return (
    <div onClick={handleClick} className={className}>
      {children}
    </div>
  );
}

/* ── Componente principal de configuración ── */
export default function HapticFeedback() {
  const haptic = useHaptic();
  const [lastTest, setLastTest] = useState<string | null>(null);

  const test = (label: string, fn: () => void) => {
    fn();
    setLastTest(label);
    setTimeout(() => setLastTest(null), 1500);
  };

  const patterns: {
    key: string;
    label: string;
    desc: string;
    pattern: number | number[];
    fn: () => void;
  }[] = [
    {
      key: "short",
      label: "Corto",
      desc: "50ms — tap rapido",
      pattern: 50,
      fn: haptic.vibrateShort,
    },
    {
      key: "long",
      label: "Largo",
      desc: "200ms — confirmacion",
      pattern: 200,
      fn: haptic.vibrateLong,
    },
    {
      key: "double",
      label: "Doble",
      desc: "[50, 50, 50] — alerta",
      pattern: [50, 50, 50],
      fn: haptic.vibrateDouble,
    },
    {
      key: "success",
      label: "Exito",
      desc: "[50, 30, 100] — venta completada",
      pattern: [50, 30, 100],
      fn: haptic.vibrateSuccess,
    },
    {
      key: "error",
      label: "Error",
      desc: "[100, 50, 100, 50, 100] — fallo",
      pattern: [100, 50, 100, 50, 100],
      fn: haptic.vibrateError,
    },
    {
      key: "warning",
      label: "Aviso",
      desc: "[80, 40, 80] — advertencia",
      pattern: [80, 40, 80],
      fn: haptic.vibrateWarning,
    },
  ];

  /* ── Render ── */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Vibrate className="w-5 h-5 text-primary" />
        <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
          Vibracion Haptica
        </SectionTitle>
      </div>

      {/* Soporte del dispositivo */}
      {!haptic.isSupported && (
        <div className="rounded-xl border border-[var(--data-warning)] dark:border-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/10 px-4 py-3 text-sm text-[var(--data-warning)] dark:text-[var(--data-warning)]">
          Este dispositivo o navegador no soporta vibracion. El componente funciona silenciosamente.
        </div>
      )}

      {/* Toggle principal */}
      <div
        className={cn(
          "rounded-xl border p-5 flex items-center justify-between gap-4 transition-all",
          haptic.enabled
            ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
        )}
      >
        <div className="flex items-center gap-3">
          {haptic.enabled ? (
            <Volume2 className="w-6 h-6 text-primary dark:text-primary shrink-0" />
          ) : (
            <VolumeX className="w-6 h-6 text-[var(--text-tertiary)] shrink-0" />
          )}
          <div>
            <p className="font-semibold text-[var(--text-primary)] text-sm">
              {haptic.enabled ? "Vibracion activada" : "Vibracion desactivada"}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              {haptic.enabled
                ? "Los botones del POS vibran al tocarlos"
                : "Sin vibración en ningún evento"}
            </p>
          </div>
        </div>

        {/* Switch */}
        <button
          onClick={() => haptic.toggle()}
          className={cn(
            "relative w-12 h-6 rounded-full transition-colors duration-[var(--dur-base)] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
            haptic.enabled
              ? "bg-primary dark:bg-primary"
              : "bg-gray-200 dark:bg-gray-700"
          )}
          aria-label="Toggle vibración"
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-[var(--dur-base)]",
              haptic.enabled && "translate-x-6"
            )}
          />
        </button>
      </div>

      {/* Patrones de prueba */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--rule-base)] flex items-center gap-2">
          <Settings className="w-4 h-4 text-[var(--text-tertiary)]" />
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            Probar patrones de vibracion
          </p>
        </div>

        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {patterns.map(({ key, label, desc, fn }) => (
            <button
              key={key}
              onClick={() => test(label, fn)}
              disabled={!haptic.enabled || !haptic.isSupported}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                lastTest === label
                  ? "border-primary bg-primary/10 scale-95"
                  : "border-[var(--rule-base)] hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-gray-750",
                (!haptic.enabled || !haptic.isSupported) &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {label}
                </span>
                {lastTest === label && (
                  <Check className="w-3.5 h-3.5 text-primary dark:text-primary" />
                )}
              </div>
              <p className="text-xs text-[var(--text-tertiary)] font-mono">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Referencia de uso */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]/60 p-4 space-y-3">
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          Como usar en otros componentes
        </p>

        <div className="space-y-2 text-xs font-mono text-[var(--text-secondary)]">
          <div className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
            <p className="text-[var(--text-tertiary)]">{"// Hook"}</p>
            <p className="text-primary dark:text-primary">{"import { useHaptic } from './HapticFeedback';"}</p>
            <p className="mt-1">{"const { vibrateSuccess } = useHaptic();"}</p>
            <p>{"vibrateSuccess(); // al completar una venta"}</p>
          </div>

          <div className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
            <p className="text-[var(--text-tertiary)]">{"// Wrapper de componente"}</p>
            <p className="text-primary dark:text-primary">{"import { HapticWrapper } from './HapticFeedback';"}</p>
            <p className="mt-1">{"<HapticWrapper event=\"success\">"}</p>
            <p>{"  <Button>Cobrar</Button>"}</p>
            <p>{"</HapticWrapper>"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
