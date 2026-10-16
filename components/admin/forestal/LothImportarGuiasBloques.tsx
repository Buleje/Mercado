"use client";

/**
 * Todos los datos de una guía IMPORTADA al Libro TH, dibujados como el
 * talonario (Brandon 16-10: «que se parezca lo más posible a esos formatos…
 * con ese color de texto, tamaños, formatos»): la GTF en el orden del Anexo I
 * del 2024 (`gtf-datos-papel-guia`) y el resumen por especie con la misma cara
 * de papel (`gtf-datos-papel-especies`).
 *
 * `partes` (07-10-2026, Brandon: «los datos en una sección y las trozas y
 * resúmenes en otra»): la vista previa de importar dibuja la guía en «Datos de
 * la guía» y el resumen por especie en «Trozas y resumen». Sin `partes`, todo
 * junto (la ficha leída de un documento).
 *
 * Los valores salen de `bloquesDeGuia`, la misma fuente que la hoja del CTP y
 * el PDF; los números, de `casilleroGtf2024` (ADR-494). Sólo lectura, y lo que
 * SERFOR no publica se dice ausente («No lo publica SERFOR»), no vacío.
 */

import { useMemo } from "react";
import { resumenPorEspecie, type PiezaParaResumen } from "@/lib/forestal/loth-importar-guia-resumen";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import GtfDatosPapelGuia from "./gtf-datos-papel-guia";
import { ResumenEspeciesPapel } from "./gtf-datos-papel-especies";

/** Qué parte de la guía se dibuja: todo, sólo el documento o sólo el resumen de lo que viaja. */
export type PartesDeLaGuia = "todo" | "datos" | "resumen";

export default function LothImportarGuiasBloques({
  ficha,
  piezas,
  partes = "todo",
}: {
  ficha: GtfSerfor | null;
  piezas: readonly PiezaParaResumen[];
  partes?: PartesDeLaGuia;
}) {
  const resumen = useMemo(() => resumenPorEspecie(piezas, ficha?.productos), [piezas, ficha]);

  /* Sin ficha (un ingreso sin la consulta de SERFOR) sólo hay lista de trozas: va el resumen solo. */
  if (!ficha) return partes === "datos" ? null : <ResumenEspeciesPapel r={resumen} />;
  if (partes === "resumen") return <ResumenEspeciesPapel r={resumen} />;
  if (partes === "datos") return <GtfDatosPapelGuia ficha={ficha} />;
  return (
    <div className="space-y-3">
      <GtfDatosPapelGuia ficha={ficha} />
      <ResumenEspeciesPapel r={resumen} />
    </div>
  );
}
