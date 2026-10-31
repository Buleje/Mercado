"use client";

/**
 * useArbolesAMano — los árboles del censo para elegir de cuál salió cada troza
 * anotada a mano (15-10, «Árbol de origen en la troza»), juzgados en pantalla
 * con la MISMA regla que el servidor al registrar (`revisarArbolDeTroza`).
 *
 * Se leen la primera vez que se abre el selector (`cargar`), no al montar el
 * modal: la mayoría de las guías no lo usa. El mapa `porId` numera las trozas
 * con árbol como el trozado de siempre (`piezasAMano`: «001-TOR-A»).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { FaltanteLoth } from "@/lib/forestal/loth-guia-despacho";
import {
  excesoDeLaTala,
  revisarArbolDeTroza,
  type ArbolParaTroza,
  type ArbolRevisado,
} from "@/lib/forestal/loth-arbol-a-mano";
import { volumenDeFila, type TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";

export function useArbolesAMano({
  planId,
  filas,
}: {
  planId: string | null;
  filas: readonly TrozaAMano[];
}) {
  const [arboles, setArboles] = useState<ArbolParaTroza[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(false);

  /** Lee el censo una vez (`forzar` = volver a leer, p. ej. tras un error). */
  const cargar = useCallback(async (forzar = false) => {
    if (pedido.current && !forzar) return;
    pedido.current = true;
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/loth/despacho-guia?arboles=1", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json().catch(() => ({}))) as {
        arboles?: ArbolParaTroza[];
        message?: string;
      };
      if (!r.ok) throw new Error(j.message ?? `No se pudo leer el censo (${r.status})`);
      setArboles(Array.isArray(j.arboles) ? j.arboles : []);
    } catch (e) {
      pedido.current = false;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  const porId = useMemo(() => new Map((arboles ?? []).map((a) => [a.id, a])), [arboles]);

  /** El juicio de una fila (`null` = sin árbol, o el censo todavía no se leyó: lo decide el servidor). */
  const revisar = useCallback(
    (
      arbolId: string | null | undefined,
      especie: string | null | undefined,
    ): ArbolRevisado | null =>
      arbolId && arboles
        ? revisarArbolDeTroza(porId.get(arbolId), { planDeLaGuia: planId, especie })
        : null,
    [arboles, porId, planId],
  );

  /** Lo que ya suman las filas anotadas de cada árbol (m³), para T4. */
  const anotadoM3 = useMemo(() => {
    const out = new Map<string, number>();
    for (const f of filas)
      if (f.arbolId) out.set(f.arbolId, (out.get(f.arbolId) ?? 0) + volumenDeFila(f));
    return out;
  }, [filas]);

  /** T4 antes de agregar: ¿estas trozas (`nuevoM3`) más las anotadas pasan la tala del árbol? */
  const exceso = useCallback(
    (arbolId: string | null | undefined, nuevoM3 = 0): string | null => {
      const a = arbolId ? porId.get(arbolId) : undefined;
      return a ? excesoDeLaTala(a, (anotadoM3.get(a.id) ?? 0) + nuevoM3) : null;
    },
    [porId, anotadoM3],
  );

  /** Una por árbol con problema (plan, especie o T4): frenan «Registrar» antes del 422. */
  const faltan = useMemo(() => {
    const out = new Map<string, FaltanteLoth>();
    for (const f of filas) {
      if (!f.arbolId || out.has(f.arbolId)) continue;
      const r = revisar(f.arbolId, f.especie);
      const motivo = r && !r.ok ? r.mensaje : exceso(f.arbolId);
      if (motivo)
        out.set(f.arbolId, {
          seccion: "trozas",
          campo: `Árbol ${porId.get(f.arbolId)?.treeCode ?? "elegido"} (a mano)`,
          motivo,
        });
    }
    return [...out.values()];
  }, [filas, revisar, exceso, porId]);

  return { arboles, cargando, error, cargar, porId, revisar, exceso, faltan };
}

export type ArbolesAMano = ReturnType<typeof useArbolesAMano>;
