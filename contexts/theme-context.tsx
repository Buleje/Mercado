"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  startTransition,
  type ReactNode,
} from "react";

// "auto-schedule": dark después de 18:00 (6pm), light antes de las 18:00
type Theme = "light" | "dark" | "system" | "auto" | "auto-schedule";

interface ThemeCtx {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = "bsm-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// Tema por hora (modo "auto"): oscuro desde las 19h hasta las 6am
function getTimeBasedTheme(): "light" | "dark" {
  const hour = new Date().getHours();
  return hour >= 19 || hour < 6 ? "dark" : "light";
}

// Tema por horario configurado (modo "auto-schedule"): oscuro desde las 18h (6pm)
function getScheduleBasedTheme(): "light" | "dark" {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6 ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const t = stored && ["light", "dark", "system", "auto", "auto-schedule"].includes(stored) ? stored : "light";
    startTransition(() => {
      setThemeState(t);
      setResolved(
        t === "system" ? getSystemTheme() :
        t === "auto" ? getTimeBasedTheme() :
        t === "auto-schedule" ? getScheduleBasedTheme() :
        t
      );
    });
  }, []);

  // Resolve and apply
  useEffect(() => {
    const isMobile = window.innerWidth < 640;

    const apply = () => {
      // Force light mode on mobile/small screens
      const r = isMobile
        ? "light"
        : theme === "system"
          ? getSystemTheme()
          : theme === "auto"
            ? getTimeBasedTheme()
            : theme === "auto-schedule"
              ? getScheduleBasedTheme()
              : theme;
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
    };

    apply();

    // Listen for system preference changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") apply();
    };
    mq.addEventListener("change", handler);

    // Listen for resize — if user rotates phone or resizes browser
    const resizeHandler = () => {
      const nowMobile = window.innerWidth < 640;
      if (nowMobile) {
        setResolved("light");
        document.documentElement.classList.remove("dark");
      } else {
        apply();
      }
    };
    window.addEventListener("resize", resizeHandler);

    // Auto-mode timers — verificar cada 60 segundos si cambió el horario
    let autoInterval: ReturnType<typeof setInterval> | null = null;
    if (theme === "auto" || theme === "auto-schedule") {
      autoInterval = setInterval(apply, 60_000);
    }

    return () => {
      mq.removeEventListener("change", handler);
      window.removeEventListener("resize", resizeHandler);
      if (autoInterval) clearInterval(autoInterval);
    };
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  const toggle = useCallback(() => {
    // Ciclo: light → dark → auto-schedule → light
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("auto-schedule");
    else setTheme("light");
  }, [theme, setTheme]);

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
