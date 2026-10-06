/**
 * El reproductor EZUIKit de la nube de Hikvision (ADR-471) visto desde afuera:
 * cargarlo, soltarlo y sacarle el cuadro que se ve. Lo usan el visor de una
 * cámara y cada cuadro del mosaico (`use-visor-nube.ts`).
 */

import type { EZUIKitPlayer } from "ezuikit-js";
import { logger } from "@/lib/logger";
import { base64DeCaptura } from "./analizar-cuadro";

/** EZUIKit busca el contenedor por id (y a veces por selector): sin «:» de `useId`. */
export const idSeguro = (crudo: string) => `visor-nube-${crudo.replace(/[^a-zA-Z0-9_-]/g, "")}`;

type ClaseReproductor = typeof EZUIKitPlayer;

/**
 * `ezuikit-js` con import dinámico (~4 MB que el panel no paga al cargar).
 *
 * En desarrollo, un reproductor falso en `window.__ezuikitDePrueba` lo
 * reemplaza: en QA no hay cámara de Hikvision y sin esto el mosaico,
 * «Analizar» y el cierre no se pueden probar en el navegador (qa-capturas,
 * 05-10). En producción la rama no existe (Next reemplaza `NODE_ENV`).
 */
export async function cargarReproductor(): Promise<ClaseReproductor> {
  if (process.env.NODE_ENV !== "production") {
    const falso = (window as unknown as { __ezuikitDePrueba?: ClaseReproductor })
      .__ezuikitDePrueba;
    if (falso) return falso;
  }
  return (await import("ezuikit-js")).EZUIKitPlayer;
}

/**
 * El 16:9 más grande que entra en la caja. Normalmente la caja ya es 16:9 y
 * manda el ancho; en pantalla completa (celular acostado, monitor 16:10) manda
 * el alto: sin esto el video se salía por abajo.
 */
export function medidaQueEntra(ancho: number, alto: number): { ancho: number; alto: number } {
  const w = Math.max(0, Math.floor(alto > 0 ? Math.min(ancho, (alto * 16) / 9) : ancho));
  return { ancho: w, alto: Math.round((w * 9) / 16) };
}

type ConSonido = { openSound?: () => unknown; closeSound?: () => unknown };

/**
 * Prende o apaga el SONIDO del vivo (lo que oye el micrófono de la cámara).
 * `ezuikit-js` 9.0.23: `openSound()`/`closeSound()` (README «方法调用»); el
 * reproductor arranca mudo (`audio: false`). `false` si no se pudo.
 */
export async function sonar(p: EZUIKitPlayer | null, prender: boolean): Promise<boolean> {
  const r = p as unknown as ConSonido | null;
  const metodo = prender ? r?.openSound : r?.closeSound;
  if (!r || !metodo) return false;
  try {
    await Promise.resolve(metodo.call(r));
    return true;
  } catch (err) {
    logger.warn("[camaras] el reproductor no cambió el sonido", { error: String(err) });
    return false;
  }
}

/** Suelta el reproductor: `destroy` corta el stream, el websocket y el decodificador. */
export function destruir(p: EZUIKitPlayer | null, caja: HTMLElement | null) {
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

/**
 * Firma real de `capturePicture` en `ezuikit-js` 9.0.23 (index.mjs):
 * `(nombre, ?, descargar = true, subirALaNube = true)`. Con los dos últimos en
 * `false` no baja un archivo ni lo sube a la nube de EZVIZ: sólo devuelve el
 * cuadro en base64.
 */
type ConCaptura = {
  capturePicture?: (nombre: string, a: boolean, descargar: boolean, nube: boolean) => unknown;
};

const SEGUNDOS_TOPE_CAPTURA = 6;

function conTope<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** El cuadro pintado en el `<canvas>`/`<video>` del contenedor, si el decodificador lo deja leer. */
function cuadroDelLienzo(caja: HTMLElement | null): string | null {
  const fuente = caja?.querySelector<HTMLCanvasElement | HTMLVideoElement>("canvas, video");
  if (!fuente) return null;
  const ancho = fuente instanceof HTMLVideoElement ? fuente.videoWidth : fuente.width;
  const alto = fuente instanceof HTMLVideoElement ? fuente.videoHeight : fuente.height;
  if (!ancho || !alto) return null;
  try {
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    lienzo.getContext("2d")?.drawImage(fuente, 0, 0, ancho, alto);
    return lienzo.toDataURL("image/jpeg", 0.9);
  } catch (err) {
    logger.warn("[camaras] no se pudo leer el lienzo del video", { error: String(err) });
    return null;
  }
}

/** El cuadro que se está viendo, en base64. Primero EZUIKit; si falla, el lienzo. */
export async function capturarCuadro(
  p: EZUIKitPlayer | null,
  caja: HTMLElement | null,
): Promise<string | null> {
  const captura = (p as unknown as ConCaptura | null)?.capturePicture;
  if (p && captura) {
    try {
      const r = await conTope(
        Promise.resolve(captura.call(p, `analizar-${Date.now()}`, false, false, false)),
        SEGUNDOS_TOPE_CAPTURA * 1000,
      );
      const b64 = base64DeCaptura(r);
      if (b64) return b64;
    } catch (err) {
      logger.warn("[camaras] EZUIKit no devolvió el cuadro", { error: String(err) });
    }
  }
  return cuadroDelLienzo(caja);
}
