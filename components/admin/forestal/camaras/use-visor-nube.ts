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
import {
  capturarCuadro,
  cargarReproductor,
  destruir,
  idSeguro,
  medidaQueEntra,
  sonar,
} from "./reproductor-nube";

export type Calidad = "hd" | "sd";
export type Modo = { tipo: "vivo" } | { tipo: "grabacion"; desde: string; hasta: string };
/** `detenido` = el mosaico lo pausó (`activo: false`); `cortado` = su propio corte de 5 min. */
export type EstadoVisor = "pidiendo" | "cargando" | "viendo" | "error" | "cortado" | "detenido";

export interface OpcionesVisor {
  /** `false` = no pedir nada y soltar el reproductor (el mosaico cortado por inactividad). */
  activo?: boolean;
  /** Espera antes de pedir: el mosaico escalona sus cuadros (Hikvision: 5 pedidos/s). */
  retrasoMs?: number;
  /**
   * Con esto, el corte de 5 min lo lleva quien lo pasa (el mosaico: UN reloj
   * para todos sus cuadros) y cada toque se le avisa a él.
   */
  onActividad?: () => void;
}

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

export function useVisorNube(camaraId: string, opciones: OpcionesVisor = {}) {
  const { activo = true, retrasoMs = 0, onActividad } = opciones;
  const contenedorId = idSeguro(useId());
  /** El marco = video + controles encima: es lo que va a pantalla completa. */
  const marcoId = `${contenedorId}-marco`;
  const [calidad, setCalidad] = useState<Calidad>("sd");
  const [modo, setModo] = useState<Modo>({ tipo: "vivo" });
  const [estado, setEstado] = useState<EstadoVisor>("pidiendo");
  const [error, setError] = useState<string | null>(null);
  /* Cambia para volver a pedir todo (Reintentar / Seguir viendo). */
  const [intento, setIntento] = useState(0);
  /** Sonido del vivo: arranca apagado (no asustar a nadie con el patio a todo volumen). */
  const [sonido, setSonido] = useState(false);
  const [teatro, setTeatro] = useState(false);
  const [enPantallaCompleta, setEnPantallaCompleta] = useState(false);
  const player = useRef<EZUIKitPlayer | null>(null);
  const corte = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cortar = useCallback(() => {
    destruir(player.current, document.getElementById(contenedorId));
    player.current = null;
    setEstado("cortado");
  }, [contenedorId]);

  const externa = useRef(onActividad);
  useEffect(() => {
    externa.current = onActividad;
  }, [onActividad]);

  /** Cada toque en el visor o sus controles reinicia la cuenta de los 5 min. */
  const actividad = useCallback(() => {
    if (externa.current) {
      externa.current();
      return;
    }
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
    setError(null);
    if (!activo) {
      if (corte.current) clearTimeout(corte.current);
      setEstado("detenido");
      return;
    }
    setEstado("pidiendo");
    setSonido(false);
    actividad();

    (async () => {
      if (retrasoMs > 0) await new Promise((r) => setTimeout(r, retrasoMs));
      if (!vivo) return;
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
        Reproductor = await cargarReproductor();
      } catch {
        if (!vivo) return;
        setError("No se pudo cargar el reproductor de Hikvision. Recarga la página.");
        setEstado("error");
        return;
      }
      const caja = document.getElementById(contenedorId);
      if (!vivo || !caja) return;
      const medida = medidaQueEntra(caja.clientWidth || 640, caja.clientHeight);
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
          width: medida.ancho,
          height: medida.alto,
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
  }, [camaraId, calidad, claveModo, intento, contenedorId, actividad, activo, retrasoMs]);

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
      const m = medidaQueEntra(caja.clientWidth, caja.clientHeight);
      if (m.ancho > 0) player.current?.resize?.(m.ancho, m.alto);
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

  /* Pantalla completa del MARCO (video + controles), no la de EZUIKit: así el
     joystick y la alarma siguen a mano. Si el navegador no deja (iPhone), la
     de EZUIKit. */
  useEffect(() => {
    const cambio = () => setEnPantallaCompleta(document.fullscreenElement?.id === marcoId);
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, [marcoId]);

  const pantallaCompleta = useCallback(() => {
    actividad();
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    const marco = document.getElementById(marcoId);
    const p = player.current;
    if (marco?.requestFullscreen) {
      marco.requestFullscreen().catch(() => p?.fullScreen?.());
    } else if (p?.fullScreen) {
      Promise.resolve(p.fullScreen()).catch((err: unknown) =>
        logger.warn("[camaras] pantalla completa no disponible", { error: String(err) }),
      );
    }
  }, [actividad, marcoId]);

  const alternarTeatro = useCallback(() => {
    actividad();
    setTeatro((t) => !t);
  }, [actividad]);

  const alternarSonido = useCallback(async () => {
    actividad();
    const ok = await sonar(player.current, !sonido);
    if (ok) setSonido(!sonido);
    else setError("El reproductor no dejó cambiar el sonido.");
  }, [actividad, sonido]);

  const foto = useCallback(() => {
    actividad();
    const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    Promise.resolve(player.current?.capturePicture?.(`camara-${sello}`)).catch(() =>
      setError("No se pudo sacar la foto del video."),
    );
  }, [actividad]);

  /** El cuadro que se ve, en base64, para «Analizar». */
  const tomarCuadro = useCallback(() => {
    actividad();
    return capturarCuadro(player.current, document.getElementById(contenedorId));
  }, [actividad, contenedorId]);

  return {
    contenedorId,
    marcoId,
    sonido,
    alternarSonido,
    teatro,
    alternarTeatro,
    enPantallaCompleta,
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
    tomarCuadro,
  };
}

export type VisorNubeEstado = ReturnType<typeof useVisorNube>;
