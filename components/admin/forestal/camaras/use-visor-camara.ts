"use client";

/**
 * El video fluido del visor (ADR-421), en tres escalones.
 *
 * El servidor puede convertir el RTSP de la cámara a HLS con ffmpeg, pero eso
 * no siempre se puede (no hay ffmpeg, ya hay cuatro cámaras abiertas en esa
 * máquina, la cámara no entregó video a tiempo). Por eso el visor pregunta
 * primero y recién después decide qué mostrar:
 *
 *  1. **HLS nativo** — Safari y varios navegadores reproducen un `.m3u8`
 *     poniéndolo en el `src` del `<video>`, sin ninguna librería.
 *  2. **hls.js** — el resto necesita la librería, que se baja de un CDN.
 *  3. **Fotos encadenadas** — el camino que siempre funciona. No es el premio
 *     consuelo: es una forma legítima de mirar el patio.
 *
 * Soltar el video al irse no es opcional: mientras el reproductor siga pidiendo
 * pedazos, el `ffmpeg` del servidor sigue corriendo y la cámara gasta una de
 * sus pocas conexiones simultáneas. Dos pestañas olvidadas y el operario no la
 * puede ver desde el celular.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { logger } from "@/lib/logger";

/** De dónde se baja hls.js cuando el navegador no sabe HLS por su cuenta. */
const CDN_HLS = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js";

export type DisponibilidadVideo =
  | { fase: "consultando" }
  | { fase: "hay"; lista: string }
  | { fase: "no"; motivo: string };

/**
 * ¿Esta instalación puede dar video de esta cámara?
 *
 * Se pregunta una vez al montar. La respuesta puede tardar: el servidor espera
 * a que ffmpeg escriba el primer pedazo antes de decir que sí. Mientras tanto
 * el visor ya está mostrando fotos, así que la espera no se ve.
 */
export function useDisponibilidadDeVideo(camaraId: string): DisponibilidadVideo {
  const [estado, setEstado] = useState<DisponibilidadVideo>({ fase: "consultando" });

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: "consultando" });
    void (async () => {
      try {
        const r = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/vivo`, {
          credentials: "include",
        });
        const j = (await r.json().catch(() => ({}))) as {
          disponible?: boolean; lista?: string; motivo?: string; error?: string;
        };
        if (!vivo) return;
        /* El motivo ya viene redactado para mostrarlo tal cual: no se reescribe. */
        if (j.disponible && j.lista) setEstado({ fase: "hay", lista: j.lista });
        else setEstado({ fase: "no", motivo: j.motivo ?? j.error ?? "Esta cámara no da video fluido." });
      } catch (e) {
        if (!vivo) return;
        logger.error("[camaras] no se pudo consultar el video en vivo", { error: String(e) });
        setEstado({ fase: "no", motivo: "No se pudo preguntar por el video: se ven las fotos." });
      }
    })();
    return () => { vivo = false; };
  }, [camaraId]);

  return estado;
}

/* ── hls.js, bajado a demanda ─────────────────────────────────────────────── */

interface HlsInstancia {
  loadSource(url: string): void;
  attachMedia(video: HTMLMediaElement): void;
  destroy(): void;
  on(evento: string, cb: (nombre: string, datos: { fatal?: boolean; type?: string }) => void): void;
}
interface HlsConstructor {
  new (config?: Record<string, unknown>): HlsInstancia;
  isSupported(): boolean;
  Events: { ERROR: string };
}

let cargando: Promise<HlsConstructor | null> | null = null;

/**
 * Baja hls.js una sola vez por pestaña.
 *
 * Si el CDN está bloqueado (sin internet, o la política de seguridad del panel
 * no lo permite) esto devuelve `null` y el visor cae a las fotos: es el tercer
 * escalón, no un error que haya que mostrar en rojo.
 */
function cargarHlsJs(): Promise<HlsConstructor | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const yaEsta = (window as unknown as { Hls?: HlsConstructor }).Hls;
  if (yaEsta) return Promise.resolve(yaEsta);
  cargando ??= new Promise<HlsConstructor | null>((resolver) => {
    const s = document.createElement("script");
    s.src = CDN_HLS;
    s.async = true;
    s.onload = () => resolver((window as unknown as { Hls?: HlsConstructor }).Hls ?? null);
    s.onerror = () => {
      cargando = null;
      resolver(null);
    };
    document.head.appendChild(s);
  });
  return cargando;
}

/**
 * Engancha el `<video>` al HLS mientras haga falta, y lo suelta al irse.
 *
 * Devuelve el motivo por el que el video no se pudo mostrar, para que el visor
 * lo diga al pie y se pase a las fotos.
 */
export function useReproductorHls(
  video: RefObject<HTMLVideoElement | null>,
  lista: string | null,
  activo: boolean,
): string | null {
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    const v = video.current;
    if (!v || !lista || !activo) return;
    let cancelado = false;
    let hls: HlsInstancia | null = null;
    setFallo(null);

    /* Soltar el `src` es lo que deja de pedir pedazos; sin el `load()` el
       navegador se queda con el buffer y sigue tironeando del servidor. */
    const soltar = () => {
      hls?.destroy();
      hls = null;
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch (e) {
        logger.error("[camaras] no se pudo soltar el video", { error: String(e) });
      }
    };

    const arrancar = async () => {
      if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = lista;
        return;
      }
      const Hls = await cargarHlsJs();
      if (cancelado) return;
      if (!Hls || !Hls.isSupported()) {
        setFallo("Este navegador no puede reproducir el video en vivo: se ven las fotos.");
        return;
      }
      hls = new Hls({ liveDurationInfinity: true, lowLatencyMode: true });
      hls.on(Hls.Events.ERROR, (_e, datos) => {
        if (!datos.fatal) return;
        setFallo("El video se cortó: se ven las fotos.");
      });
      hls.loadSource(lista);
      hls.attachMedia(v);
    };

    void arrancar();
    return () => {
      cancelado = true;
      soltar();
    };
  }, [video, lista, activo]);

  return fallo;
}

/* ── Las fotos encadenadas (el escalón que siempre funciona) ──────────────── */

export interface FotosEncadenadas {
  /** La dirección del cuadro que se está mostrando. `null` = todavía ninguno. */
  src: string | null;
  /** Cuándo llegó el último cuadro, para poner la hora al lado de «en vivo». */
  ultimoAt: number | null;
  /** Por qué se dejó de pedir. `null` = sigue andando. */
  detenido: string | null;
  alCargar: () => void;
  alFallar: () => void;
  reintentar: () => void;
}

/** Fotos seguidas que pueden fallar antes de darse por vencido. */
const FALLOS_PARA_PARAR = 3;

/**
 * Una foto tras otra, encadenadas por `onLoad`.
 *
 * El cuadro siguiente se pide **cuando el anterior terminó**, nunca con un
 * `setInterval`: si la cámara tarda 3 s y se le pide una por segundo, a los
 * diez segundos hay diez pedidos en vuelo, la cámara se satura y la vista se
 * congela. Es el bug clásico de este patrón.
 *
 * Una foto que no llega es normal; tres seguidas no. Recién ahí se detiene, así
 * no parpadea un error rojo por un cuadro perdido.
 */
export function useFotosEncadenadas(camaraId: string, ritmo: number, activo: boolean): FotosEncadenadas {
  const [src, setSrc] = useState<string | null>(null);
  const [ultimoAt, setUltimoAt] = useState<number | null>(null);
  const [detenido, setDetenido] = useState<string | null>(null);

  const fallosRef = useRef(0);
  /* Número de cuadro: hace que la dirección SIEMPRE cambie. Con sólo la hora,
     dos pedidos en el mismo milisegundo dan la misma URL, el navegador no
     recarga nada, no llega ningún `onLoad` y la cadena se corta sin error. */
  const cuadroRef = useRef(0);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoAtRef = useRef<number | null>(null);

  const corriendo = activo && ritmo > 0 && !detenido;
  const corriendoRef = useRef(corriendo);
  corriendoRef.current = corriendo;
  const ritmoRef = useRef(ritmo);
  ritmoRef.current = ritmo;

  const pedirCuadro = useCallback(() => {
    cuadroRef.current += 1;
    setSrc(
      `/api/admin/camaras/${encodeURIComponent(camaraId)}/snapshot?t=${Date.now()}&n=${cuadroRef.current}`,
    );
  }, [camaraId]);

  const programarSiguiente = useCallback(() => {
    if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    temporizadorRef.current = null;
    if (!corriendoRef.current) return;
    temporizadorRef.current = setTimeout(() => {
      if (corriendoRef.current) pedirCuadro();
    }, ritmoRef.current);
  }, [pedirCuadro]);

  /* Arranca y frena. Al volver (la pestaña otra vez visible, el visor de nuevo
     en pantalla) pide un cuadro YA: esperar el ritmo deja una foto vieja
     colgada debajo del cartel «en vivo». */
  useEffect(() => {
    if (!corriendo) {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
      return;
    }
    pedirCuadro();
    return () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    };
  }, [corriendo, pedirCuadro]);

  const alCargar = useCallback(() => {
    fallosRef.current = 0;
    ultimoAtRef.current = Date.now();
    setUltimoAt(ultimoAtRef.current);
    programarSiguiente();
  }, [programarSiguiente]);

  const alFallar = useCallback(() => {
    fallosRef.current += 1;
    if (fallosRef.current >= FALLOS_PARA_PARAR) {
      setDetenido(
        ultimoAtRef.current
          ? "La cámara dejó de contestar. Puede haberse apagado o quedado sin red."
          : "La cámara no contesta. Prueba la conexión de nuevo desde «Conectar».",
      );
      return;
    }
    programarSiguiente();
  }, [programarSiguiente]);

  const reintentar = useCallback(() => {
    fallosRef.current = 0;
    setDetenido(null);
  }, []);

  return { src, ultimoAt, detenido, alCargar, alFallar, reintentar };
}
