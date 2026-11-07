"use client";

/**
 * useGtfEnCtp — ¿cada guía despachada desde el bosque ya entró al Libro CTP?
 *
 * El LO-TH termina en «Despacho de trozas» con un N° de GTF; el Libro CTP
 * empieza en «Ingresos» con ESE mismo número (RDE D000025-2023: el origen legal
 * de la planta es la guía). Son dos libros del mismo negocio y hasta ahora no
 * se hablaban: la fila del despacho no sabía si la troza ya llegó a la planta.
 *
 * Una consulta por guía distinta de la página (`wood-entries?gtf=`, que filtra
 * por igualdad), con tope — una página del libro trae pocas guías: cada una
 * lleva varias trozas. Sin Libro CTP (403) o si la consulta falla, devuelve
 * `null` para esa guía y la pantalla NO acusa nada: «no la encontré» y «no la
 * busqué» no son lo mismo.
 */

import { useEffect, useMemo, useState } from "react";

export interface IngresoCtp {
  id: string;
  libroNro: number | null;
  entryDate: string;
  status: string;
}

/** `"sin-ingreso"` = el CTP respondió y no la tiene. Ausente del mapa = no se sabe. */
export type EstadoGtfCtp = IngresoCtp | "sin-ingreso";

const TOPE_GUIAS = 25;

export function useGtfEnCtp(gtfs: (string | null | undefined)[], activo: boolean) {
  const clave = useMemo(
    () =>
      Array.from(new Set(gtfs.map((g) => g?.trim()).filter((g): g is string => !!g)))
        .sort()
        .slice(0, TOPE_GUIAS)
        .join("\n"),
    [gtfs],
  );
  const [estado, setEstado] = useState<Map<string, EstadoGtfCtp>>(new Map());
  const [hayCtp, setHayCtp] = useState(true);

  useEffect(() => {
    if (!activo || !clave) return;
    const ctrl = new AbortController();
    const guias = clave.split("\n");
    Promise.all(
      guias.map(async (gtf): Promise<[string, EstadoGtfCtp | null]> => {
        const r = await fetch(
          `/api/admin/forestal/wood-entries?gtf=${encodeURIComponent(gtf)}&limit=5`,
          {
            credentials: "include",
            signal: ctrl.signal,
          },
        );
        if (r.status === 403) {
          setHayCtp(false);
          return [gtf, null];
        }
        if (!r.ok) return [gtf, null];
        const j = (await r.json()) as { entries?: IngresoCtp[] };
        const vivo = (j.entries ?? []).find((e) => e.status !== "anulado");
        return [gtf, vivo ?? "sin-ingreso"];
      }),
    )
      .then((pares) => {
        if (ctrl.signal.aborted) return;
        const m = new Map<string, EstadoGtfCtp>();
        for (const [g, e] of pares) if (e) m.set(g, e);
        setEstado(m);
      })
      .catch((err: unknown) => {
        // Una respuesta vieja cancelada no es un error; lo demás sí se dice.
        if (!ctrl.signal.aborted)
          console.warn("[loth] no se pudo cruzar las guías con el Libro CTP", err);
      });
    return () => ctrl.abort();
  }, [clave, activo]);

  return { estado, hayCtp };
}
