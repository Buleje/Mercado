"use client";

/**
 * El reproductor de la nube de Hikvision (EZUIKit) dentro del panel (ADR-471).
 *
 * Pide al servidor la URL EZOPEN + el permiso de video de corta vida, carga
 * `ezuikit-js` SÓLO al abrir el visor (import dinámico: ~4 MB que el panel no
 * paga al cargar) y lo destruye al cerrar, al cambiar HD/SD o de vivo a
 * grabación, y a los 5 min sin que nadie toque: el vivo despierta la cámara
 * solar y gasta datos del chip.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { EZUIKitPlayer } from "ezuikit-js";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { rangoDeGrabacion } from "@/lib/camaras/hik-connect-api";
import { MINUTOS_SIN_TOCAR, mensajeDelReproductor } from "./hik-connect-teams";

export type Calidad = "hd" | "sd";
export type Modo = { tipo: "vivo" } | { tipo: "grabacion"; desde: string; hasta: string };
export type EstadoVisor = "pidiendo" | "cargando" | "viendo" | "error" | "cortado";

/** Cuánto se espera el primer cuadro (4G + despertar la cámara solar) antes de decir que no llegó. */
export const SEGUNDOS_SIN_VIDEO = 45;

interface RespuestaVideo {
  url: string;
  accessToken: string;
  dominio: string;
}

const esRespuesta = (j: unknown): j is RespuestaVideo => {
  const o = j as Partial<RespuestaVideo> | null;
  return (
    !!o &&
    typeof o.url === "string" &&
    typeof o.accessToken === "string" &&
    typeof o.dominio === "string"
  );
};

/** EZUIKit busca el contenedor por id (y a veces por selector): sin «:» de `useId`. */
const idSeguro = (crudo: string) => `visor-nube-${crudo.replace(/[^a-zA-Z0-9_-]/g, "")}`;

function destruir(p: EZUIKitPlayer | null, caja: HTMLElement | null) {
  if (!p) return;
  try {
    Promise.resolve(p.destroy()).catch((err: unknown) =>
      logger.warn("[camaras] el reproductor de la nube no se cerró limpio", { error: String(err) }),
    );
  } catch (err) {
    /* Destruir un reproductor que no llegó a arrancar tira: no hay nada que limpiar. */
    logger.warn("[camaras] destruir el reproductor de la nube tiró", { error: String(err) });
  }
  if (caja) caja.replaceChildren();
}

export function useVisorNube(camaraId: string) {
  const contenedorId = idSeguro(useId());
  const [calidad, setCalidad] = useState<Calidad>("sd");
  const [modo, setModo] = useState<Modo>({ tipo: "vivo" });
  const [estado, setEstado] = useState<EstadoVisor>("pidiendo");
  const [error, setError] = useState<string | null>(null);
  /* Cambia para volver a pedir todo (Reintentar / Seguir viendo). */
  const [intento, setIntento] = useState(0);
  const player = useRef<EZUIKitPlayer | null>(null);
  const corte = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cortar = useCallback(() => {
    destruir(player.current, document.getElementById(contenedorId));
    player.current = null;
    setEstado("cortado");
  }, [contenedorId]);

  /** Cada toque en el visor o sus controles reinicia la cuenta de los 5 min. */
  const actividad = useCallback(() => {
    if (corte.current) clearTimeout(corte.current);
    corte.current = setTimeout(cortar, MINUTOS_SIN_TOCAR * 60_000);
  }, [cortar]);

  const claveModo = modo.tipo === "vivo" ? "vivo" : `${modo.desde}|${modo.hasta}`;

  /* EZUIKit no siempre avisa: con un permiso vencido o la cámara dormida puede
     quedarse cargando para siempre. Pasado este tope, se dice y se ofrece reintentar. */
  useEffect(() => {
    if (estado !== "cargando") return;
    const t = setTimeout(() => {
      destruir(player.current, document.getElementById(contenedorId));
      player.current = null;
      setError(
        `La cámara no mandó video en ${SEGUNDOS_SIN_VIDEO} s: puede estar dormida, sin batería o sin señal 4G.`,
      );
      setEstado("error");
    }, SEGUNDOS_SIN_VIDEO * 1000);
    return () => clearTimeout(t);
  }, [estado, contenedorId]);

  useEffect(() => {
    const control = new AbortController();
    let vivo = true;
    setEstado("pidiendo");
    setError(null);
    actividad();

    (async () => {
      const cuerpo =
        modo.tipo === "vivo"
          ? { tipo: "vivo", calidad }
          : { tipo: "grabacion", calidad, desde: modo.desde, hasta: modo.hasta };
      let json: unknown = null;
      let ok = false;
      try {
        const r = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/en-vivo-nube`, {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(cuerpo),
          signal: control.signal,
        });
        ok = r.ok;
        json = await r.json().catch((err: unknown) => {
          logger.warn("[camaras] el video de la nube no devolvió JSON", { error: String(err) });
          return null;
        });
      } catch {
        if (control.signal.aborted) return;
      }
      if (!vivo) return;
      if (!ok || !esRespuesta(json)) {
        const m = (json as { message?: unknown } | null)?.message;
        setError(
          typeof m === "string" && m
            ? m
            : "No se pudo pedir el video a Hikvision. Revisa el internet y reintenta.",
        );
        setEstado("error");
        return;
      }
      setEstado("cargando");
      let Reproductor: typeof EZUIKitPlayer;
      try {
        ({ EZUIKitPlayer: Reproductor } = await import("ezuikit-js"));
      } catch {
        if (!vivo) return;
        setError("No se pudo cargar el reproductor de Hikvision. Recarga la página.");
        setEstado("error");
        return;
      }
      const caja = document.getElementById(contenedorId);
      if (!vivo || !caja) return;
      const ancho = caja.clientWidth || 640;
      try {
        player.current = new Reproductor({
          id: contenedorId,
          accessToken: json.accessToken,
          url: json.url,
          env: { domain: json.dominio },
          /* Sólo el video: los controles son del panel (en español y a 400 px). */
          template: "simple",
          audio: false,
          /* Decodificadores servidos desde el propio sitio (postinstall →
             public/ezuikit_static): el CDN de EZVIZ en China se colgaba. Va
             ABSOLUTA: el worker de EZUIKit ignora una ruta relativa y vuelve al CDN. */
          staticPath: `${window.location.origin}/ezuikit_static`,
          language: "en",
          width: ancho,
          height: Math.round((ancho * 9) / 16),
          handleSuccess: () => vivo && setEstado("viendo"),
          handleError: (e: unknown) => {
            if (!vivo) return;
            setError(mensajeDelReproductor(e));
            setEstado("error");
          },
        });
      } catch (e) {
        setError(mensajeDelReproductor(e));
        setEstado("error");
      }
    })();

    return () => {
      vivo = false;
      control.abort();
      destruir(player.current, document.getElementById(contenedorId));
      player.current = null;
    };
    // `modo` entra por `claveModo`: un objeto nuevo con el mismo rango no reabre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camaraId, calidad, claveModo, intento, contenedorId, actividad]);

  useEffect(
    () => () => {
      if (corte.current) clearTimeout(corte.current);
    },
    [],
  );

  /* El ancho del visor cambia (girar el celular, salir de pantalla completa). */
  useEffect(() => {
    const caja = document.getElementById(contenedorId);
    if (!caja || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      const w = caja.clientWidth;
      if (w > 0) player.current?.resize?.(w, Math.round((w * 9) / 16));
    });
    obs.observe(caja);
    return () => obs.disconnect();
  }, [contenedorId]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  const verGrabacion = useCallback((fecha: string, hora: string) => {
    const r = rangoDeGrabacion(fecha, hora, 60);
    if (!r) return false;
    setModo({ tipo: "grabacion", ...r });
    return true;
  }, []);

  const pantallaCompleta = useCallback(() => {
    actividad();
    const p = player.current;
    if (p?.fullScreen) {
      Promise.resolve(p.fullScreen()).catch(() =>
        document.getElementById(contenedorId)?.requestFullscreen?.(),
      );
    } else {
      void document.getElementById(contenedorId)?.requestFullscreen?.();
    }
  }, [actividad, contenedorId]);

  const foto = useCallback(() => {
    actividad();
    const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    Promise.resolve(player.current?.capturePicture?.(`camara-${sello}`)).catch(() =>
      setError("No se pudo sacar la foto del video."),
    );
  }, [actividad]);

  return {
    contenedorId,
    calidad,
    setCalidad,
    modo,
    volverAlVivo: () => setModo({ tipo: "vivo" }),
    verGrabacion,
    estado,
    error,
    reintentar,
    actividad,
    pantallaCompleta,
    foto,
  };
}

export type VisorNubeEstado = ReturnType<typeof useVisorNube>;
