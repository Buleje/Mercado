"use client";

/**
 * ¿Hay una sesión de la PLATAFORMA (superadmin) en este navegador?
 *
 * La cola de webhooks de Stripe es una sola para todos los negocios
 * (`StripeWebhookQueue` no tiene `tenantId`, ADR-101): el bloque de
 * Configuración › Sistema › Colas sólo se monta si el servidor confirma la
 * sesión de plataforma. Pregunta a `GET /api/superadmin/auth` (200/401, sin
 * datos de ningún negocio); el rol del panel o `localStorage` no sirven
 * porque los puede inventar el propio navegador.
 */
import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

export type SesionPlataforma = "cargando" | "si" | "no";

export function useSesionPlataforma(): SesionPlataforma {
  const [estado, setEstado] = useState<SesionPlataforma>("cargando");

  useEffect(() => {
    let vivo = true;
    fetch("/api/superadmin/auth", { credentials: "include" })
      .then((r) => {
        if (vivo) setEstado(r.ok ? "si" : "no");
      })
      .catch((err) => {
        logger.warn("[sistema/colas] no se pudo confirmar la sesión de plataforma", { error: String(err) });
        if (vivo) setEstado("no");
      });
    return () => {
      vivo = false;
    };
  }, []);

  return estado;
}
