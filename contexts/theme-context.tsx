"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
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

  // Always force light mode — dark mode toggle is only in Settings module
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const setTheme = useCallback((_t: Theme) => {
    // no-op: theme is locked to light
  }, []);

  const toggle = useCallback(() => {
    // no-op: theme is locked to light
  }, []);

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
