"use client";

/**
 * Datos de «Libros para el contador»: la vista previa (JSON) y la descarga
 * (xlsx / txt / sire) salen de la MISMA ruta, así lo que se ve es lo que se baja.
 * Nada se calcula acá: totales y notas vienen del servidor.
 */
import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { LibroContador, LibroId } from "@/lib/contabilidad/libros/comun";
import type { ResumenSire } from "@/lib/contabilidad/libros/sire-rvie";

/** Lo que el servidor cuenta del archivo SIRE: cuántas entraron, cuáles no y por qué. */
export type AvisoDeSire = ResumenSire & { avisos?: string[] };
export type FormatoDescarga = "xlsx" | "txt" | "sire";

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

function leerResumenSire(cabecera: string | null): AvisoDeSire | null {
  if (!cabecera) return null;
  try {
    return JSON.parse(decodeURIComponent(cabecera)) as AvisoDeSire;
  } catch (err) {
    logger.error("[libros-contador] resumen SIRE ilegible", { error: String(err) });
    return null;
  }
}

async function errorDeSire(r: Response): Promise<{ error?: string; resumen?: AvisoDeSire } | null> {
  try {
    return (await r.json()) as { error?: string; resumen?: AvisoDeSire };
  } catch (err) {
    logger.error("[libros-contador] respuesta SIRE sin JSON", { status: r.status, error: String(err) });
    return null;
  }
}

export function useLibrosContador(libro: LibroId, periodo: string) {
  const [estado, setEstado] = useState<EstadoVista>({ fase: "cargando" });
  const [bajando, setBajando] = useState<FormatoDescarga | null>(null);
  const [resumenSire, setResumenSire] = useState<AvisoDeSire | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado({ fase: "cargando" });
    setErrorDescarga(null);
    setResumenSire(null);
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
    async (formato: FormatoDescarga) => {
      setBajando(formato);
      setErrorDescarga(null);
      setResumenSire(null);
      try {
        const r = await fetch(`${RUTA}?libro=${libro}&periodo=${periodo}&formato=${formato}`, { cache: "no-store" });
        if (formato === "sire" && r.status === 422) {
          const cuerpo = await errorDeSire(r);
          setResumenSire(cuerpo?.resumen ?? null);
          throw new Error(cuerpo?.error ?? "No pude armar el archivo SIRE.");
        }
        if (!r.ok) throw new Error(mensajeDeError(r.status));
        if (formato === "sire") setResumenSire(leerResumenSire(r.headers.get("X-Sire-Resumen")));
        const extension = formato === "sire" ? "zip" : formato;
        const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `libro-${periodo}.${extension}`;
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

  return { estado, bajando, errorDescarga, resumenSire, descargar };
}
