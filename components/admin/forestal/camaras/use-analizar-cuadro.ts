"use client";

/**
 * «Analizar» del vivo (ADR-471): saca el cuadro que se ve, lo sube por la
 * MISMA puerta que «Subir desde la galería» (`POST /api/admin/camaras/[id]/foto`,
 * que guarda, re-codifica y hace leer a la IA) marcado como del vivo, y espera
 * la lectura de la IA para mostrarla. La IA lee DESPUÉS de guardar
 * (`guardarFoto` → `after()`): por eso se mira la foto unas veces.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Captura } from "@/lib/camaras/camaras";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { API_CAMARAS } from "./camaras-ui";
import {
  capturaAnalizada,
  ESPERA_LECTURA_MS,
  formularioDeAnalisis,
  imagenDeBase64,
  INTENTOS_LECTURA,
  mensajeDeSubida,
  SEGUNDOS_ENTRE_ANALISIS,
  segundosParaAnalizar,
} from "./analizar-cuadro";

export type FaseAnalisis = "capturando" | "subiendo" | "leyendo" | "listo" | "error";

export interface EstadoAnalisis {
  fase: FaseAnalisis;
  mensaje: string | null;
  /** La foto guardada (con su lectura si la IA llegó a tiempo). */
  captura: Captura | null;
}

/** La pantalla de Cámaras recarga su lista al oírlo: la foto entró por fuera de `useCamaras`. */
export const EVENTO_FOTO_NUEVA = "camaras:foto-nueva";

/** Compartido por el visor y el mosaico: el tope es por cámara, no por ventana. */
const ultimoPorCamara = new Map<string, number>();

const dormir = (ms: number, senal: AbortSignal) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    senal.addEventListener("abort", () => {
      clearTimeout(t);
      r();
    });
  });

async function esperarLectura(
  camaraId: string,
  capturaId: string | null,
  senal: AbortSignal,
): Promise<Captura | null> {
  let ultima: Captura | null = null;
  for (let i = 0; i < INTENTOS_LECTURA; i++) {
    await dormir(ESPERA_LECTURA_MS, senal);
    if (senal.aborted) return ultima;
    try {
      const r = await fetch(`${API_CAMARAS}?camara=${encodeURIComponent(camaraId)}&limite=5`, {
        credentials: "include",
        signal: senal,
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { capturas?: Captura[] };
      const c = capturaAnalizada(j.capturas ?? [], capturaId);
      if (c) ultima = c;
      if (c?.lectura) return c;
    } catch (err) {
      if (senal.aborted) return ultima;
      logger.warn("[camaras] no se pudo leer la foto analizada", { error: String(err) });
    }
  }
  return ultima;
}

const avisarFotoNueva = (camaraId: string) =>
  window.dispatchEvent(new CustomEvent(EVENTO_FOTO_NUEVA, { detail: { camaraId } }));

export function useAnalizarCuadro(camaraId: string, tomarCuadro: () => Promise<string | null>) {
  const [estado, setEstado] = useState<EstadoAnalisis | null>(null);
  /* «Espera N s» va aparte: no tapa la lectura anterior, que sigue a la vista. */
  const [espera, setEspera] = useState<string | null>(null);
  const control = useRef<AbortController | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Cerrar el visor corta la espera (la foto ya quedó guardada). */
  useEffect(
    () => () => {
      control.current?.abort();
      if (reloj.current) clearTimeout(reloj.current);
    },
    [],
  );

  const analizar = useCallback(async () => {
    const faltan = segundosParaAnalizar(ultimoPorCamara.get(camaraId), Date.now());
    if (reloj.current) clearTimeout(reloj.current);
    if (faltan > 0) {
      setEspera(`Espera ${faltan} s: se analiza una foto cada ${SEGUNDOS_ENTRE_ANALISIS} s por cámara.`);
      reloj.current = setTimeout(() => setEspera(null), faltan * 1000);
      return;
    }
    setEspera(null);
    ultimoPorCamara.set(camaraId, Date.now());
    control.current?.abort();
    const c = new AbortController();
    control.current = c;
    const poner = (fase: FaseAnalisis, mensaje: string | null = null, captura: Captura | null = null) => {
      if (!c.signal.aborted) setEstado({ fase, mensaje, captura });
    };

    poner("capturando");
    const b64 = await tomarCuadro();
    const foto = b64 ? imagenDeBase64(b64) : null;
    if (!foto) {
      poner("error", "No se pudo sacar el cuadro del video. Espera a que se vea y vuelve a tocar «Analizar».");
      return;
    }

    poner("subiendo");
    let capturaId: string | null = null;
    try {
      const r = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/foto`, {
        method: "POST",
        headers: csrfHeaders(),
        credentials: "include",
        body: formularioDeAnalisis(foto),
        signal: c.signal,
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        capturaId?: unknown;
      };
      if (!r.ok || !j.ok) {
        poner("error", mensajeDeSubida(r.status, j.error));
        return;
      }
      capturaId = typeof j.capturaId === "string" ? j.capturaId : null;
    } catch (err) {
      if (c.signal.aborted) return;
      logger.warn("[camaras] la foto del vivo no se subió", { error: String(err) });
      poner("error", "Sin conexión con el panel: la foto no se guardó. Revisa el internet.");
      return;
    }
    avisarFotoNueva(camaraId);

    poner("leyendo");
    const captura = await esperarLectura(camaraId, capturaId, c.signal);
    if (c.signal.aborted) return;
    poner("listo", null, captura);
    /* Con la lectura ya puesta, «Fotos» la muestra leída. */
    if (captura?.lectura) avisarFotoNueva(camaraId);
  }, [camaraId, tomarCuadro]);

  const cerrar = useCallback(() => setEstado(null), []);
  const ocupado =
    estado?.fase === "capturando" || estado?.fase === "subiendo" || estado?.fase === "leyendo";

  return { estado, espera, analizar, cerrar, ocupado };
}

export type AnalisisCuadro = ReturnType<typeof useAnalizarCuadro>;
