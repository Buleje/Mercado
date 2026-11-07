"use client";

/**
 * «Que también lo vean otros equipos» del Espejo del celular (24-10) — la
 * PC que espeja manda un cuadro reducido cada 1,5 s al servidor, que guarda
 * sólo el último por 10 s (contrato en `lib/camaras/espejo-remoto.ts`).
 *
 * Apagado por defecto. Se apaga solo al detener el espejo (el `<video>` se
 * queda sin stream) y, al apagarse, al salir de la vista o al cerrar la
 * pestaña, borra el cuadro del servidor: después de apagarlo nadie ve nada,
 * ni siquiera los 10 s que duraría. El borrado espera al envío en vuelo, así
 * un cuadro que llega tarde no revive el espejo.
 *
 * Con la pantalla quieta no manda el mismo cuadro (huella de 16×16 en gris):
 * lo reenvía cada 4,5 s sólo para que no venza.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import {
  CALIDAD_CUADRO,
  CALIDAD_CUADRO_MINIMA,
  HEADER_EMISOR,
  INTERVALO_ENVIO_MS,
  LADO_HUELLA,
  MAX_BYTES_CUADRO,
  URL_CUADRO_ESPEJO,
  cambioDeHuella,
  huellaGris,
  medidasReducidas,
  tocaEnviar,
} from "@/lib/camaras/espejo-remoto";

/** `enviando` = el último cuadro llegó; `otro_equipo` = otra pestaña tuya ya comparte (vuelve a intentar sola). */
export type EstadoCompartir = "apagado" | "enviando" | "otro_equipo" | "error";

export interface CompartirEspejo {
  prendido: boolean;
  estado: EstadoCompartir;
  error: string | null;
  cambiar: (prender: boolean) => void;
}

const nuevoEmisor = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const comoBlob = (lienzo: HTMLCanvasElement, tipo: string, calidad: number) =>
  new Promise<Blob | null>((resolver) => lienzo.toBlob((b) => resolver(b), tipo, calidad));

/** WebP (más liviano) y, si el navegador no lo arma, JPEG; con un 2.º intento más liviano si pasa el tope. */
async function codificar(lienzo: HTMLCanvasElement): Promise<Blob | null> {
  for (const calidad of [CALIDAD_CUADRO, CALIDAD_CUADRO_MINIMA]) {
    let b = await comoBlob(lienzo, "image/webp", calidad);
    if (b && b.type !== "image/webp") b = await comoBlob(lienzo, "image/jpeg", calidad);
    if (b && b.size <= MAX_BYTES_CUADRO) return b;
  }
  return null;
}

function borrarDelServidor(emisor: string) {
  fetch(URL_CUADRO_ESPEJO, {
    method: "DELETE",
    headers: csrfHeaders({ [HEADER_EMISOR]: emisor }),
    keepalive: true,
  }).catch((err: unknown) =>
    logger.warn("[espejo-remoto] no se borró el cuadro del servidor (vence solo en 10 s)", {
      error: String(err),
    }),
  );
}

export function useCompartirEspejo(
  videoRef: RefObject<HTMLVideoElement | null>,
  mostrando: boolean,
): CompartirEspejo {
  const [prendido, setPrendido] = useState(false);
  const [estado, setEstado] = useState<EstadoCompartir>("apagado");
  const [error, setError] = useState<string | null>(null);
  const emisorRef = useRef<string | null>(null);

  /* Detener el espejo apaga el compartir (ajuste en el render, sin efecto). */
  const [mostrandoAntes, setMostrandoAntes] = useState(mostrando);
  if (mostrandoAntes !== mostrando) {
    setMostrandoAntes(mostrando);
    if (!mostrando && prendido) {
      setPrendido(false);
      setEstado("apagado");
    }
  }

  const cambiar = useCallback((prender: boolean) => {
    setError(null);
    setEstado(prender ? "enviando" : "apagado");
    setPrendido(prender);
  }, []);

  const activo = prendido && mostrando;

  useEffect(() => {
    if (!activo) return;
    emisorRef.current ??= nuevoEmisor();
    const emisor = emisorRef.current;
    const lienzo = document.createElement("canvas");
    const chico = document.createElement("canvas");
    chico.width = LADO_HUELLA;
    chico.height = LADO_HUELLA;
    let huellaAntes: Uint8Array | null = null;
    let ultimoEnvio = 0;
    let enVuelo: Promise<void> | null = null;
    let sigue = true;

    const enviar = async (blob: Blob) => {
      try {
        const r = await fetch(URL_CUADRO_ESPEJO, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": blob.type, [HEADER_EMISOR]: emisor }),
          body: blob,
        });
        if (!sigue) return;
        if (r.ok) {
          setEstado("enviando");
          setError(null);
        } else if (r.status === 409) {
          setEstado("otro_equipo");
        } else if (r.status === 401 || r.status === 403) {
          setPrendido(false);
          setEstado("error");
          setError(
            r.status === 401
              ? "Tu sesión venció: vuelve a entrar para compartir."
              : "Tu usuario no puede compartir el espejo.",
          );
        } else if (r.status !== 429) {
          setEstado("error");
          setError("El servidor no recibió el cuadro: sigue intentando.");
        }
      } catch (err) {
        if (!sigue) return;
        logger.warn("[espejo-remoto] el cuadro no salió", { error: String(err) });
        setEstado("error");
        setError("Sin conexión con el servidor: sigue intentando.");
      }
    };

    const ctx = lienzo.getContext("2d");
    const ctxChico = chico.getContext("2d", { willReadFrequently: true });

    /* Un cuadro: tomar, comparar, codificar y mandar. Nunca dos a la vez. */
    const tomar = async () => {
      const video = videoRef.current;
      const m = video ? medidasReducidas(video.videoWidth, video.videoHeight) : null;
      if (!video || !m || !ctx || !ctxChico) return;
      lienzo.width = m.ancho;
      lienzo.height = m.alto;
      ctx.drawImage(video, 0, 0, m.ancho, m.alto);
      ctxChico.drawImage(lienzo, 0, 0, LADO_HUELLA, LADO_HUELLA);
      const huella = huellaGris(ctxChico.getImageData(0, 0, LADO_HUELLA, LADO_HUELLA).data);
      const ahora = performance.now();
      if (!tocaEnviar(cambioDeHuella(huellaAntes, huella), ahora - ultimoEnvio)) return;
      const blob = await codificar(lienzo);
      if (!blob || !sigue) return;
      huellaAntes = huella;
      ultimoEnvio = ahora;
      await enviar(blob);
    };
    const tic = () => {
      if (enVuelo) return;
      enVuelo = tomar()
        .catch((err: unknown) =>
          logger.warn("[espejo-remoto] no se pudo tomar el cuadro", { error: String(err) }),
        )
        .finally(() => {
          enVuelo = null;
        });
    };

    const reloj = window.setInterval(tic, INTERVALO_ENVIO_MS);
    tic();
    /* Cerrar la pestaña no corre la limpieza de React: `pagehide` + keepalive. */
    const alCerrar = () => borrarDelServidor(emisor);
    window.addEventListener("pagehide", alCerrar);
    return () => {
      sigue = false;
      window.clearInterval(reloj);
      window.removeEventListener("pagehide", alCerrar);
      if (enVuelo) void enVuelo.finally(() => borrarDelServidor(emisor));
      else borrarDelServidor(emisor);
    };
  }, [activo, videoRef]);

  return {
    prendido: activo,
    estado: activo ? estado : estado === "error" ? "error" : "apagado",
    error,
    cambiar,
  };
}
