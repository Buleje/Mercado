"use client";

/**
 * app/admin/_hooks/useSuplantacionActiva.ts
 *
 * ¿Este panel es la «vista de tienda» del superadmin? Lo decide el SERVIDOR:
 * `/api/auth/me` trae `suplantacion.vence` sólo si la cookie es de suplantación
 * (`impersonated-by:`). La marca de localStorage la puede dejar cualquiera; la
 * franja no se fía de ella.
 *
 * Con la vista activa: cuenta los minutos que quedan (10 en total), anota tienda
 * y vencimiento (para que `session-refresh` sepa volver al superadmin) y, al
 * llegar a cero, manda a `/superadmin/tenants` con el aviso «la vista venció».
 * Comparte el `/api/auth/me` de useAdminAuth (cachedJson): no suma pedidos.
 */

import { useCallback, useEffect, useState } from "react";
import { cachedJson, invalidateCachedJson } from "@/lib/client-cache-fetch";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { clearAllTenantCache, getActiveTenantSlug } from "@/lib/tenant-cache";
import { esSuplantacion } from "@/lib/auth/suplantacion";
import {
  MARCA_SUPLANTACION,
  anotarVistaSuplantada,
  destinoSesionTerminada,
  limpiarVistaSuplantada,
} from "@/lib/auth/suplantacion-vista";

interface MeConSuplantacion {
  username?: string;
  tenantId?: string;
  suplantacion?: { vence?: number };
}

export interface SuplantacionActiva {
  activa: boolean;
  /** Minutos enteros que quedan (redondeo hacia arriba: «quedan 1 min» hasta el final). */
  minutos: number;
  saliendo: boolean;
  salir: () => void;
}

/** Cada cuánto se repinta el contador. */
const TICK_MS = 15_000;

/**
 * Termina la vista de tienda: el servidor borra la cookie y audita la salida
 * (`impersonate_exit`); acá se limpia el caché de la tienda y se vuelve al
 * superadmin. Devuelve false si el servidor no confirmó (la franja sigue).
 */
export async function salirDeVistaDeTienda(): Promise<boolean> {
  let res: Response | null = null;
  try {
    res = await fetch("/api/superadmin/impersonate/exit", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders(),
    });
  } catch (err) {
    logger.error("[suplantacion] salir falló", { error: String(err) });
  }
  if (!res?.ok) return false;
  clearAllTenantCache();
  limpiarVistaSuplantada();
  invalidateCachedJson("/api/auth/me");
  window.location.href = "/superadmin";
  return true;
}

export function useSuplantacionActiva(): SuplantacionActiva {
  const [vence, setVence] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    cachedJson<MeConSuplantacion>("/api/auth/me", 60_000)
      .then((d) => {
        const v = d?.suplantacion?.vence;
        if (!vivo || !d) return;
        // Sesión normal (2FA, alta, Google…: cualquier login): una marca de una
        // vista de tienda anterior ya no vale, se borra acá aunque el login no lo hiciera.
        if (d.username && !esSuplantacion(d.username)) {
          limpiarVistaSuplantada();
          return;
        }
        if (!esSuplantacion(d.username) || typeof v !== "number") return;
        let marca: string | null = null;
        try { marca = localStorage.getItem(MARCA_SUPLANTACION); } catch { /* modo privado */ }
        anotarVistaSuplantada(getActiveTenantSlug() ?? marca ?? d.tenantId ?? "tienda", v);
        setVence(v);
        setAhora(Date.now());
      })
      .catch((err: unknown) => logger.warn("[suplantacion] /api/auth/me falló", { error: String(err) }));
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (vence === null) return;
    const id = setInterval(() => setAhora(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [vence]);

  // Al llegar a cero: de vuelta al superadmin con el aviso (no al login del panel).
  useEffect(() => {
    if (vence !== null && ahora >= vence) window.location.href = destinoSesionTerminada();
  }, [vence, ahora]);

  const salir = useCallback(() => {
    setSaliendo(true);
    void salirDeVistaDeTienda().then((ok) => { if (!ok) setSaliendo(false); });
  }, []);

  return {
    activa: vence !== null,
    minutos: vence === null ? 0 : Math.max(0, Math.ceil((vence - ahora) / 60_000)),
    saliendo,
    salir,
  };
}
