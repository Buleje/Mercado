"use client";

/**
 * Las acciones del modal del día que no escriben en el libro: traer todas las
 * piezas al cubicado (una copia de trabajo) y bajar el Excel pieza por pieza.
 * Y la `nota` de arriba de la tabla, que dice lo último que pasó.
 *
 * Salió de `CtpDiaDeProduccionModal` (27-09) para que el modal quede en lo que
 * decide: qué se abre encima de qué y qué se relee después de escribir.
 */

import { useCallback, useMemo, useState } from "react";
import { exportSheetsToExcel } from "@/lib/export-excel";
import { hojasDelResumen } from "@/lib/forestal/resumen-de-jornadas-excel";
import { fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  hojaPiezaPorPieza,
  piezasDeLasCorridas,
  type FilaDePieza,
} from "@/lib/forestal/piezas-del-dia";
import type { JornadasConPaquetes } from "./use-jornadas-con-paquetes";

export function useAccionesDelDia({
  dia,
  datos,
  filas,
  onCopiarAlCubicado,
}: {
  dia: string;
  datos: JornadasConPaquetes | null;
  filas: readonly FilaDePieza[];
  onCopiarAlCubicado?: (piezas: PiezaCubicada[]) => void;
}) {
  /** Lo último que pasó (se guardó, se trajo, falló el Excel): se dice arriba de la tabla. */
  const [nota, setNota] = useState<string | null>(null);
  /** Traído una vez: un segundo clic duplicaría las piezas en el cubicado. */
  const [traido, setTraido] = useState(false);
  const [bajando, setBajando] = useState(false);
  const aTraer = useMemo(() => (datos ? piezasDeLasCorridas(datos.detalle) : null), [datos]);

  const traerTodo = useCallback(() => {
    if (!onCopiarAlCubicado || !aTraer || aTraer.piezas.length === 0 || !datos) return;
    onCopiarAlCubicado(aTraer.piezas);
    setTraido(true);
    const piezas = aTraer.piezas.reduce((a, p) => a + p.cantidad, 0);
    const corridas = datos.detalle.length;
    setNota(
      `${aTraer.piezas.length} fila${aTraer.piezas.length === 1 ? "" : "s"} (${fmtPiezas(piezas)} piezas) de ${
        corridas === 1 ? "la corrida" : `las ${corridas} corridas`
      } al lote cubicado. Es una copia: guardarla crea corridas NUEVAS — las de este día no se tocan.`,
    );
  }, [onCopiarAlCubicado, aTraer, datos]);

  const bajarExcel = useCallback(async () => {
    if (!datos) return;
    setBajando(true);
    try {
      await exportSheetsToExcel(
        [hojaPiezaPorPieza(filas), ...hojasDelResumen(datos, "diaEspecie")],
        `produccion-${dia}-pieza-por-pieza`,
      );
    } catch (e) {
      setNota(`No se pudo descargar el Excel: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBajando(false);
    }
  }, [datos, filas, dia]);

  return { nota, setNota, traido, bajando, aTraer, traerTodo, bajarExcel };
}
