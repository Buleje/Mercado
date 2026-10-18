"use client";

/**
 * app/admin/_hooks/useSuplantacionActiva.ts
 *
 * ¿Este panel es la «vista de tienda» del superadmin? Lo decide el SERVIDOR:
 * `/api/auth/me` trae `suplantacion.vence` sólo si la cookie es de suplantación
 * (`impersonated-by:`). La marca de localStorage la puede dejar cualquiera; la
 * franja no se fía de ella.
 *
 * Con la vista activa: cuenta los minutos que quedan (los que eligió el superadmin
 * al entrar, de 5 a 60; 10 por defecto: sale del `exp` del token), anota tienda
 * y vencimiento (para que `session-refresh` sepa volver al superadmin) y, al
 * llegar a cero, manda a `/superadmin/tenants` con el aviso «la vista venció».
 * Comparte el `/api/auth/me` de useAdminAuth (cachedJson): no suma pedidos.
 *
 * «+15 min» (18-10): `extender` pide al servidor un token nuevo de la misma
 * tienda (nunca más de 60 min por delante, auditado) y el contador salta al
 * vence que devolvió. Al volver a la pestaña se confirma la vista con el
 * servidor: si el superadmin cerró sesión (o se anuló la vista), el refresh da
 * 401 y `refrescarSesion` la manda al superadmin sin esperar al próximo clic.
 */

import { useCallback, useEffect, useState } from "react";
import { cachedJson, invalidateCachedJson } from "@/lib/client-cache-fetch";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { clearAllTenantCache, getActiveTenantSlug } from "@/lib/tenant-cache";
import { esSuplantacion, puedeExtenderVista } from "@/lib/auth/suplantacion";
import { refrescarSesion } from "@/lib/auth/session-refresh";
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
  /** Sumar 15 min todavía agrega al menos 1 (false = la vista ya está en el tope de 60). */
  puedeExtender: boolean;
  extendiendo: boolean;
  /** Por qué no se alargó (candado cerrado, sesión de superadmin vencida…), o null. */
  aviso: string | null;
  extender: () => void;
}

/** Cada cuánto se repinta el contador. */
const TICK_MS = 15_000;
/** Al volver a la pestaña, como mucho una confirmación con el servidor cada tanto (el refresh es MODERATE). */
const CONFIRMAR_AL_VOLVER_MS = 30_000;
/** Lo que dura a la vista el aviso de «no se pudo alargar». */
const AVISO_MS = 8_000;

/** Anota tienda y vencimiento para que `destinoSesionTerminada` sepa volver al superadmin. */
function anotarVista(vence: number, tenantId?: string): void {
  let marca: string | null = null;
  try { marca = localStorage.getItem(MARCA_SUPLANTACION); } catch { /* modo privado */ }
  anotarVistaSuplantada(getActiveTenantSlug() ?? marca ?? tenantId ?? "tienda", vence);
}

export type ResultadoExtender = { ok: true; vence: number } | { ok: false; mensaje: string };

/**
 * «+15 min»: el servidor emite el token nuevo y audita (`impersonate_extend`).
 * Devuelve el vence nuevo o el mensaje para la franja.
 */
export async function extenderVistaDeTienda(): Promise<ResultadoExtender> {
  let res: Response;
  try {
    res = await fetch("/api/superadmin/impersonate/extender", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders(),
    });
  } catch (err) {
    logger.error("[suplantacion] extender falló", { error: String(err) });
    return { ok: false, mensaje: "Sin conexión: prueba otra vez." };
  }
  const cuerpo = (await res.json().catch(() => null)) as { vence?: unknown; message?: unknown } | null;
  if (res.ok && typeof cuerpo?.vence === "number") return { ok: true, vence: cuerpo.vence };
  if (res.status === 423) return { ok: false, mensaje: "Abre el candado en el superadmin" };
  if (res.status === 429) return { ok: false, mensaje: "Muchos intentos seguidos: espera unos minutos." };
  if (typeof cuerpo?.message === "string") return { ok: false, mensaje: cuerpo.message };
  return { ok: false, mensaje: "No se pudo alargar la vista." };
}

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
  const [extendiendo, setExtendiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

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
        anotarVista(v, d.tenantId);
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

  // Salir del superadmin en otra pestaña borra esta vista (o la anula): al volver
  // acá se confirma con el servidor y, si ya no vale, el 401 del refresh la
  // manda al superadmin (destinoSesionTerminada) sin esperar a que caduque.
  useEffect(() => {
    if (vence === null) return;
    let ultima = 0;
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      const t = Date.now();
      if (t - ultima < CONFIRMAR_AL_VOLVER_MS) return;
      ultima = t;
      refrescarSesion({ forzar: true, motivo: "vista-tienda-al-volver" }).catch((err: unknown) =>
        logger.warn("[suplantacion] confirmar la vista al volver falló", { error: String(err) }),
      );
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [vence]);

  useEffect(() => {
    if (aviso === null) return;
    const id = setTimeout(() => setAviso(null), AVISO_MS);
    return () => clearTimeout(id);
  }, [aviso]);

  const salir = useCallback(() => {
    setSaliendo(true);
    void salirDeVistaDeTienda().then((ok) => { if (!ok) setSaliendo(false); });
  }, []);

  const extender = useCallback(() => {
    setExtendiendo(true);
    setAviso(null);
    void extenderVistaDeTienda().then((r) => {
      setExtendiendo(false);
      if (!r.ok) {
        setAviso(r.mensaje);
        return;
      }
      // El `/api/auth/me` cacheado trae el vence viejo: el próximo que lo pida, fresco.
      invalidateCachedJson("/api/auth/me");
      anotarVista(r.vence);
      setVence(r.vence);
      setAhora(Date.now());
    });
  }, []);

  return {
    activa: vence !== null,
    minutos: vence === null ? 0 : Math.max(0, Math.ceil((vence - ahora) / 60_000)),
    saliendo,
    salir,
    puedeExtender: vence !== null && puedeExtenderVista(vence, ahora),
    extendiendo,
    aviso,
    extender,
  };
}
