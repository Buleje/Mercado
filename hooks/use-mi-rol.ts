"use client";

/**
 * El rol de quien está logueado — para ocultar acciones que el servidor de
 * todos modos rechazaría (ADR-413: liquidar/anular sólo admin y dueño; 2026-09-14
 * también lo usan los componentes que gatean sus propios fetches con
 * `puedePedir`, lib/auth/roles-rutas-panel.ts). No es el gate de seguridad
 * —eso lo hace `requireAdmin` en la API— es sólo para no mostrar un botón o
 * disparar un fetch que va a terminar en un 403.
 *
 * `cachedJson` en vez de `fetch` directo: `useAdminAuth` ya pide
 * `/api/auth/me` con el mismo TTL — varios componentes usando este hook a la
 * vez comparten 1 sola request en vuelo en vez de una por componente.
 */

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import type { AdminRole } from "@/lib/session";

export function useMiRol(): AdminRole | null {
  const [rol, setRol] = useState<AdminRole | null>(null);

  useEffect(() => {
    cachedJson<{ role?: AdminRole | null }>("/api/auth/me", 60_000)
      .then((d) => setRol(d?.role ?? null))
      .catch(() => setRol(null));
  }, []);

  return rol;
}
