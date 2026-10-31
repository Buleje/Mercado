"use client";

/**
 * useLothMapaTalaVarios — «Elegir varios» en el mapa del Libro TH.
 *
 * Tocar un árbol EN PIE lo marca o lo desmarca, con la MISMA guarda que el
 * botón «Registrar tala» de la ficha (`talaDesdeElMapa`, `lib/forestal/
 * loth-mapa-arboles.ts`): un semillero, un talado o un descartado no se
 * marcan (avisa por qué); bajo el DMC o reservado por el POA sí, con el
 * mismo aviso que ya muestra la ficha de a uno.
 *
 * Al talar, arma la planilla con el MISMO `ArbolParaElegir` que «Ver censo»
 * (`arbolesDelMapaParaElegir`): la disponibilidad que ve la planilla es la
 * del libro, no la del mapa (que puede ir un paso atrás — ver
 * `lib/forestal/loth-censo-uso.ts`).
 */

import { useCallback, useMemo, useState } from "react";
import { talaDesdeElMapa } from "@/lib/forestal/loth-mapa-arboles";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { PoaConfig } from "@/lib/forestal/loth-poa";
import { arbolesDelMapaParaElegir, etiquetaTalarVarios } from "../loth-mapa-tala-varios";
import type { CensoTree, CensusTreeDTO } from "../loth-mapa-shared";
import type { PlanActivoMapa } from "./use-loth-mapa-datos";
import type { TandaTalaInicial } from "./use-tala-en-tanda";

/** Cambia en cada aviso, aunque el texto se repita: dispara el anuncio (`role="alert"`). */
export interface AvisoElegirVarios {
  n: number;
  texto: string;
  /** `true` = no se pudo marcar (semillero, talado, descartado). `false` = se marcó, con cuidado. */
  rechazo: boolean;
}

const SIN_MARCADOS: readonly string[] = [];

export function useLothMapaTalaVarios({
  censoAll,
  trees,
  raw,
  poaConfig,
  plan,
}: {
  /** El censo del mapa, ya cruzado con el POA (`der.censoAll`): trae `categoria`. */
  censoAll: CensoTree[];
  trees: CensusTreeDTO[];
  raw: LothEntryDTO[] | null;
  poaConfig: PoaConfig;
  plan: PlanActivoMapa | null;
}) {
  const [activo, setActivo] = useState(false);
  /** En el orden en que se marcó: la planilla numera las filas en ese orden. */
  const [marcados, setMarcados] = useState<readonly string[]>(SIN_MARCADOS);
  const [aviso, setAviso] = useState<AvisoElegirVarios | null>(null);

  const avisar = useCallback(
    (texto: string, rechazo: boolean) => setAviso((a) => ({ n: (a?.n ?? 0) + 1, texto, rechazo })),
    [],
  );

  const porId = useMemo(() => new Map(censoAll.map((t) => [t.id, t] as const)), [censoAll]);
  const marcadosSet = useMemo(() => new Set(marcados), [marcados]);

  /** Tocar un árbol: lo marca o lo desmarca. Desmarcar nunca lo bloquea la guarda. */
  const alternar = useCallback(
    (id: string) => {
      if (marcadosSet.has(id)) {
        setMarcados((m) => m.filter((x) => x !== id));
        return;
      }
      const arbol = porId.get(id);
      if (!arbol) return;
      const tala = talaDesdeElMapa(arbol);
      if (!tala.puede) {
        avisar(`Árbol ${arbol.code}: ${tala.nota}`, true);
        return;
      }
      setMarcados((m) => [...m, id]);
      if (tala.nota) avisar(`Árbol ${arbol.code}: ${tala.nota}`, false);
    },
    [marcadosSet, porId, avisar],
  );

  const limpiar = useCallback(() => {
    setMarcados(SIN_MARCADOS);
    setAviso(null);
  }, []);
  const activar = useCallback(() => setActivo(true), []);
  /** Salir del modo limpia lo marcado: entrar de nuevo arranca sin marcas. */
  const desactivar = useCallback(() => {
    setActivo(false);
    setMarcados(SIN_MARCADOS);
    setAviso(null);
  }, []);

  const totalM3 = useMemo(
    () => Number(marcados.reduce((s, id) => s + (porId.get(id)?.volumeM3 ?? 0), 0).toFixed(4)),
    [marcados, porId],
  );

  /** El censo cruzado con el libro: lo que va a leer la planilla. */
  const paraTanda = useMemo(() => arbolesDelMapaParaElegir(trees, raw, poaConfig), [trees, raw, poaConfig]);

  /** Los marcados, listos para `LothTalaTandaModal`. `null` si no hay nada que talar. */
  const armarTanda = useCallback((): TandaTalaInicial | null => {
    if (!plan || marcados.length === 0) return null;
    const por = new Map(paraTanda.map((a) => [a.id, a] as const));
    // El libro pudo talarlo entre que se marcó y se tocó «Talar»: se deja
    // afuera en vez de mandarlo a la planilla a que rebote.
    const arboles = marcados.flatMap((id) => {
      const a = por.get(id);
      return a && a.disponibilidad === "disponible" ? [a] : [];
    });
    if (arboles.length === 0) return null;
    const hoy = new Date().toISOString().slice(0, 10);
    return {
      planId: plan.id,
      planLabel: [plan.planNumber, plan.titularName].filter(Boolean).join(" — ") || null,
      arboles,
      comunes: { fecha: hoy, motosierrista: "", motosierristaId: null, hora: "", modo: null },
    };
  }, [plan, marcados, paraTanda]);

  return {
    activo,
    activar,
    desactivar,
    marcados: marcadosSet,
    lista: marcados,
    aviso,
    alternar,
    limpiar,
    totalM3,
    etiqueta: etiquetaTalarVarios(marcados.length),
    armarTanda,
  };
}

export type LothMapaTalaVarios = ReturnType<typeof useLothMapaTalaVarios>;
