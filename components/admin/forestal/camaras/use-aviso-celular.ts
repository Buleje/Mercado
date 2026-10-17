"use client";

/**
 * «Avisarme en el celular» de una cámara (2026-10-10): qué dispositivos
 * reciben el push, si ESTE navegador es uno, y prenderlo/apagarlo/probarlo.
 *
 * El navegador se suscribe con un service worker propio (`/sw-avisos.js`,
 * alcance `/sw-avisos/`): el de la tienda se desregistra en desarrollo y en
 * localhost, y la suscripción moriría con él. Ver el comentario del archivo.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { idDeEndpoint, type CelularVisible, type CuandoCelular } from "@/lib/camaras/avisar-push";

export type CelularDeLaLista = CelularVisible & { tuyo: boolean };

interface Datos {
  clavePublica: string | null;
  dispositivos: CelularDeLaLista[];
  puedeQuitarOtros: boolean;
}

export type MensajeCelular = { tono: "ok" | "alerta"; texto: string } | null;

const SW = "/sw-avisos.js";
const ALCANCE = "/sw-avisos/";

function bytesDeClave(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const crudo = atob((base64url + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) out[i] = crudo.charCodeAt(i);
  return out;
}

function hayPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Espera a que el service worker recién registrado quede activo (sin eso `subscribe` falla). */
async function registroActivo(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(SW, { scope: ALCANCE });
  if (reg.active) return reg;
  const w = reg.installing ?? reg.waiting;
  if (w) {
    await new Promise<void>((ok) => {
      const mirar = () => {
        if (w.state === "activated") ok();
      };
      w.addEventListener("statechange", mirar);
      mirar();
    });
  }
  return reg;
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!hayPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration(ALCANCE);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

const MOTIVOS: Record<string, string> = {
  sin_claves: "El servidor no tiene las claves de avisos (VAPID): pídeselas al soporte.",
  datos_invalidos: "Este navegador dio una suscripción que el servidor no acepta.",
  forbidden: "Ese dispositivo es de otra persona: sólo el administrador o el dueño lo quita.",
  not_found: "Ese dispositivo ya no está en la lista.",
};

async function leerError(res: Response): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { error?: string; motivo?: string };
  return j.motivo ?? MOTIVOS[j.error ?? ""] ?? `No se pudo (error ${res.status}).`;
}

export function useAvisoCelular(camaraId: string) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [esteId, setEsteId] = useState<string | null>(null);
  const [soporte, setSoporte] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeCelular>(null);
  const url = `/api/admin/camaras/${encodeURIComponent(camaraId)}/celular`;

  useEffect(() => {
    let vivo = true;
    setSoporte(hayPush());
    fetch(url, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as Datos) : null))
      .then((d) => {
        if (vivo && d) setDatos(d);
      })
      .catch(() => undefined);
    suscripcionActual()
      .then(async (sub) => (sub ? idDeEndpoint(sub.endpoint) : null))
      .then((id) => {
        if (vivo) setEsteId(id);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [url]);

  const enviar = useCallback(
    async (metodo: "PUT" | "DELETE" | "POST", cuerpo: object): Promise<Response> =>
      fetch(url, { method: metodo, headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(cuerpo) }),
    [url],
  );

  const prender = useCallback(
    async (cuando: CuandoCelular) => {
      if (!datos?.clavePublica) return setMensaje({ tono: "alerta", texto: MOTIVOS.sin_claves });
      setOcupado(true);
      setMensaje(null);
      try {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") {
          return setMensaje({
            tono: "alerta",
            texto: "El navegador no dio permiso de notificaciones. Actívalo en el candado de la barra de direcciones.",
          });
        }
        const reg = await registroActivo();
        const clave = bytesDeClave(datos.clavePublica);
        let sub = await reg.pushManager.getSubscription();
        try {
          sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
        } catch {
          /* Suscripción vieja con otra clave del servidor: se rehace una vez. */
          await sub?.unsubscribe();
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
        }
        const res = await enviar("PUT", { subscription: sub.toJSON(), cuando });
        if (!res.ok) return setMensaje({ tono: "alerta", texto: await leerError(res) });
        setDatos((await res.json()) as Datos);
        setEsteId(await idDeEndpoint(sub.endpoint));
        setMensaje({ tono: "ok", texto: "Listo: este dispositivo recibe los avisos de esta cámara." });
      } catch (err) {
        setMensaje({ tono: "alerta", texto: `Este navegador no se pudo suscribir (${String((err as Error)?.message ?? err).slice(0, 80)}).` });
      } finally {
        setOcupado(false);
      }
    },
    [datos?.clavePublica, enviar],
  );

  const quitar = useCallback(
    async (id: string) => {
      setOcupado(true);
      setMensaje(null);
      try {
        const res = await enviar("DELETE", { id });
        if (!res.ok) return setMensaje({ tono: "alerta", texto: await leerError(res) });
        setDatos((await res.json()) as Datos);
      } finally {
        setOcupado(false);
      }
    },
    [enviar],
  );

  const probar = useCallback(async () => {
    if (!esteId) return;
    setOcupado(true);
    setMensaje(null);
    try {
      const res = await enviar("POST", { id: esteId });
      setMensaje(
        res.ok
          ? { tono: "ok", texto: "Prueba enviada: tiene que aparecer en unos segundos." }
          : { tono: "alerta", texto: await leerError(res) },
      );
    } finally {
      setOcupado(false);
    }
  }, [enviar, esteId]);

  const este = datos?.dispositivos.find((d) => d.id === esteId) ?? null;
  return { datos, soporte, este, ocupado, mensaje, prender, quitar, probar };
}
