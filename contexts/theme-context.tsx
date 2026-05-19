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

// "system" en este proyecto significa "default light" (Brandon decisión
// 2026-05-09 rev: el modo claro es el default permanente). El usuario
// puede activar dark explícitamente y queda guardado en sessionStorage.
type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

// Brandon decisión 2026-05-09 (rev): light por defecto siempre.
// El toggle manual es override que se guarda en sessionStorage de esa pestaña.
// Bumped a v2 cuando Brandon volvió a default light (2026-05-09 rev). Invalida
// cualquier valor de sesión anterior que pudiera tener "dark"/"system" pegado.
const SESSION_KEY = "buleje-theme-session-v2";

/** Resuelve "system" → "light" siempre (regla actual del proyecto). */
function getThemeByTime(): Resolved {
  return "light";
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
  const [theme, setThemeState] = useState<Theme>("light");
  const [resolved, setResolved] = useState<Resolved>("light");
  const intervalRef = useRef<number | null>(null);

  // Hydrate: light por defecto, pero respeta el override del usuario en
  // sessionStorage. Brandon 2026-05-16: cuando el usuario activa dark mode
  // explícitamente, debe persistir mientras dure la sesión de la pestaña
  // (no se borra en recargas dentro de la misma pestaña). El default sigue
  // siendo light — solo cambia si hay un valor explícito guardado.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let initial: Theme = "light";
    try {
      const saved = window.sessionStorage.getItem(SESSION_KEY);
      if (saved === "dark" || saved === "light" || saved === "system") {
        initial = saved;
      }
    } catch {
      /* ignore */
    }
    setThemeState(initial);
    const r: Resolved = initial === "system" ? getThemeByTime() : initial;
    setResolved(r);
    applyDom(r);
  }, []);

  // Cleanup: si quedó un interval de la version time-based anterior, limpiarlo.
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, []);

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
