"use client";

/**
 * Vistas guardadas de los filtros del encabezado (Brandon 25-10: filtros tipo
 * Excel en todas las tablas + «ideas de alto nivel»): lo que pusiste en los
 * embudos de una tabla, con un nombre («Vencidos de este mes»), para volver con
 * un clic. Por persona y negocio, sincronizado en el servidor como las demás
 * vistas del panel (`useVistasGuardadas`, clave `vistas:tabla.<modulo>`).
 *
 * Lo monta `BarraFiltrosTabla` cuando la tabla le pasa `vistas="<modulo>"`.
 * Sin filtros puestos ni vistas tuyas no dibuja nada: no suma una fila vacía.
 */

import { useMemo } from "react";
import { useVistasGuardadas } from "@/hooks/use-vistas-guardadas";
import type { VistaDelSistema } from "@/lib/admin/vistas-guardadas";
import { MenuVistasGuardadas } from "./MenuVistasGuardadas";
import type { EstadoFiltros, FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";

const SIN_FILTROS: VistaDelSistema<EstadoFiltros> = { id: "sin-filtros", nombre: "Sin filtros", ayuda: "La tabla entera", estado: { facetas: {}, textos: {} } };

/** Las vistas de fábrica de una tabla («Vencidos», «Atrasadas»): van debajo de «Sin filtros». Si dependen
 *  de hoy, la tabla las arma con `useMemo` sobre la fecha (no una constante que envejece). */
export type PresetsFiltros = readonly VistaDelSistema<EstadoFiltros>[];
const SIN_PRESETS: PresetsFiltros = [];

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lo leído del navegador o del servidor: una lista de textos o un rango por columna; textos por columna. */
export function esEstadoFiltros(e: unknown): e is EstadoFiltros {
  if (!esObjeto(e) || !esObjeto(e.facetas) || !esObjeto(e.textos)) return false;
  const facetaValida = (v: unknown) =>
    Array.isArray(v) ? v.every((x) => typeof x === "string") : esObjeto(v) && "min" in v && "max" in v;
  return Object.values(e.facetas).every(facetaValida) && Object.values(e.textos).every((t) => typeof t === "string");
}

export function VistasDeFiltros<T>({ f, modulo, presets = SIN_PRESETS }: { f: FiltrosTabla<T>; modulo: string; presets?: PresetsFiltros }) {
  const sistema = useMemo(() => [SIN_FILTROS, ...presets], [presets]);
  const vistas = useVistasGuardadas<EstadoFiltros>({
    modulo: `tabla.${modulo}`,
    estado: f.estado,
    aplicar: f.aplicarEstado,
    sistema,
    valida: esEstadoFiltros,
  });
  /* Con vistas de fábrica el menú está siempre: es la puerta a ellas. */
  if (f.activos === 0 && vistas.guardadas.length === 0 && presets.length === 0) return null;
  return <MenuVistasGuardadas vistas={vistas} queGuarda="Los filtros de las columnas de esta tabla" ejemplo="Ej.: Vencidos de este mes" />;
}
