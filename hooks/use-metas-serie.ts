"use client";

/**
 * hooks/use-metas-serie.ts — lo vendido por hora/día y los logros (ADR-488).
 *
 * Un GET con su `AbortController`; mientras recarga se queda con el dato que
 * ya tenía (no parpadea a vacío) y una carga vieja nunca pisa a una nueva.
 * Con `cadaMs`, vuelve a pedir mientras la pestaña está a la vista.
 *
 * Un 403 (cajero, almacenero: `ROLES_AVANCE`) no es un error que se arregle
 * reintentando: queda `sinPermiso` y el hook deja de pedir.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RespuestaLogros,
  RespuestaSerieDia,
  RespuestaSerieHora,
} from "@/lib/metas/logros-reglas";

export interface EstadoGet<T> {
  datos: T | null;
  cargando: boolean;
  error: string | null;
  /** El rol no puede ver esto (403): no se reintenta ni se ofrece «Reintentar». */
  sinPermiso: boolean;
  /** `fresco` agrega `fresco=1` (salta la caché del servidor). */
  recargar: (fresco?: boolean) => void;
  /** Cuándo llegó el último dato. */
  actualizado: Date | null;
}

async function mensajeDeError(res: Response): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { error?: unknown };
    if (typeof cuerpo.error === "string" && cuerpo.error) return cuerpo.error;
  } catch {
    // Sin cuerpo JSON: vale el mensaje genérico de abajo.
  }
  if (res.status === 401) return "Tu sesión venció. Vuelve a entrar.";
  return "No se pudo cargar. Reintenta en un rato.";
}

function useGet<T>(url: string | null, cadaMs = 0): EstadoGet<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(url !== null);
  const [error, setError] = useState<string | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const vetadoRef = useRef(false);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const pedir = useCallback(
    async (fresco = false) => {
      if (!url || vetadoRef.current) return;
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setCargando(true);
      try {
        const destino = fresco ? `${url}${url.includes("?") ? "&" : "?"}fresco=1` : url;
        const res = await fetch(destino, {
          credentials: "include",
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (res.status === 403) {
          // Cambiar de rol obliga a volver a entrar: hasta entonces no hay nada que reintentar.
          vetadoRef.current = true;
          setSinPermiso(true);
          setError(null);
          return;
        }
        if (!res.ok) throw new Error(await mensajeDeError(res));
        const json = (await res.json()) as T;
        if (ctrl.signal.aborted) return;
        setDatos(json);
        setError(null);
        setActualizado(new Date());
      } catch (e) {
        if (ctrl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(
          e instanceof Error && e.message ? e.message : "No se pudo cargar. Reintenta en un rato.",
        );
      } finally {
        if (ctrlRef.current === ctrl) setCargando(false);
      }
    },
    [url],
  );

  useEffect(() => {
    void pedir();
    if (cadaMs <= 0) return () => ctrlRef.current?.abort();
    let reloj: ReturnType<typeof setInterval> | null = null;
    const arrancar = () => {
      if (!reloj) reloj = setInterval(() => void pedir(), cadaMs);
    };
    const parar = () => {
      if (reloj) clearInterval(reloj);
      reloj = null;
    };
    const alCambiar = () => {
      if (document.visibilityState === "visible") {
        void pedir();
        arrancar();
      } else parar();
    };
    if (document.visibilityState === "visible") arrancar();
    document.addEventListener("visibilitychange", alCambiar);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", alCambiar);
      ctrlRef.current?.abort();
    };
  }, [pedir, cadaMs]);

  const recargar = useCallback((fresco?: boolean) => void pedir(fresco), [pedir]);
  return { datos, cargando, error, sinPermiso, recargar, actualizado };
}

/** Lo vendido por hora del día `dia` (y de la víspera). `null` = hoy. Se refresca cada 30 s. */
export function useSerieHora(
  dia: string | null = null,
  cadaMs = 30_000,
): EstadoGet<RespuestaSerieHora> {
  return useGet<RespuestaSerieHora>(`/api/goals/serie?por=hora${dia ? `&dia=${dia}` : ""}`, cadaMs);
}

/** Lo vendido por día del mes "YYYY-MM" (y del mes anterior). `null` = el mes de hoy. */
export function useSerieMes(mes: string | null = null): EstadoGet<RespuestaSerieDia> {
  return useGet<RespuestaSerieDia>(`/api/goals/serie?por=dia${mes ? `&mes=${mes}` : ""}`);
}

/** Los logros del negocio, medidos en el servidor. */
export function useLogros(): EstadoGet<RespuestaLogros> {
  return useGet<RespuestaLogros>("/api/goals/logros");
}
