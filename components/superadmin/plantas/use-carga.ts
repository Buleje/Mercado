"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

export interface Carga<T> {
  data: T | null;
  error: string | null;
  /** true también al recargar: la tabla sigue con lo anterior mientras tanto. */
  cargando: boolean;
  recargar: () => void;
}

/** El mensaje del servidor, o uno legible si no trae. */
export async function mensajeDeError(res: Response, porEstado: Partial<Record<number, string>> = {}): Promise<string> {
  if (porEstado[res.status]) return porEstado[res.status] as string;
  const j = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
  const msg = typeof j?.message === "string" ? j.message : typeof j?.error === "string" ? j.error : null;
  if (msg) return msg;
  if (res.status === 429) return "Demasiadas consultas seguidas. Espera unos segundos y vuelve a intentar.";
  return `No se pudo leer (error ${res.status}).`;
}

/**
 * GET con la sesión del superadmin. Una respuesta vieja nunca pisa a la nueva
 * (cambiar de período rápido dejaba la tabla con el período anterior).
 * `url` null = no pedir nada todavía.
 */
export function useCargaSuperadmin<T>(url: string | null, porEstado?: Partial<Record<number, string>>): Carga<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState<boolean>(url != null);
  const [vuelta, setVuelta] = useState(0);
  const turno = useRef(0);
  // Los mensajes por estado son constantes del que llama: se leen una vez.
  const estados = useRef(porEstado);

  useEffect(() => {
    if (!url) return;
    const mio = ++turno.current;
    setCargando(true);
    setError(null);
    (async () => {
      try {
        const res = await fetchSuperadmin(url);
        if (mio !== turno.current) return;
        if (!res.ok) {
          const msg = await mensajeDeError(res, estados.current);
          if (mio === turno.current) setError(msg);
          return;
        }
        const j = (await res.json()) as T;
        if (mio === turno.current) setData(j);
      } catch {
        if (mio === turno.current) setError("Sin conexión con el servidor. Revisa tu internet y vuelve a intentar.");
      } finally {
        if (mio === turno.current) setCargando(false);
      }
    })();
  }, [url, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { data, error, cargando, recargar };
}

/** POST/PATCH JSON del superadmin; devuelve el error legible o null si salió bien. */
export async function escribirSuperadmin(url: string, method: "POST" | "PATCH", body: unknown): Promise<string | null> {
  try {
    const res = await fetchSuperadmin(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok ? null : await mensajeDeError(res);
  } catch {
    return "Sin conexión con el servidor. Revisa tu internet y vuelve a intentar.";
  }
}
