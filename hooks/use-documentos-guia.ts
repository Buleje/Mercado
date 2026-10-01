"use client";

/**
 * use-documentos-guia — los papeles de UNA guía de ingreso (ADR-438) y el
 * conteo «3 de 6» de las guías que están en pantalla.
 *
 * Los archivos viven en el Drive; esto sólo habla con
 * `/api/admin/forestal/guias/documentos`. La foto se achica en el navegador
 * antes de subir (`comprimirImagen`, el mismo del Drive): con datos móviles una
 * foto de 6 MB no pasa el tope de 4 MB por pedido.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { comprimirImagen } from "@/lib/documents/compress-image";
import { logger } from "@/lib/logger";
import { MAX_BYTES_DOC_GUIA, type CasilleroGuia } from "@/lib/forestal/documentos-guia";

const RUTA = "/api/admin/forestal/guias/documentos";

export interface DocumentoDeGuia {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedById: string;
  uploadedAt: string;
  legado: boolean;
  src: string;
}

export interface CasilleroConDocs {
  clave: CasilleroGuia;
  label: string;
  hint: string;
  docs: DocumentoDeGuia[];
}

export interface DocumentosDeGuia {
  gtf: string;
  llenos: number;
  total: number;
  casilleros: CasilleroConDocs[];
}

async function mensajeDe(res: Response, porDefecto: string): Promise<string> {
  const data = (await res.json().catch((err: unknown) => {
    logger.warn("[docs-guia] respuesta sin JSON", { status: res.status, error: String(err) });
    return null;
  })) as { message?: string; error?: string } | null;
  if (res.status === 413 && !data?.message) return "El archivo pesa más de 4 MB.";
  return data?.message ?? porDefecto;
}

export function useDocumentosGuia(gtf: string | null) {
  const [datos, setDatos] = useState<DocumentosDeGuia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Casillero que está subiendo (uno a la vez por casillero). */
  const [subiendo, setSubiendo] = useState<Partial<Record<CasilleroGuia, boolean>>>({});
  /* El GET del doble montaje puede volver tarde y pisar lo recién subido: sólo
     vale la respuesta del último pedido (memoria «carga vieja pisa lo optimista»). */
  const turno = useRef(0);

  const recargar = useCallback(async () => {
    if (!gtf) return;
    const mio = ++turno.current;
    setCargando(true);
    try {
      const res = await fetch(`${RUTA}?gtf=${encodeURIComponent(gtf)}`, { credentials: "include" });
      if (!res.ok)
        throw new Error(await mensajeDe(res, "No se pudieron leer los documentos de la guía."));
      const d = (await res.json()) as DocumentosDeGuia;
      if (mio === turno.current) {
        setDatos(d);
        setError(null);
      }
    } catch (e) {
      if (mio === turno.current)
        setError(e instanceof Error ? e.message : "No se pudieron leer los documentos.");
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [gtf]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Sube uno (o reemplaza `reemplaza`). Devuelve el error para mostrar, o `null`. */
  const subir = useCallback(
    async (casillero: CasilleroGuia, file: File, reemplaza?: string): Promise<string | null> => {
      if (!gtf) return "Falta la guía.";
      setSubiendo((s) => ({ ...s, [casillero]: true }));
      try {
        const listo = file.type.startsWith("image/") ? await comprimirImagen(file) : file;
        if (listo.size > MAX_BYTES_DOC_GUIA) {
          return `«${file.name}» pesa ${(listo.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB: el máximo es 4 MB. Parte el PDF o sácale foto con menos resolución.`;
        }
        const fd = new FormData();
        fd.append("gtf", gtf);
        fd.append("casillero", casillero);
        if (reemplaza) fd.append("reemplaza", reemplaza);
        fd.append("file", listo, listo.name || file.name);
        ++turno.current; // lo que estaba en vuelo ya no vale
        const res = await fetch(RUTA, {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders(),
          body: fd,
        });
        if (!res.ok) return await mensajeDe(res, "No se pudo subir el archivo.");
        await recargar();
        return null;
      } catch (e) {
        logger.error("[docs-guia] subir failed", { error: String(e) });
        return "No se pudo subir el archivo. Revisa la señal y prueba de nuevo.";
      } finally {
        setSubiendo((s) => ({ ...s, [casillero]: false }));
      }
    },
    [gtf, recargar],
  );

  const quitar = useCallback(
    async (id: string): Promise<string | null> => {
      if (!gtf) return "Falta la guía.";
      ++turno.current;
      /* Optimista: sale de la lista ya; si el servidor dice que no, se relee. */
      setDatos((d) =>
        d
          ? {
              ...d,
              casilleros: d.casilleros.map((c) => ({
                ...c,
                docs: c.docs.filter((x) => x.id !== id),
              })),
            }
          : d,
      );
      try {
        const res = await fetch(RUTA, {
          method: "DELETE",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ gtf, id }),
        });
        const msg = res.ok ? null : await mensajeDe(res, "No se pudo quitar el archivo.");
        await recargar();
        return msg;
      } catch (e) {
        logger.error("[docs-guia] quitar failed", { error: String(e) });
        await recargar();
        return "No se pudo quitar el archivo.";
      }
    },
    [gtf, recargar],
  );

  return { datos, cargando, error, subiendo, recargar, subir, quitar };
}

/**
 * Casilleros llenos de cada guía en pantalla (`{ "019-0000003": 3 }`), en UN
 * pedido. Una guía sin respuesta no aparece: la fila no dibuja nada antes que
 * un «0 de 6» que no se midió.
 */
export function useConteoDocumentosGuias(gtfs: readonly string[]) {
  const [llenos, setLlenos] = useState<Record<string, number>>({});
  const clave = [...new Set(gtfs.filter(Boolean))].sort().join(",");
  const turno = useRef(0);

  const refrescar = useCallback(async () => {
    if (!clave) return;
    const mio = ++turno.current;
    try {
      const res = await fetch(`${RUTA}?gtfs=${encodeURIComponent(clave)}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const d = (await res.json()) as { llenos?: Record<string, number> };
      if (mio === turno.current && d.llenos) setLlenos(d.llenos);
    } catch (e) {
      logger.warn("[docs-guia] conteo failed", { error: String(e) });
    }
  }, [clave]);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  return { llenos, refrescar };
}
