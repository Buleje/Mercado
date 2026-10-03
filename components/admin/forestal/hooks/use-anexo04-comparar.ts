"use client";

/**
 * Lo que alimenta la pestaña «Comparar con el resumen» del ANEXO N° 04.
 *
 * El RESUMEN son las piezas con que se abrió el modal (las del cubicador, las
 * tildadas en Resúmenes, las del permiso…), del mismo dueño si se eligió uno:
 * comparar la cubicación de un dueño contra el lote entero haría «diferir»
 * todo. Si el modal se abrió sin piezas (desde el Libro), el resumen es la
 * cubicación elegida como origen, antes de corregir medidas.
 *
 * El ANEXO son las filas que van a la hoja (`filasEditadas`).
 */
import { useMemo } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { UnidadVolumen } from "@/lib/forestal/anexo04-serfor";
import { compararAnexoConResumen, type ComparacionAnexo } from "@/lib/forestal/anexo04-comparar";

export function useAnexo04Comparar(ctx: {
  /** Las piezas con que se abrió el modal. */
  rows: PiezaCubicada[];
  /** Las del origen elegido (= `rows` con el lote actual). */
  filasOrigen: PiezaCubicada[];
  filasEditadas: PiezaCubicada[];
  dueno: string | "todos";
  unidadV: UnidadVolumen;
  especieGlobal?: string;
  totalManualM3: number | null;
  /** Cuántas piezas tienen medidas corregidas en la hoja. */
  corregidas: number;
  /** El origen NO es el lote con que se abrió (otra cubicación, un emitido). */
  otroOrigen: boolean;
  rotuloDeLasPiezas?: string;
}): { comparacion: ComparacionAnexo; rotulo: string; contexto: string[]; pastilla?: string } {
  const { rows, filasOrigen, filasEditadas, dueno, unidadV, especieGlobal, totalManualM3, corregidas, otroOrigen, rotuloDeLasPiezas } = ctx;

  const referencia = useMemo(() => {
    const base = rows.length > 0 ? rows : filasOrigen;
    return dueno === "todos" ? base : base.filter((r) => (r.dueno?.trim() || "") === dueno);
  }, [rows, filasOrigen, dueno]);

  const comparacion = useMemo(
    () => compararAnexoConResumen({ filasAnexo: filasEditadas, referencia, unidadImpresa: unidadV, especieGlobal, totalManualM3 }),
    [filasEditadas, referencia, unidadV, especieGlobal, totalManualM3],
  );

  const base = rows.length > 0
    ? rotuloDeLasPiezas ?? `las ${rows.length} medidas con que se abrió`
    : "la cubicación elegida";
  const rotulo = dueno === "todos" ? base : `${base} · ${dueno}`;

  /* Sólo lo que EXPLICA una diferencia: el dueño no, porque el resumen ya
     está filtrado por el mismo dueño. */
  const contexto = [
    ...(corregidas > 0 ? [`${corregidas} ${corregidas === 1 ? "medida corregida" : "medidas corregidas"} en la hoja`] : []),
    ...(otroOrigen && rows.length > 0 ? ["La hoja usa otra cubicación"] : []),
  ];

  const pastilla = comparacion.filas.length === 0
    ? undefined
    : comparacion.difieren > 0
      ? `${comparacion.difieren} ${comparacion.difieren === 1 ? "difiere" : "difieren"}`
      : comparacion.redondeo > 0 ? "Cuadra (redondeo)" : "Exacto";

  return { comparacion, rotulo, contexto, pastilla };
}
