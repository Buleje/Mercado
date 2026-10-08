"use client";

/**
 * El cuadro sobre el que se marcan las «zonas a ignorar» (2026-10-08) y, si el
 * detector ya está cargado (el mosaico lo tiene prendido), las cajas de
 * «persona» que ve en ESE cuadro: así se ve al instante si la zona tapa al
 * poste. Nunca baja el detector sólo para esto (WASM de 11 MB): sin él, no
 * hay cajas y se dibuja igual.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ZonaIgnorada } from "@/lib/camaras/zonas-ignorar";
import { logger } from "@/lib/logger";
import { detectarPersonas, infoDetectorPersonas } from "./detector-personas";

export type EstadoImagenZonas = "cargando" | "lista" | "sin_imagen";

/** Base64 pelado (EZUIKit), data URL (lienzo) o una URL del storage: todo sirve como `src`. */
function comoSrc(s: string): string {
  return /^(data:|blob:|https?:|\/)/.test(s) ? s : `data:image/jpeg;base64,${s}`;
}

export function useImagenZonas(cargar: () => Promise<string | null>) {
  const [src, setSrc] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoImagenZonas>("cargando");
  const cargarRef = useRef(cargar);
  useEffect(() => {
    cargarRef.current = cargar;
  });

  const recargar = useCallback(async () => {
    setEstado("cargando");
    try {
      const s = await cargarRef.current();
      setSrc(s ? comoSrc(s) : null);
      setEstado(s ? "lista" : "sin_imagen");
    } catch (err) {
      logger.warn("[camaras] no se pudo traer el cuadro para las zonas", { error: String(err) });
      setEstado("sin_imagen");
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { src, estado, recargar };
}

/**
 * Las cajas de persona del cuadro, en fracciones 0-1, o `null` si el detector
 * no estaba cargado o la imagen no se deja leer (una URL de otro origen).
 * `cargada` cambia de identidad con cada imagen que terminó de cargar.
 */
export function useCajasDeImagen(
  img: HTMLImageElement | null,
  cargada: string | null,
): ZonaIgnorada[] | null {
  const [cajas, setCajas] = useState<{ de: string; cajas: ZonaIgnorada[] } | null>(null);

  useEffect(() => {
    if (!img || !cargada || !infoDetectorPersonas()) return;
    let vivo = true;
    const ancho = img.naturalWidth;
    const alto = img.naturalHeight;
    if (!(ancho > 0) || !(alto > 0)) return;
    detectarPersonas(img).then(
      (r) => {
        if (!vivo) return;
        setCajas({
          de: cargada,
          cajas: r.cajas.map((c) => ({ x: c.x / ancho, y: c.y / alto, w: c.ancho / ancho, h: c.alto / alto })),
        });
      },
      (err: unknown) => logger.warn("[camaras] el detector no pudo mirar el cuadro de las zonas", { error: String(err) }),
    );
    return () => {
      vivo = false;
    };
  }, [img, cargada]);

  return cajas && cajas.de === cargada ? cajas.cajas : null;
}
