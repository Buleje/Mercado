"use client";

/**
 * El aviso de la agenda en ESTE celular por Web Push (Brandon 20-10): si este
 * navegador ya lo tiene, prenderlo, mandar uno de prueba y apagarlo. Cada
 * acción guarda al tocar y avisa con un toast (no espera el «Guardar» del modal).
 *
 * La suscripción del navegador es la misma que la de las cámaras
 * (`lib/push/avisos-navegador.ts`): apagar acá sólo saca este celular de la
 * lista de la agenda, no lo desuscribe (las cámaras seguirían avisando).
 *
 * API: `/api/admin/agenda/celular`.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { idDeEndpoint } from "@/lib/camaras/avisar-push";
import { hayPush, suscribirEsteNavegador, suscripcionActual } from "@/lib/push/avisos-navegador";
import type { DispositivoAgendaVisible } from "@/lib/agenda/push-agenda";

const API = "/api/admin/agenda/celular";

interface Datos {
  clavePublica: string | null;
  mios: DispositivoAgendaVisible[];
  puedePrender: boolean;
}

const MOTIVOS: Record<string, string> = {
  sin_claves: "El servidor no tiene las claves de avisos (VAPID): pídeselas al soporte.",
  datos_invalidos: "Este navegador dio una suscripción que el servidor no acepta.",
  not_found: "Este celular ya no tenía el aviso.",
  suplantacion: "La vista de tienda no puede prender avisos en un celular.",
  muerto: "Este celular ya no acepta avisos: toca «Avisarme en este celular» otra vez.",
  no_salio: "El servicio de avisos no respondió. Reintenta en un rato.",
};

/** La ruta manda un código (`error` o `motivo`) y a veces una frase lista (`motivo` del tope). */
async function leerError(res: Response): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { error?: string; motivo?: string };
  return MOTIVOS[j.motivo ?? ""] ?? MOTIVOS[j.error ?? ""] ?? j.motivo ?? `No se pudo (error ${res.status}).`;
}

export type EstadoPushAgenda = "cargando" | "sin_soporte" | "sin_claves" | "error" | "listo";

export function usePushAgenda() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState(false);
  const [soporte, setSoporte] = useState<boolean | null>(null);
  const [esteId, setEsteId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setSoporte(hayPush());
    fetch(API, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as Datos) : Promise.reject(new Error(String(res.status)))))
      .then((d) => vivo && setDatos(d))
      .catch(() => vivo && setFallo(true));
    suscripcionActual()
      .then(async (sub) => (sub ? idDeEndpoint(sub.endpoint) : null))
      .then((id) => vivo && setEsteId(id))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  const enviar = useCallback(
    (metodo: "POST" | "DELETE", url: string, cuerpo?: object): Promise<Response> =>
      fetch(url, { method: metodo, headers: csrfHeaders({ "Content-Type": "application/json" }), body: cuerpo ? JSON.stringify(cuerpo) : undefined }),
    [],
  );

  const prender = useCallback(async () => {
    if (!datos?.clavePublica) return void toast.error(MOTIVOS.sin_claves);
    setOcupado(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        return void toast.error("El navegador no dio permiso de notificaciones. Actívalo en el candado de la barra de direcciones.");
      }
      const sub = await suscribirEsteNavegador(datos.clavePublica);
      const res = await enviar("POST", API, { subscription: sub.toJSON() });
      if (!res.ok) return void toast.error(await leerError(res));
      setDatos((await res.json()) as Datos);
      setEsteId(await idDeEndpoint(sub.endpoint));
      toast.success("Listo: este celular te avisa a la hora de cada actividad");
    } catch (err) {
      toast.error(`Este navegador no se pudo suscribir (${String((err as Error)?.message ?? err).slice(0, 80)}).`);
    } finally {
      setOcupado(false);
    }
  }, [datos?.clavePublica, enviar]);

  const probar = useCallback(async () => {
    setOcupado(true);
    try {
      const res = await enviar("POST", `${API}?prueba=1`);
      const j = (await res.clone().json().catch(() => ({}))) as { enviados?: number; motivo?: string };
      if (!res.ok) {
        toast.error(await leerError(res));
        // «muerto» = el servicio dio de baja TODOS mis celulares y el servidor ya los sacó: la fila dice «Apagado».
        if (j.motivo === "muerto") setDatos((d) => (d ? { ...d, mios: [] } : d));
        return;
      }
      toast.success(j.enviados === 1 ? "Prueba enviada: tiene que llegar en unos segundos" : `Prueba enviada a tus ${j.enviados ?? 0} celulares`);
    } finally {
      setOcupado(false);
    }
  }, [enviar]);

  const apagar = useCallback(async () => {
    if (!esteId) return;
    setOcupado(true);
    try {
      const res = await enviar("DELETE", API, { id: esteId });
      if (!res.ok) return void toast.error(await leerError(res));
      setDatos((await res.json()) as Datos);
      toast.success("Aviso apagado en este celular");
    } finally {
      setOcupado(false);
    }
  }, [enviar, esteId]);

  const estado: EstadoPushAgenda =
    soporte === false ? "sin_soporte" : fallo ? "error" : !datos || soporte === null ? "cargando" : !datos.clavePublica ? "sin_claves" : "listo";
  const prendido = !!esteId && !!datos?.mios.some((d) => d.id === esteId);
  return {
    estado,
    prendido,
    otros: (datos?.mios.length ?? 0) - (prendido ? 1 : 0),
    puedePrender: datos?.puedePrender ?? false,
    ocupado,
    prender,
    probar,
    apagar,
  };
}
