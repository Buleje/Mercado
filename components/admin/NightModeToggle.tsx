"use client";
import { SectionTitle } from "@buleje/design-system";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from "react";
import { Moon, Sun, SunMoon, Monitor } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/* ── Constantes ── */
const STORAGE_KEY = "night_mode_prefs";
const NIGHT_HOURS_START = 19; // 7pm
const NIGHT_HOURS_END = 7;    // 7am

type ModeOverride = "auto" | "night" | "day";

interface NightPrefs {
  override: ModeOverride;
  fontSize: "normal" | "large";
}

/* ── Helpers ── */
function isNightHour(): boolean {
  const h = new Date().getHours();
  return h >= NIGHT_HOURS_START || h < NIGHT_HOURS_END;
}

function applyNightClasses(active: boolean, fontSize: "normal" | "large") {
  const body = document.body;
  if (active) {
    body.classList.add("night-mode-extra");
    if (fontSize === "large") body.classList.add("night-mode-large-text");
    else body.classList.remove("night-mode-large-text");
  } else {
    body.classList.remove("night-mode-extra", "night-mode-large-text");
  }
}

/* ── Component ── */
export default function NightModeToggle() {
  const [prefs, setPrefs] = useState<NightPrefs>({ override: "auto", fontSize: "normal" });
  const [isNight, setIsNight] = useState(isNightHour());
  const [currentHour, setCurrentHour] = useState(new Date().getHours());

  /* Cargar preferencias */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setPrefs(JSON.parse(stored));
    } catch {
      /* silencio */
    }
  }, []);

  /* Refrescar hora cada minuto */
  useEffect(() => {
    const tick = () => {
      setIsNight(isNightHour());
      setCurrentHour(new Date().getHours());
    };
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  /* Calcular si el modo extra-oscuro esta activo */
  const nightActive =
    prefs.override === "night" ||
    (prefs.override === "auto" && isNight);

  /* Aplicar clases al body */
  useEffect(() => {
    applyNightClasses(nightActive, prefs.fontSize);
    return () => {
      // Cleanup al desmontar
      document.body.classList.remove("night-mode-extra", "night-mode-large-text");
    };
  }, [nightActive, prefs.fontSize]);

  /* Guardar preferencias */
  const save = useCallback((next: NightPrefs) => {
    setPrefs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setOverride = (override: ModeOverride) => save({ ...prefs, override });
  const setFontSize = (fontSize: "normal" | "large") => save({ ...prefs, fontSize });

  /* Proxima transicion */
  const nextTransition = () => {
    const h = currentHour;
    if (h >= NIGHT_HOURS_START) {
      // Noche → espera hasta las 7am del dia siguiente
      const diff = 24 - h + NIGHT_HOURS_END;
      return `Modo dia en ${diff}h`;
    } else if (h < NIGHT_HOURS_END) {
      const diff = NIGHT_HOURS_END - h;
      return `Modo dia en ${diff}h`;
    } else {
      const diff = NIGHT_HOURS_START - h;
      return `Modo noche en ${diff}h`;
    }
  };

  /* ── Render ── */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <SunMoon className="w-5 h-5 text-[#00B4A6]" />
        <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
          Modo Nocturno Automatico
        </SectionTitle>
      </div>

      {/* Estado actual */}
      <div
        className={cn(
          "rounded-xl border p-5 flex items-center gap-4 transition-all",
          nightActive
            ? "border-[var(--data-info)] dark:border-[var(--data-info)] bg-[var(--surface-sunken)]"
            : "border-[var(--data-warning)] dark:border-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/10"
        )}
      >
        <div
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
            nightActive
              ? "bg-[var(--data-info)] dark:bg-[var(--surface-sunken)]"
              : "bg-[var(--data-warning)] dark:bg-[var(--data-warning)]"
          )}
        >
          {nightActive ? (
            <Moon className="w-6 h-6 text-white" />
          ) : (
            <Sun className="w-6 h-6 text-white" />
          )}
        </div>
        <div>
          <p className="font-semibold text-[var(--text-primary)]">
            {nightActive ? "Modo nocturno activo" : "Modo diurno activo"}
          </p>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            {prefs.override === "auto"
              ? `Automatico — ${nextTransition()}`
              : prefs.override === "night"
              ? "Forzado manual (noche)"
              : "Forzado manual (dia)"}
          </p>
          {nightActive && (
            <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">
              Pantalla extra oscura, texto mas grande para reducir fatiga visual.
            </p>
          )}
        </div>
      </div>

      {/* Control de override */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 space-y-3">
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          Control manual
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { value: "auto", label: "Automatico", Icon: Monitor },
              { value: "night", label: "Siempre noche", Icon: Moon },
              { value: "day", label: "Siempre dia", Icon: Sun },
            ] as { value: ModeOverride; label: string; Icon: typeof Moon }[]
          ).map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => setOverride(value)}
              className={cn(
                "flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-medium transition-all",
                prefs.override === value
                  ? "border-[#00B4A6] bg-[#00B4A6]/5 text-[#00B4A6] dark:border-[#2dd4bf] dark:text-[#2dd4bf]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-750"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Opciones de tipografia */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 space-y-3">
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          Tamano de texto en modo nocturno
        </p>
        <div className="flex gap-2">
          {(
            [
              { value: "normal", label: "Normal" },
              { value: "large", label: "Grande (reduce fatiga)" },
            ] as { value: "normal" | "large"; label: string }[]
          ).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFontSize(value)}
              className={cn(
                "flex-1 py-2 rounded-lg border text-sm font-medium transition-colors",
                prefs.fontSize === value
                  ? "border-[#00B4A6] bg-[#00B4A6]/5 text-[#00B4A6] dark:border-[#2dd4bf] dark:text-[#2dd4bf]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-750"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Horario configurado */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]/60 p-4">
        <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2">
          Horario automatico configurado
        </p>
        <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
          <div className="flex items-center gap-1.5">
            <Moon className="w-4 h-4 text-[var(--text-secondary)]" />
            <span>Noche: 7pm — 7am</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sun className="w-4 h-4 text-[var(--data-warning)]" />
            <span>Dia: 7am — 7pm</span>
          </div>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-2">
          Hora actual: {String(currentHour).padStart(2, "0")}:00 —{" "}
          {isNight ? "Dentro del horario nocturno" : "Fuera del horario nocturno"}
        </p>
      </div>

      {/* Nota sobre CSS */}
      <p className="text-xs text-[var(--text-tertiary)] text-center">
        Agrega las clases <code className="font-mono bg-[var(--surface-sunken)] px-1 rounded">.night-mode-extra</code> y{" "}
        <code className="font-mono bg-[var(--surface-sunken)] px-1 rounded">.night-mode-large-text</code> en tu globals.css para personalizar el efecto.
      </p>
    </div>
  );
}
