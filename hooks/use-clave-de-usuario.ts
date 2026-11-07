"use client";

/**
 * La clave de `localStorage` de ESTA persona en ESTE negocio:
 * `<prefijo>:<negocio>:<usuario>`. Para lo que cada uno guarda para sí
 * (recientes del panel, vistas guardadas): dos cajeros en la misma
 * computadora no ven lo del otro, y el dueño que entra a dos negocios tampoco
 * los mezcla.
 *
 * `null` mientras no se sabe quién es (no se lee ni se escribe nada);
 * `""` sin sesión (tampoco se guarda). La sesión sale de `/api/auth/me` con la
 * misma caché de 60 s que el resto del panel: no suma pedidos.
 */

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import { logger } from "@/lib/logger";

interface Sesion {
  username?: string | null;
  tenantId?: string | null;
}

export function useClaveDeUsuario(prefijo: string): string | null {
  const [clave, setClave] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    cachedJson<Sesion>("/api/auth/me", 60_000)
      .then((s) => {
        if (!vivo) return;
        setClave(s?.username ? `${prefijo}:${s.tenantId ?? "-"}:${s.username}` : "");
      })
      .catch((err: unknown) => {
        logger.warn("[panel] no se supo quién es para guardar lo suyo", { prefijo, error: String(err) });
        if (vivo) setClave("");
      });
    return () => {
      vivo = false;
    };
  }, [prefijo]);
  return clave;
}

/** Lee JSON de `localStorage` sin romper (modo privado, cuota, JSON viejo). */
export function leerGuardado(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

/** Escribe sin romper; `false` si el navegador no dejó (modo privado, cuota llena). */
export function escribirGuardado(clave: string, valor: unknown): boolean {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (err) {
    logger.warn("[panel] no se pudo guardar en este navegador", { clave, error: String(err) });
    return false;
  }
}
