"use client";

/**
 * useLothPapelera — la papelera del Libro TH (`/api/admin/forestal/loth/papelera`).
 *
 * Lee lo borrado (agrupado por momento), lleva la selección y, a cada cambio
 * (con ~700 ms de espera), pide la VISTA PREVIA exacta de lo que volvería: el
 * servidor vuelve a pasar las reglas del libro de hoy y dice qué líneas no
 * vuelven y por qué. Sólo vale la última vista pedida (AbortController).
 * Abortar no corta la tx del servidor (cada vista es una tx con candados): por
 * eso la espera es larga, para no abrir una por cada casilla de una tanda.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import type { BorradoDelLibro, ResultadoRecuperar } from "@/lib/forestal/loth-papelera";

const URL_PAPELERA = "/api/admin/forestal/loth/papelera";
const ESPERA_VISTA_MS = 700;

type CuerpoError = { message?: string; error?: string };

const mensajeDe = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function leerBorrados(signal: AbortSignal): Promise<{ borrados: BorradoDelLibro[]; total: number }> {
  const r = await fetch(URL_PAPELERA, { credentials: "include", signal });
  const j = await leerJson<{ borrados?: BorradoDelLibro[]; total?: number } & CuerpoError>(r);
  if (!r.ok || !j?.borrados) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
  return { borrados: j.borrados, total: j.total ?? j.borrados.reduce((a, g) => a + g.lineas.length, 0) };
}

async function pedirRecuperar(
  ids: readonly string[],
  vista: boolean,
  signal?: AbortSignal,
): Promise<ResultadoRecuperar> {
  const r = await fetch(`${URL_PAPELERA}${vista ? "?vista=1" : ""}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ ids }),
    signal,
  });
  const j = await leerJson<ResultadoRecuperar & CuerpoError>(r);
  if (!r.ok || !j) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
  return j;
}

export function useLothPapelera() {
  const [grupos, setGrupos] = useState<BorradoDelLibro[] | null>(null);
  const [total, setTotal] = useState(0);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(() => new Set());
  const [vista, setVista] = useState<{ clave: string; r: ResultadoRecuperar } | null>(null);
  /** La selección cuya vista previa falló: el botón deja de girar y el error queda a la vista. */
  const [vistaFallo, setVistaFallo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* La clave de la selección: la vista sólo está «al día» si se pidió para ESTA. */
  const clave = useMemo(() => [...seleccion].sort().join(","), [seleccion]);

  useEffect(() => {
    const ac = new AbortController();
    setGrupos(null);
    setError(null);
    leerBorrados(ac.signal)
      .then((b) => {
        if (ac.signal.aborted) return;
        setGrupos(b.borrados);
        setTotal(b.total);
      })
      .catch((err) => {
        if (!ac.signal.aborted) setError(mensajeDe(err));
      });
    return () => ac.abort();
  }, [recarga]);

  useEffect(() => {
    if (seleccion.size === 0) {
      setVista(null);
      return;
    }
    const ac = new AbortController();
    const espera = setTimeout(() => {
      pedirRecuperar([...seleccion], true, ac.signal)
        .then((r) => {
          if (ac.signal.aborted) return;
          setVista({ clave, r });
          setVistaFallo(null);
          setError(null);
        })
        .catch((err) => {
          if (ac.signal.aborted) return;
          setVistaFallo(clave);
          setError(mensajeDe(err));
        });
    }, ESPERA_VISTA_MS);
    return () => {
      clearTimeout(espera);
      ac.abort();
    };
  }, [seleccion, clave]);

  const alternarLinea = useCallback((id: string) => {
    setSeleccion((prev) => {
      const sig = new Set(prev);
      if (!sig.delete(id)) sig.add(id);
      return sig;
    });
  }, []);

  /** Marcar el grupo marca todas sus líneas; si ya están todas, las suelta. */
  const alternarGrupo = useCallback((g: BorradoDelLibro) => {
    setSeleccion((prev) => {
      const sig = new Set(prev);
      const todas = g.lineas.every((l) => sig.has(l.id));
      for (const l of g.lineas) {
        if (todas) sig.delete(l.id);
        else sig.add(l.id);
      }
      return sig;
    });
  }, []);

  /** Escribe de verdad. Devuelve el resultado, o `null` si falló (el error queda a la vista). */
  const recuperar = useCallback(async (): Promise<ResultadoRecuperar | null> => {
    setBusy(true);
    setError(null);
    try {
      return await pedirRecuperar([...seleccion], false);
    } catch (err) {
      setError(mensajeDe(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, [seleccion]);

  return {
    grupos,
    cargando: grupos === null && error === null,
    error,
    /** Cuántas hay borradas en total (la lista trae las más recientes). */
    total,
    reintentar: () => setRecarga((n) => n + 1),
    /** Tras un recupero que no devolvió nada: relee y suelta la selección. */
    releer: () => {
      setSeleccion(new Set());
      setRecarga((n) => n + 1);
    },
    seleccion,
    alternarLinea,
    alternarGrupo,
    /** Lo último que dijo el servidor (puede ser de una selección anterior mientras llega la nueva). */
    vista: vista?.r ?? null,
    vistaAlDia: vista?.clave === clave && seleccion.size > 0,
    vistaFallida: vistaFallo === clave && seleccion.size > 0,
    busy,
    recuperar,
  };
}
