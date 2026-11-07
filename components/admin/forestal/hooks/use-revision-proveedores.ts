"use client";

import { useCallback, useRef, useState } from "react";
import type { FilaRevision, ResumenRevision } from "@/lib/forestal/revision-proveedores";

export interface RevisionProveedores {
  resumen: ResumenRevision;
  /** Las que hay que mirar (rojo, ámbar, solo nombre). */
  filas: FilaRevision[];
  /** Limpias y sin datos: solo para el papel de resultado (una respuesta vieja no las trae). */
  sinAlerta?: FilaRevision[];
  corteSerfor: string | null;
  revisadoEn: string;
}

/**
 * «Revisar a todos»: una pasada por toda la libreta contra OSINFOR y SERFOR.
 * Sin caché del lado del navegador (cada toque es una revisión fresca; el
 * servidor ya guarda OSINFOR 12 h y la lista de SERFOR 24 h). Una respuesta
 * que llega después de otra más nueva se descarta.
 */
export function useRevisionProveedores() {
  const [datos, setDatos] = useState<RevisionProveedores | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turno = useRef(0);

  const revisar = useCallback(async () => {
    const mio = ++turno.current;
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/serfor-infractores/directorio", {
        credentials: "include",
      });
      const json = (await r.json().catch(() => ({}))) as {
        data?: RevisionProveedores;
        error?: string;
      };
      if (mio !== turno.current) return;
      if (!r.ok || !json.data) {
        setError(
          r.status === 429
            ? "Ya revisaste varias veces seguidas; espera unos minutos."
            : (json.error ?? `El servidor respondió ${r.status}`),
        );
        return;
      }
      setDatos(json.data);
    } catch (err) {
      if (mio === turno.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, []);

  return { datos, cargando, error, revisar };
}
