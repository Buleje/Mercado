"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);
// Brandon decisión 2026-05-02: cada page-load arranca SIEMPRE en light
// independientemente del sistema o de la elección previa. El toggle se
// preserva durante la SPA-session vía sessionStorage (sobrevive a
// navegación cliente Next App Router) pero se reinicia en hard reload
// y nuevas pestañas.
const SESSION_KEY = "buleje-theme-session";

function getSystemTheme(): Resolved {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyDom(resolved: Resolved) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Smooth theme transition — adds transition class 200ms, then removes to avoid
  // interfering with page animations. See globals.css `.theme-transition` rule.
  root.classList.add("theme-transition");
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.colorScheme = resolved;
  window.setTimeout(() => {
    root.classList.remove("theme-transition");
  }, 220);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default light SIEMPRE — no respeta system ni localStorage al cargar.
  const [theme, setThemeState] = useState<Theme>("light");
  const [resolved, setResolved] = useState<Resolved>("light");

  // Hydrate desde sessionStorage (sobrevive a navegación SPA pero se
  // reinicia en hard reload — exactamente lo que Brandon pidió).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let stored: Theme = "light";
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") {
        stored = raw;
      }
    } catch {
      /* ignore */
    }
    setThemeState(stored);
    const r: Resolved = stored === "system" ? getSystemTheme() : stored;
    setResolved(r);
    applyDom(r);
  }, []);

  // React to system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r: Resolved = mql.matches ? "dark" : "light";
      setResolved(r);
      applyDom(r);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    // sessionStorage en vez de localStorage — la elección dura solo lo
    // que la pestaña esté abierta. En hard reload vuelve a light.
    try {
      window.sessionStorage.setItem(SESSION_KEY, t);
    } catch {
      /* ignore */
    }
    const r: Resolved = t === "system" ? getSystemTheme() : t;
    setResolved(r);
    applyDom(r);
  }, []);

  const toggle = useCallback(() => {
    // Toggle simple light ↔ dark (sin "system" — Brandon prefirió binary).
    setTheme(theme === "dark" ? "light" : "dark");
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
