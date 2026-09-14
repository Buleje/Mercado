"use client";

/**
 * El rol de quien está logueado — para ocultar acciones que el servidor de
 * todos modos rechazaría (ADR-413: liquidar/anular sólo admin y dueño). No es
 * el gate de seguridad —eso lo hace `requireAdmin` en la API— es sólo para no
 * mostrar un botón que va a terminar en un 403.
 */

import { useEffect, useState } from "react";

export function useMiRol(): string | null {
  const [rol, setRol] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role?: string | null } | null) => setRol(d?.role ?? null))
      .catch(() => setRol(null));
  }, []);

  return rol;
}
