"use client";

/**
 * El reloj de inactividad del mosaico (ADR-471): UNO para todos los cuadros.
 * Cada toque en cualquier cuadro lo reinicia; a los 5 min sin tocar, pausa a
 * todos juntos (cada cuadro suelta su reproductor) y «Seguir viendo» los
 * vuelve a pedir. Cada cuadro sigue con su propio «Reintentar» si falla.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { refrescarSesion } from "@/lib/auth/session-refresh";
import { logger } from "@/lib/logger";
import { KEEPALIVE_PING_EVENT } from "@/lib/session-keepalive";
import { MINUTOS_SIN_TOCAR } from "./hik-connect-teams";

/** Con «No pausar»: cada cuánto se renueva la sesión (el access dura 15 min). */
const RENOVAR_SESION_MS = 4 * 60_000;

/** Entre un pedido y el siguiente: Hikvision corta a más de 5 pedidos por segundo. */
export const RETRASO_ENTRE_CUADROS_MS = 600;

/** «el doble», «el triple»… para el aviso de batería y datos. */
export function vecesMas(n: number): string {
  if (n <= 2) return "el doble";
  if (n === 3) return "el triple";
  return `${n} veces más`;
}

/**
 * `sinPausa` = «No pausar» del mosaico: el reloj no corre (y deja de correr si
 * ya corría). Cuidado con los datos del chip: `DATOS_POR_HORA` por cámara.
 */
export function useMosaicoNube({ sinPausa = false }: { sinPausa?: boolean } = {}) {
  const [cortado, setCortado] = useState(false);
  const corte = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sinPausaRef = useRef(sinPausa);

  const actividad = useCallback(() => {
    if (corte.current) clearTimeout(corte.current);
    corte.current = null;
    if (sinPausaRef.current) return;
    corte.current = setTimeout(() => setCortado(true), MINUTOS_SIN_TOCAR * 60_000);
  }, []);

  useEffect(() => {
    sinPausaRef.current = sinPausa;
    if (!cortado) actividad();
    return () => {
      if (corte.current) clearTimeout(corte.current);
    };
  }, [cortado, actividad, sinPausa]);

  /* «No pausar» vigila sin que nadie toque el panel: sin esto, a los 30 min el
     guardián de sesión cierra el panel y el detector se queda sin sesión. Se
     renueva por la puerta única (con su piso de 3 min) y se avisa actividad. */
  useEffect(() => {
    if (!sinPausa || cortado) return;
    const renovar = () => {
      void refrescarSesion({ motivo: "camaras-no-pausar" })
        .then((ok) => {
          if (ok) window.dispatchEvent(new CustomEvent(KEEPALIVE_PING_EVENT, { detail: Date.now() }));
        })
        .catch((err: unknown) =>
          logger.warn("[camaras] no se pudo renovar la sesión del mosaico", { error: String(err) }),
        );
    };
    renovar();
    const reloj = setInterval(renovar, RENOVAR_SESION_MS);
    return () => clearInterval(reloj);
  }, [sinPausa, cortado]);

  const seguir = useCallback(() => setCortado(false), []);
  return { cortado, actividad, seguir };
}
