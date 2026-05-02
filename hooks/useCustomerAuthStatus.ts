"use client";

/**
 * useCustomerAuthStatus — fuente única de verdad para "¿el cliente está
 * realmente logueado?".
 *
 * Por qué no `useCustomer().customer != null`:
 *   El customer-context se hidrata primero desde localStorage. Si una
 *   sesión vieja dejó datos en `bsm:main:customer`, el context retorna
 *   un Customer aunque la cookie `buleje-customer-sess` (httpOnly,
 *   única fuente de auth real) ya no exista. Eso provocaba que las
 *   secciones personalizadas aparecieran a usuarios deslogueados
 *   (Brandon, mayo 2026).
 *
 * Este hook llama a `/api/auth/customer/me` que valida la cookie
 * server-side. Cachea el resultado en `sessionStorage` por 60 s para
 * evitar fetches en cada navegación dentro del mismo SPA.
 */

import { useEffect, useState } from "react";

const CACHE_KEY = "buleje:auth:customer-status";
const CACHE_TTL_MS = 60 * 1000;

interface CachedStatus {
  authenticated: boolean;
  ts: number;
}

interface AuthStatus {
  /** `true` si el server reconoce la cookie. `false` si no. `null` durante el primer chequeo (loading). */
  authenticated: boolean | null;
}

function readCache(): CachedStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedStatus;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(authenticated: boolean): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ authenticated, ts: Date.now() } satisfies CachedStatus));
  } catch {
    /* sessionStorage puede fallar en modo incógnito — silencioso. */
  }
}

export function useCustomerAuthStatus(): AuthStatus {
  const [authenticated, setAuthenticated] = useState<boolean | null>(() => {
    const cached = readCache();
    return cached?.authenticated ?? null;
  });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/auth/customer/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setAuthenticated(false);
          writeCache(false);
          return;
        }
        const data = (await res.json()) as { authenticated?: boolean };
        const authed = Boolean(data.authenticated);
        setAuthenticated(authed);
        writeCache(authed);
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          writeCache(false);
        }
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  return { authenticated };
}
