"use client";

import { useState, useEffect, startTransition } from "react";
import { Type, Sun, Moon, RotateCcw } from "@buleje/design-system/icons";
import { useTheme } from "@/contexts/theme-context";

const STORAGE_KEY = "buleje-a11y-prefs";

type A11yPrefs = {
  fontSize: number; // 0 = normal, 1 = large, 2 = extra-large
};

function loadPrefs(): A11yPrefs {
  if (typeof window === "undefined") return { fontSize: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as A11yPrefs;
  } catch { /* ignore */ }
  return { fontSize: 0 };
}

const FONT_SIZES = [
  { label: "A", class: "", title: "Normal" },
  { label: "A", class: "text-lg", title: "Grande" },
  { label: "A", class: "text-xl", title: "Extra grande" },
];

export default function AccessibilityBar() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11yPrefs>({ fontSize: 0 });
  const [mounted, setMounted] = useState(false);
  const { toggle: toggleTheme } = useTheme();

  useEffect(() => {
    startTransition(() => {
      setPrefs(loadPrefs());
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));

    // Apply font size to html
    const html = document.documentElement;
    html.classList.remove("text-base", "text-lg", "text-xl");
    if (prefs.fontSize === 1) html.classList.add("text-lg");
    else if (prefs.fontSize === 2) html.classList.add("text-xl");
  }, [prefs, mounted]);

  const reset = () => {
    setPrefs({ fontSize: 0 });
    document.documentElement.classList.remove("text-lg", "text-xl");
  };

  if (!mounted) return null;

  return (
    <div className="fixed left-0 top-1/2 -translate-y-1/2 z-40 hidden sm:block">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="bg-[var(--surface-raised)] border border-border border-l-0 rounded-r-xl p-2 shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)] transition-all"
        aria-label="Opciones de accesibilidad"
        title="Accesibilidad"
      >
        <Type className="w-4 h-4 text-[var(--text-primary)]" />
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-1 bg-[var(--surface-raised)] border border-border rounded-xl shadow-[var(--shadow-xl)] p-3 w-44 space-y-3">
          <p className="text-xs font-bold text-[var(--text-primary)]">Accesibilidad</p>

          {/* Font size */}
          <div>
            <p className="text-[length:var(--ts-2xs)] text-muted uppercase tracking-wider mb-1.5">Tamaño de texto</p>
            <div className="flex gap-1">
              {FONT_SIZES.map((fs, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPrefs((p) => ({ ...p, fontSize: i }))}
                  className={`flex-1 py-1.5 rounded-lg text-center font-bold transition-colors ${
                    prefs.fontSize === i
                      ? "bg-primary text-white"
                      : "bg-gray-100 dark:bg-white/10 text-[var(--text-primary)] hover:bg-gray-200 dark:hover:bg-white/20"
                  } ${i === 0 ? "text-xs" : i === 1 ? "text-sm" : "text-base"}`}
                  title={fs.title}
                >
                  {fs.label}
                </button>
              ))}
            </div>
          </div>

          {/* Theme toggle */}
          <div>
            <p className="text-[length:var(--ts-2xs)] text-muted uppercase tracking-wider mb-1.5">Tema</p>
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg bg-gray-100 dark:bg-white/10 text-[var(--text-primary)] hover:bg-gray-200 dark:hover:bg-white/20 transition-colors text-xs font-medium"
            >
              <Sun className="w-3.5 h-3.5 dark:hidden" />
              <Moon className="w-3.5 h-3.5 hidden dark:block" />
              Cambiar tema
            </button>
          </div>

          {/* Reset */}
          <button
            type="button"
            onClick={reset}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-muted hover:text-[var(--text-primary)] transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Restaurar
          </button>
        </div>
      )}
    </div>
  );
}
