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

import { useVistasGuardadas } from "@/hooks/use-vistas-guardadas";
import type { VistaDelSistema } from "@/lib/admin/vistas-guardadas";
import { MenuVistasGuardadas } from "./MenuVistasGuardadas";
import type { EstadoFiltros, FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";

const SISTEMA: readonly VistaDelSistema<EstadoFiltros>[] = [
  { id: "sin-filtros", nombre: "Sin filtros", ayuda: "La tabla entera", estado: { facetas: {}, textos: {} } },
];

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lo leído del navegador o del servidor: una lista de textos o un rango por columna; textos por columna. */
export function esEstadoFiltros(e: unknown): e is EstadoFiltros {
  if (!esObjeto(e) || !esObjeto(e.facetas) || !esObjeto(e.textos)) return false;
  const facetaValida = (v: unknown) =>
    Array.isArray(v) ? v.every((x) => typeof x === "string") : esObjeto(v) && "min" in v && "max" in v;
  return Object.values(e.facetas).every(facetaValida) && Object.values(e.textos).every((t) => typeof t === "string");
}

export function VistasDeFiltros<T>({ f, modulo }: { f: FiltrosTabla<T>; modulo: string }) {
  const vistas = useVistasGuardadas<EstadoFiltros>({
    modulo: `tabla.${modulo}`,
    estado: f.estado,
    aplicar: f.aplicarEstado,
    sistema: SISTEMA,
    valida: esEstadoFiltros,
  });
  if (f.activos === 0 && vistas.guardadas.length === 0) return null;
  return <MenuVistasGuardadas vistas={vistas} queGuarda="Los filtros de las columnas de esta tabla" ejemplo="Ej.: Vencidos de este mes" />;
}
