"use client";

import { useCallback, useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PaginaResumen } from "@/components/admin/cms/tipos";

export type ResultadoAccion = { ok: true; id?: string } | { ok: false; error: string };

export async function llamarCms(url: string, method: string, body?: unknown): Promise<ResultadoAccion> {
  try {
    const res = await fetch(url, {
      method,
      headers: csrfHeaders(body ? { "Content-Type": "application/json" } : {}),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data: { error?: string; id?: string } | null = null;
    try {
      data = (await res.json()) as { error?: string; id?: string };
    } catch {
      // Respuesta sin cuerpo JSON (p. ej. un 502): se informa sólo por el código de estado.
    }
    if (!res.ok) return { ok: false, error: data?.error ?? "No se pudo completar. Inténtalo de nuevo." };
    return { ok: true, ...(data?.id ? { id: data.id } : {}) };
  } catch (error) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    return { ok: false, error: "No hay conexión. Inténtalo de nuevo." };
  }
}

/** La lista de páginas por bloques del negocio y sus acciones (todas del lado del servidor). */
export function useCmsPages() {
  const [paginas, setPaginas] = useState<PaginaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      const res = await fetch("/api/cms/pages");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPaginas((await res.json()) as PaginaResumen[]);
      setError(null);
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
      setError("No pudimos cargar tus páginas.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const crear = useCallback(
    (titulo: string, slug: string) => llamarCms("/api/cms/pages", "POST", { title: titulo, slug }),
    [],
  );
  const conRecarga = useCallback(
    async (r: Promise<ResultadoAccion>) => {
      const res = await r;
      if (res.ok) await recargar();
      return res;
    },
    [recargar],
  );
  const publicar = useCallback((id: string) => conRecarga(llamarCms(`/api/cms/pages/${id}/publish`, "POST")), [conRecarga]);
  const despublicar = useCallback((id: string) => conRecarga(llamarCms(`/api/cms/pages/${id}/publish`, "DELETE")), [conRecarga]);
  const eliminar = useCallback((id: string) => conRecarga(llamarCms(`/api/cms/pages/${id}`, "DELETE")), [conRecarga]);

  return { paginas, cargando, error, recargar, crear, publicar, despublicar, eliminar };
}
