"use client";

/**
 * Los filtros y el orden de la vista Lotes.
 *
 * Salieron de `CtpLotesView` (27-09) sin cambiar la regla: multi-selección en
 * cada eje (adentro de un filtro los valores suman, entre filtros se cruzan) y
 * el orden «Lo que corre primero» por defecto — el del backend es por estado y
 * creación, un orden de base de datos, no de trabajo.
 */

import { useMemo, useState } from "react";
import type { FiltroLotes, OrdenLotes } from "@/lib/forestal/lotes-aserrio";

/** El filtro rápido de la barra (2026-10-02): ¿al lote le queda madera aserrada en patio? */
export type FiltroMadera = "todos" | "con" | "sin";

export function useFiltrosLotes() {
  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState<string[]>([]);
  const [estado, setEstado] = useState<string[]>([]);
  /* Los dos ejes nuevos: cuánto le queda al lote y cómo viene con su fecha. */
  const [sobra, setSobra] = useState<string[]>([]);
  const [situacion, setSituacion] = useState<string[]>([]);
  const [orden, setOrden] = useState<OrdenLotes>("urgencia");
  /* A la vista, como la búsqueda: no cuenta en el globo de «Filtros». */
  const [madera, setMadera] = useState<FiltroMadera>("todos");

  const filtro: FiltroLotes = useMemo(
    () => ({ texto, especie, estado, sobra, situacion }),
    [texto, especie, estado, sobra, situacion],
  );
  /** Cuántos desplegables tienen algo elegido (la búsqueda no cuenta: se ve). */
  const activos = [especie, estado, sobra, situacion].filter((v) => v.length > 0).length;

  return {
    texto,
    setTexto,
    especie,
    setEspecie,
    estado,
    setEstado,
    sobra,
    setSobra,
    situacion,
    setSituacion,
    orden,
    setOrden,
    madera,
    setMadera,
    filtro,
    activos,
    filtrando: Boolean(texto) || activos > 0 || madera !== "todos",
    limpiar: () => {
      setTexto("");
      setEspecie([]);
      setEstado([]);
      setSobra([]);
      setSituacion([]);
      setMadera("todos");
    },
  };
}

export type FiltrosLotes = ReturnType<typeof useFiltrosLotes>;
