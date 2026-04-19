"use client";

/**
 * useIsAuthenticated — detecta si el visitante tiene sesión de customer activa
 * SIN hacer fetch al server. Lee solo cookie `active-tenant` + localStorage del
 * customer por tenant.
 *
 * Úsalo en cualquier provider que sincroniza con un endpoint auth-required
 * (subscriptions, favorites, compare, order-history) para evitar spam de 401
 * en consola cuando el usuario es anónimo.
 *
 * Retorno:
 *   - null     → aún no se hidrató (render inicial SSR-safe)
 *   - true     → hay customer en localStorage + cookie de tenant
 *   - false    → visitante anónimo
 *
 * Reglas:
 *   - Solo lectura client-side — no hace fetch.
 *   - Re-evalúa en `storage` events (otra pestaña hizo login/logout).
 *   - No reemplaza la validación del server; es un "gate" optimista.
 */

import { useEffect, useState } from "react";
import { tenantKey } from "@/contexts/tenant-context";

function getTenantSlug(): string {
  if (typeof document === "undefined") return "main";
  const m = document.cookie.match(/(?:^|;\s*)active-tenant=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "main";
}

function hasLocalCustomer(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(tenantKey(getTenantSlug(), "customer"));
    if (!raw || raw === "null") return false;
    const parsed = JSON.parse(raw);
    return !!(parsed && typeof parsed === "object" && parsed.name);
  } catch {
    return false;
  }
}

export function useIsAuthenticated(): boolean | null {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(hasLocalCustomer());
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.includes("customer")) setAuthed(hasLocalCustomer());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return authed;
}

/** Versión síncrona — úsala fuera de componentes (útiles fuera de React). */
export function isAuthenticatedSync(): boolean {
  return hasLocalCustomer();
}
