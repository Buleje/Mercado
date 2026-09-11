"use client";

/**
 * use-especies-catalogo — la lista de especies que ofrece el cubicador.
 *
 * Antes era una constante del código (`ESPECIES_MADERA`), igual para todos los
 * tenants. Ahora cada aserradero arma la suya (ADR-410) y esta lectura es la
 * que usan el selector, la tabla y el dictado por voz: **una sola fuente**, o
 * el dictado reconocería especies que el selector no ofrece.
 *
 * Mientras carga —y si el pedido falla— se devuelven las de fábrica: quedarse
 * sin especies porque el catálogo no respondió sería peor que no poder editarlo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  CATALOGO_VACIO,
  nombresDisponibles,
  type CatalogoEspecies,
  type EspecieDisponible,
} from "@/lib/forestal/especies-catalogo";

const API = "/api/admin/forestal/especies";

interface Respuesta {
  catalogo?: CatalogoEspecies;
  especies?: EspecieDisponible[];
  ocultas?: EspecieDisponible[];
  mensaje?: string;
}

export function useEspeciesCatalogo() {
  const [catalogo, setCatalogo] = useState<CatalogoEspecies>(CATALOGO_VACIO);
  const [ocultas, setOcultas] = useState<EspecieDisponible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aplicar = useCallback((j: Respuesta) => {
    setCatalogo(j.catalogo ?? CATALOGO_VACIO);
    setOcultas(j.ocultas ?? []);
    return j.mensaje ?? null;
  }, []);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(API, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      aplicar((await r.json()) as Respuesta);
      setError(null);
    } catch {
      /* Sin catálogo se cubica igual con las de fábrica: es una ayuda, no un
         requisito. El error se muestra recién cuando alguien intenta editar. */
      setCatalogo(CATALOGO_VACIO);
    } finally {
      setCargando(false);
    }
  }, [aplicar]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Las tres escrituras comparten forma: mandan, aplican y devuelven el aviso. */
  const escribir = useCallback(
    async (init: RequestInit & { url?: string }): Promise<string | null> => {
      setGuardando(true);
      setError(null);
      try {
        const r = await fetch(init.url ?? API, {
          ...init,
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
        });
        const j = (await r.json().catch(() => ({}))) as Respuesta & {
          message?: string;
          error?: string;
        };
        if (!r.ok) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
        return aplicar(j);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setGuardando(false);
      }
    },
    [aplicar],
  );

  const agregar = useCallback(
    (nombre: string, cientifico?: string) =>
      escribir({
        method: "POST",
        body: JSON.stringify({ nombre, cientifico: cientifico ?? null }),
      }),
    [escribir],
  );
  const editar = useCallback(
    (clave: string, cambios: { nombre?: string; cientifico?: string | null }) =>
      escribir({ method: "PATCH", body: JSON.stringify({ clave, ...cambios }) }),
    [escribir],
  );
  const quitar = useCallback(
    (clave: string) =>
      escribir({ method: "DELETE", url: `${API}?clave=${encodeURIComponent(clave)}` }),
    [escribir],
  );
  const restaurar = useCallback(
    (clave: string) =>
      escribir({ method: "PATCH", body: JSON.stringify({ clave, accion: "restaurar" }) }),
    [escribir],
  );

  /** Sólo los nombres — es lo que consumen los `<select>` que ya existen. */
  const nombres = useMemo(() => nombresDisponibles(catalogo), [catalogo]);

  return {
    catalogo,
    nombres,
    ocultas,
    cargando,
    guardando,
    error,
    recargar,
    agregar,
    editar,
    quitar,
    restaurar,
  };
}
