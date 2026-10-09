"use client";

/**
 * Lo que el mosaico junta de sus cuadros para la burbuja (2026-10-07): la
 * última foto de persona (su miniatura), cuántas llegaron desde que se
 * minimizó, un cuadro del video como miniatura de respaldo y la carpeta
 * «Personas» del Drive. La miniatura lleva su hora: la burbuja dice cuánto
 * hace y se atenúa desde los 30 min (08-10), para no parecer actual.
 *
 * El cuadro de respaldo se toma con `tomarCuadroQuieto` de cada visor: NO
 * cuenta como un toque, así el reloj de 5 min sigue corriendo minimizado.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { API_CAMARAS } from "./camaras-ui";
import type { UltimaFotoPersona } from "./use-detector-personas";

export type TomarCuadro = () => Promise<string | null>;

/** Cada cuánto se renueva el cuadro de respaldo con la burbuja a la vista. */
const MINIATURA_CADA_MS = 60_000;

/** `capturarCuadro` devuelve base64 pelado (EZUIKit) o un data URL (el lienzo). */
export const comoImagen = (b64: string) => (b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`);

interface Opciones {
  minimizado: boolean;
  /** Pedir la carpeta «Personas» (no en el Modo TV: sólo mira). */
  conCarpeta: boolean;
}

export function usePersonasMosaico({ minimizado, conCarpeta }: Opciones) {
  const [ultima, setUltima] = useState<UltimaFotoPersona | null>(null);
  const [desdeMinimizar, setDesdeMinimizar] = useState(0);
  /* El cuadro de respaldo con su hora: la burbuja dice cuánto hace (08-10). */
  const [cuadro, setCuadro] = useState<{ src: string; at: number } | null>(null);
  const [carpetaId, setCarpetaId] = useState<string | null>(null);
  const minimizadoRef = useRef(minimizado);
  const cuadros = useRef(new Map<string, TomarCuadro>());

  useEffect(() => {
    minimizadoRef.current = minimizado;
  }, [minimizado]);

  /** Cada foto que guardó el detector de un cuadro. */
  const onFoto = useCallback((foto: UltimaFotoPersona) => {
    setUltima(foto);
    if (minimizadoRef.current) setDesdeMinimizar((n) => n + 1);
  }, []);

  /** Cada cuadro se anota con su captura (y se borra al desmontarse con `null`). */
  const registrarCuadro = useCallback((id: string, tomar: TomarCuadro | null) => {
    if (tomar) cuadros.current.set(id, tomar);
    else cuadros.current.delete(id);
  }, []);

  const refrescarCuadro = useCallback(async () => {
    for (const tomar of cuadros.current.values()) {
      try {
        const b64 = await tomar();
        if (b64) {
          setCuadro({ src: comoImagen(b64), at: Date.now() });
          return;
        }
      } catch (err) {
        logger.warn("[camaras] la burbuja no pudo tomar un cuadro", { error: String(err) });
      }
    }
  }, []);

  /** Al minimizar: el contador vuelve a cero y se toma un cuadro para la burbuja. */
  const alMinimizar = useCallback(() => {
    minimizadoRef.current = true;
    setDesdeMinimizar(0);
    void refrescarCuadro();
  }, [refrescarCuadro]);

  useEffect(() => {
    if (!minimizado) return;
    const t = setInterval(() => void refrescarCuadro(), MINIATURA_CADA_MS);
    return () => clearInterval(t);
  }, [minimizado, refrescarCuadro]);

  /* La carpeta se crea con la primera foto: se pide al abrir y, si todavía no
     existía, otra vez cuando llega la primera. 404/403 = sin enlace, sin error. */
  const hayFoto = ultima !== null;
  useEffect(() => {
    if (!conCarpeta || carpetaId) return;
    const control = new AbortController();
    (async () => {
      try {
        const r = await fetch(`${API_CAMARAS}/personas`, {
          credentials: "include",
          signal: control.signal,
        });
        if (!r.ok) return;
        const j = (await r.json()) as { carpetaId?: unknown } | null;
        if (typeof j?.carpetaId === "string" && j.carpetaId) setCarpetaId(j.carpetaId);
      } catch (err) {
        if (!control.signal.aborted)
          logger.warn("[camaras] no se pudo leer la carpeta Personas", { error: String(err) });
      }
    })();
    return () => control.abort();
  }, [conCarpeta, carpetaId, hayFoto]);

  return {
    onFoto,
    registrarCuadro,
    alMinimizar,
    desdeMinimizar,
    miniatura: ultima?.miniatura ?? cuadro?.src ?? null,
    /** Cuándo se tomó lo que muestra la miniatura (ms), para «hace 3 min». */
    miniaturaAt: ultima ? ultima.at : (cuadro?.at ?? null),
    /** `true` = la miniatura es una foto de persona; `false` = un cuadro del video. */
    miniaturaEsPersona: ultima !== null,
    carpetaId,
  };
}
