"use client";

/**
 * Datos de «Libros para el contador»: la vista previa (JSON) y la descarga
 * (xlsx / txt) salen de la MISMA ruta, así lo que se ve es lo que se baja.
 * Nada se calcula acá: totales y notas vienen del servidor.
 */
import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { LibroContador, LibroId } from "@/lib/contabilidad/libros/comun";

export type VistaPrevia = LibroContador & { totalFilas: number };

export type EstadoVista =
  | { fase: "cargando" }
  | { fase: "lista"; datos: VistaPrevia }
  | { fase: "error"; mensaje: string };

const RUTA = "/api/admin/contabilidad/libros";

function mensajeDeError(status: number): string {
  if (status === 401) return "Tu sesión venció. Vuelve a entrar.";
  if (status === 403) return "Tu usuario no puede ver los libros del negocio.";
  if (status === 429) return "Pediste muchos libros seguidos. Espera unos minutos y vuelve a intentar.";
  return "No pude armar el libro. Intenta de nuevo.";
}

export function useLibrosContador(libro: LibroId, periodo: string) {
  const [estado, setEstado] = useState<EstadoVista>({ fase: "cargando" });
  const [bajando, setBajando] = useState<"xlsx" | "txt" | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado({ fase: "cargando" });
    setErrorDescarga(null);
    fetch(`${RUTA}?libro=${libro}&periodo=${periodo}`, { cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(mensajeDeError(r.status));
        setEstado({ fase: "lista", datos: (await r.json()) as VistaPrevia });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        logger.error("[libros-contador] vista previa falló", { libro, periodo, error: String(err) });
        setEstado({ fase: "error", mensaje: err instanceof Error ? err.message : "No pude armar el libro." });
      });
    return () => ctrl.abort();
  }, [libro, periodo]);

  const descargar = useCallback(
    async (formato: "xlsx" | "txt") => {
      setBajando(formato);
      setErrorDescarga(null);
      try {
        const r = await fetch(`${RUTA}?libro=${libro}&periodo=${periodo}&formato=${formato}`, { cache: "no-store" });
        if (!r.ok) throw new Error(mensajeDeError(r.status));
        const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `libro-${periodo}.${formato}`;
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        logger.error("[libros-contador] descarga falló", { libro, periodo, formato, error: String(err) });
        setErrorDescarga(err instanceof Error ? err.message : "No pude bajar el archivo.");
      } finally {
        setBajando(null);
      }
    },
    [libro, periodo],
  );

  return { estado, bajando, errorDescarga, descargar };
}
