"use client";

/**
 * El enlace público de solo ver de una cotización (noche 04-11): lo pide al
 * servidor una vez por cotización abierta y lo reusa para copiarlo o meterlo en
 * el mensaje de WhatsApp.
 */
import { useCallback, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export type EstadoEnlace = "quieto" | "cargando" | "copiado" | "error";

interface Guardado {
  id: string;
  url: string;
  vence: number;
}

/** Un enlace que vence en menos de una hora se pide de nuevo. */
const MARGEN_MS = 60 * 60 * 1000;

export function useEnlaceCliente(cotizacionId: string) {
  const [estado, setEstado] = useState<EstadoEnlace>("quieto");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const guardado = useRef<Guardado | null>(null);

  /** La URL del enlace, o `null` si el servidor no la dio (el mensaje queda en `mensaje`). */
  const pedir = useCallback(async (): Promise<string | null> => {
    const g = guardado.current;
    if (g && g.id === cotizacionId && g.vence - Date.now() > MARGEN_MS) return g.url;
    setEstado("cargando");
    setMensaje(null);
    try {
      const res = await fetch(`/api/cotizaciones/${encodeURIComponent(cotizacionId)}/enlace`, {
        method: "POST",
        headers: csrfHeaders(),
        credentials: "same-origin",
      });
      const data: unknown = await res.json().catch(() => null);
      const cuerpo = (data ?? {}) as { url?: unknown; venceEl?: unknown; error?: unknown };
      if (!res.ok || typeof cuerpo.url !== "string") {
        setEstado("error");
        setMensaje(typeof cuerpo.error === "string" ? cuerpo.error : "No se pudo crear el enlace. Prueba de nuevo.");
        return null;
      }
      const vence = typeof cuerpo.venceEl === "string" ? new Date(cuerpo.venceEl).getTime() : Date.now();
      guardado.current = { id: cotizacionId, url: cuerpo.url, vence };
      setEstado("quieto");
      return cuerpo.url;
    } catch {
      setEstado("error");
      setMensaje("Sin conexión: no se pudo crear el enlace.");
      return null;
    }
  }, [cotizacionId]);

  const copiar = useCallback(async (): Promise<void> => {
    const url = await pedir();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setEstado("copiado");
      setMensaje(null);
    } catch {
      // Sin permiso de portapapeles (http o navegador viejo): se muestra para copiarlo a mano.
      setEstado("error");
      setMensaje(`No se pudo copiar solo. El enlace es: ${url}`);
    }
  }, [pedir]);

  return { estado, mensaje, pedir, copiar };
}
