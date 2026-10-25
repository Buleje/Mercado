"use client";

/**
 * Las cubicaciones de madera aserrada guardadas del negocio (KV por tenant en
 * `/api/admin/forestal/cubicaciones`), con su borrado.
 *
 * Vino de `CubicacionesGuardadas` (la lista que se abría desde «Lote ▾») sin
 * cambiar su regla de carga: una carga que salió antes de un cambio trae la
 * lista vieja —el GET del doble montaje volvía después del borrado y la
 * tarjeta reaparecía (mismo bug medido en Tareas el 2026-09-14)—. Sólo aplica
 * su lista la carga más nueva, y sólo si no hubo cambios mientras viajaba;
 * cada borrado termina con una carga silenciosa.
 *
 * `enLibro` (del servidor): las que amparan líneas vivas del Libro, con el
 * motivo por el que no se borran. El servidor frena igual con 409 si alguien
 * llama la API a mano o la lista quedó vieja; su mensaje es el que se muestra.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

const URL_CUBICACIONES = "/api/admin/forestal/cubicaciones";

/** Por qué una guardada no se borra (está en el Libro): lo arma el servidor. */
export interface EnLibroDeGuardada {
  lineas: { id: string; lineNo: number; fecha: string }[];
  motivo: string;
}

export function useGuardadasDelCubicador(recargarToken?: number): {
  lista: CubicacionRegistro[];
  /** id → líneas vivas del Libro que ampara y el motivo. Ausente = se puede borrar. */
  enLibro: Record<string, EnLibroDeGuardada>;
  cargando: boolean;
  error: string | null;
  /** id que se está borrando (para su spinner). */
  borrando: string | null;
  recargar: () => void;
  /** true = se borró. */
  borrar: (id: string) => Promise<boolean>;
  /** Pone en la lista la guardada que devolvió una escritura (precio anotado), sin esperar la recarga. */
  reemplazar: (c: CubicacionRegistro) => void;
} {
  const [lista, setLista] = useState<CubicacionRegistro[]>([]);
  const [enLibro, setEnLibro] = useState<Record<string, EnLibroDeGuardada>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const cargasRef = useRef({ ultima: 0, cambios: 0 });

  const cargar = useCallback(async (opciones?: { silenciosa?: boolean }) => {
    const esta = ++cargasRef.current.ultima;
    const cambiosAlSalir = cargasRef.current.cambios;
    /* La silenciosa no muestra el cargador ni borra el aviso de un borrado fallido. */
    if (!opciones?.silenciosa) {
      setCargando(true);
      setError(null);
    }
    try {
      const r = await fetch(`${URL_CUBICACIONES}?enLibro=1`, { credentials: "include", cache: "no-store" });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { message?: string };
        throw new Error(j?.message ?? `No se pudieron cargar las guardadas (HTTP ${r.status})`);
      }
      const j = (await r.json()) as { cubicaciones?: CubicacionRegistro[]; enLibro?: Record<string, EnLibroDeGuardada> };
      if (esta === cargasRef.current.ultima && cambiosAlSalir === cargasRef.current.cambios) {
        setLista(j.cubicaciones ?? []);
        setEnLibro(j.enLibro ?? {});
      }
    } catch (e) {
      if (esta === cargasRef.current.ultima && !opciones?.silenciosa) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (esta === cargasRef.current.ultima) setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar, recargarToken]);

  const borrar = useCallback(async (id: string): Promise<boolean> => {
    setBorrando(id);
    cargasRef.current.cambios += 1;
    try {
      const r = await fetch(`${URL_CUBICACIONES}?id=${encodeURIComponent(id)}`, {
        method: "DELETE", headers: csrfHeaders(), credentials: "include",
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { message?: string };
        /* 409 = está en el Libro: el mensaje del servidor ya dice qué línea y el camino. */
        if (r.status === 409 && j?.message) {
          setError(j.message);
          return false;
        }
        throw new Error(j?.message ?? `HTTP ${r.status}`);
      }
      setLista((prev) => prev.filter((x) => x.id !== id));
      return true;
    } catch (e) {
      setError(`No se pudo borrar: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setBorrando(null);
      void cargar({ silenciosa: true });
    }
  }, [cargar]);

  const recargar = useCallback(() => { void cargar(); }, [cargar]);

  /* Una carga que salió antes de la escritura no la pisa (cuenta como cambio). */
  const reemplazar = useCallback((c: CubicacionRegistro) => {
    cargasRef.current.cambios += 1;
    setLista((prev) => prev.map((x) => (x.id === c.id ? c : x)));
  }, []);

  return { lista, enLibro, cargando, error, borrando, recargar, borrar, reemplazar };
}
