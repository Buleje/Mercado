"use client";

/**
 * Qué se está mirando ahora mismo: un chip por VALOR elegido (y uno por cada
 * rango o búsqueda de columna), con su cruz y «Limpiar todo».
 *
 * Uno por valor y no uno por campo (Brandon, 2026-09-10): con dos especies
 * puestas, sacar una no debería sacar la otra. Se esconde entero cuando no hay
 * ningún filtro — una fila vacía enseña a no mirar la fila.
 *
 * Los de las columnas nuevas (`extra`) llegan hechos de `useFiltrosTrozas`; los
 * del padre (estado, tramo, especie, guía, título) se arman acá. Todos salen en
 * la misma fila y se quitan con `quitar(id)`.
 */

import { ChipsDeFiltros, type ChipFiltro } from "@/components/admin/shared/filtros-columna";
import { ESTADO_META, SIN_TITULO, type EstadoTroza } from "@/lib/forestal/trozas-patio";
import type { FiltrosTrozas } from "./ctp-trozas-filtros-hook";

const TRAMO_LABEL: Record<string, string> = {
  fresca: "Menos de 30 días",
  atencion: "30 a 59 días",
  riesgo: "60 días o más",
};

export interface CtpTrozasFiltrosActivosProps {
  texto: string;
  onTexto: (v: string) => void;
  estadoFiltro: readonly EstadoTroza[];
  onEstadoFiltro: (v: EstadoTroza[]) => void;
  tramoFiltro: readonly string[];
  onTramoFiltro: (v: string[]) => void;
  especie: readonly string[];
  onEspecie: (v: string[]) => void;
  guia: readonly string[];
  onGuia: (v: string[]) => void;
  titulo: readonly string[];
  onTitulo: (v: string[]) => void;
  extra: FiltrosTrozas;
  onLimpiar: () => void;
}

export default function CtpTrozasFiltrosActivos({
  texto, onTexto, estadoFiltro, onEstadoFiltro, tramoFiltro, onTramoFiltro,
  especie, onEspecie, guia, onGuia, titulo, onTitulo, extra, onLimpiar,
}: CtpTrozasFiltrosActivosProps) {
  /* Cada chip sabe quitarse: el `id` lleva el campo y el valor. */
  const quitar: Record<string, () => void> = {};
  const chips: ChipFiltro[] = [];
  const poner = (id: string, label: string, texto: string, accion: () => void) => {
    chips.push({ id, label, texto });
    quitar[id] = accion;
  };
  for (const e of estadoFiltro) poner(`estado:${e}`, "Estado", `Estado: ${ESTADO_META[e].label}`, () => onEstadoFiltro(estadoFiltro.filter((x) => x !== e)));
  for (const t of tramoFiltro) poner(`tramo:${t}`, "Parada", TRAMO_LABEL[t] ?? t, () => onTramoFiltro(tramoFiltro.filter((x) => x !== t)));
  for (const e of especie) poner(`especie:${e}`, "Especie", `Especie: ${e}`, () => onEspecie(especie.filter((x) => x !== e)));
  for (const g of guia) poner(`guia:${g}`, "Guía", `Guía: ${g}`, () => onGuia(guia.filter((x) => x !== g)));
  for (const t of titulo) {
    poner(`titulo:${t}`, "Título", t === SIN_TITULO ? "Sin título declarado" : `Título: ${t}`, () => onTitulo(titulo.filter((x) => x !== t)));
  }
  if (texto.trim()) poner("texto", "Búsqueda", `«${texto.trim()}»`, () => onTexto(""));
  for (const c of extra.chips) poner(`x:${c.id}`, c.label, c.texto, () => extra.quitar(c.id));

  if (chips.length === 0) return null;
  return (
    <ChipsDeFiltros
      chips={chips}
      onQuitar={(id) => quitar[id]?.()}
      onLimpiarTodo={onLimpiar}
      className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-1.5"
    />
  );
}
