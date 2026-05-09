"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

// "system" en este proyecto significa "auto-por-horario-local" (no
// prefers-color-scheme del SO). Brandon decisión 2026-05-09.
type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

// Brandon decisión 2026-05-09: theme automático por horario LOCAL del usuario.
// - Light: 7:00am — 6:00pm
// - Dark : 6:01pm — 6:59am
// El toggle manual es OVERRIDE para esa pestaña (sessionStorage). En hard
// reload o nueva pestaña vuelve al horario.
const SESSION_KEY = "buleje-theme-session";

/** Light entre 7:00am y 6:00pm; dark fuera. Se usa en script inline + acá. */
function getThemeByTime(): Resolved {
  const d = new Date();
  const minutes = d.getHours() * 60 + d.getMinutes();
  // 7:00am = 420 min · 6:00pm = 1080 min (incl)
  return minutes < 420 || minutes > 1080 ? "dark" : "light";
}

function applyDom(resolved: Resolved) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("theme-transition");
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.colorScheme = resolved;
  window.setTimeout(() => {
    root.classList.remove("theme-transition");
  }, 220);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<Resolved>("light");
  const intervalRef = useRef<number | null>(null);

  // Hydrate: si hay override en sessionStorage usalo; sino auto por horario.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let stored: Theme = "system";
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      /* ignore */
    }
    setThemeState(stored);
    const r: Resolved = stored === "system" ? getThemeByTime() : stored;
    setResolved(r);
    applyDom(r);
  }, []);

  // En modo "system" chequeo cada minuto si el horario cambió → toggle automático.
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const tick = () => {
      const r = getThemeByTime();
      setResolved((prev) => {
        if (prev !== r) applyDom(r);
        return r;
      });
    };
    intervalRef.current = window.setInterval(tick, 60_000);
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      window.sessionStorage.setItem(SESSION_KEY, t);
    } catch {
      /* ignore */
    }
    const r: Resolved = t === "system" ? getThemeByTime() : t;
    setResolved(r);
    applyDom(r);
  }, []);

  const toggle = useCallback(() => {
    // Toggle manual = OVERRIDE temporal hasta hard reload o cambio explícito.
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
