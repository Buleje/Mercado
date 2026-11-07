"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { cuadrilateroCompleto } from "@/lib/documentos/escaner/geometria";
import { detectarBorde } from "./motor-escaner";
import { procesarPagina } from "./procesar-pagina";
import type { PaginaEscaner } from "./tipos";

const MINIATURA_LADO = 360;
const DETECTAR_LADO = 1000;

let contador = 0;
const nuevoId = (): string => `pag-${Date.now()}-${contador++}`;

/** Lee una imagen a ImageData reducido (para la auto-detección del borde). */
async function aImageDataChico(blob: Blob): Promise<{ data: ImageData } | null> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const k = Math.min(1, DETECTAR_LADO / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k);
    const h = Math.round(bmp.height * k);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return { data: ctx.getImageData(0, 0, w, h) };
  } catch {
    return null;
  }
}

/** Estado del escaneo: la lista de páginas con su recorte, rotación y filtro. */
export function useEscaner() {
  const [paginas, setPaginas] = useState<PaginaEscaner[]>([]);
  const urls = useRef<Set<string>>(new Set());

  const recordarUrl = useCallback((u: string | null) => {
    if (u) urls.current.add(u);
  }, []);
  const olvidarUrl = useCallback((u: string | null) => {
    if (u && urls.current.has(u)) {
      URL.revokeObjectURL(u);
      urls.current.delete(u);
    }
  }, []);

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current.clear();
    },
    [],
  );

  /** (Re)genera la miniatura de una página a partir de su estado actual. */
  const regenerar = useCallback(
    async (pag: PaginaEscaner) => {
      try {
        const blob = await procesarPagina(pag, MINIATURA_LADO);
        const url = URL.createObjectURL(blob);
        recordarUrl(url);
        setPaginas((prev) =>
          prev.map((p) => {
            if (p.id !== pag.id) return p;
            olvidarUrl(p.miniaturaUrl);
            return { ...p, miniaturaUrl: url };
          }),
        );
      } catch (err) {
        logger.warn("[escaner] miniatura falló", { error: String(err) });
      }
    },
    [recordarUrl, olvidarUrl],
  );

  /** Agrega imágenes (blobs). Lee tamaño, auto-detecta el borde y arma miniatura. */
  const agregar = useCallback(
    async (blobs: Blob[]): Promise<string[]> => {
      const nuevas: PaginaEscaner[] = [];
      for (const blob of blobs) {
        if (!blob.type.startsWith("image/")) continue;
        let ancho = 0;
        let alto = 0;
        try {
          const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
          ancho = bmp.width;
          alto = bmp.height;
          bmp.close();
        } catch {
          continue;
        }
        // Dos URLs independientes del mismo blob: la miniatura se regenera (y
        // revoca su URL) en segundo plano, y no debe arrastrar a `origenUrl`,
        // que es la que ve el editor de recorte (si fuera la misma, revocar la
        // miniatura rompía la imagen del recorte — ERR_FILE_NOT_FOUND).
        const url = URL.createObjectURL(blob);
        const urlMini = URL.createObjectURL(blob);
        recordarUrl(url);
        recordarUrl(urlMini);
        nuevas.push({
          id: nuevoId(),
          origenBlob: blob,
          origenUrl: url,
          ancho,
          alto,
          quad: cuadrilateroCompleto(),
          rotacion: 0,
          filtro: "original",
          miniaturaUrl: urlMini,
        });
      }
      if (nuevas.length === 0) return [];
      setPaginas((prev) => [...prev, ...nuevas]);
      // Auto-detección del borde + miniatura (en segundo plano, no bloquea).
      for (const pag of nuevas) {
        void (async () => {
          const reducido = await aImageDataChico(pag.origenBlob);
          const quad = reducido ? await detectarBorde(reducido.data) : null;
          const conQuad = quad ? { ...pag, quad } : pag;
          if (quad) setPaginas((prev) => prev.map((p) => (p.id === pag.id ? { ...p, quad } : p)));
          await regenerar(conQuad);
        })();
      }
      return nuevas.map((p) => p.id);
    },
    [recordarUrl, regenerar],
  );

  const quitar = useCallback(
    (id: string) => {
      setPaginas((prev) => {
        const p = prev.find((x) => x.id === id);
        if (p) {
          olvidarUrl(p.origenUrl);
          olvidarUrl(p.miniaturaUrl);
        }
        return prev.filter((x) => x.id !== id);
      });
    },
    [olvidarUrl],
  );

  const reordenar = useCallback((desde: number, hasta: number) => {
    setPaginas((prev) => {
      if (desde < 0 || hasta < 0 || desde >= prev.length || hasta >= prev.length) return prev;
      const copia = [...prev];
      const [mov] = copia.splice(desde, 1);
      copia.splice(hasta, 0, mov);
      return copia;
    });
  }, []);

  /** Cambia recorte/rotación/filtro de una página y refresca su miniatura. */
  const actualizar = useCallback(
    (id: string, cambios: Partial<Pick<PaginaEscaner, "quad" | "rotacion" | "filtro">>) => {
      setPaginas((prev) => {
        const siguiente = prev.map((p) => (p.id === id ? { ...p, ...cambios } : p));
        const pag = siguiente.find((p) => p.id === id);
        if (pag) void regenerar(pag);
        return siguiente;
      });
    },
    [regenerar],
  );

  return { paginas, agregar, quitar, reordenar, actualizar };
}

export type EstadoEscaner = ReturnType<typeof useEscaner>;
