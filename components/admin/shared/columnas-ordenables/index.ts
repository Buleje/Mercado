/**
 * columnas-ordenables — arrastrar los títulos para reordenar las columnas de
 * una tabla, recordado por tabla (Brandon, 2026-09-26). Receta en
 * `use-orden-columnas.ts`.
 */
export { useOrdenColumnas, type UseOrdenColumnasResult } from "./use-orden-columnas";
export { EnOrden, BotonRestablecerColumnas } from "./en-orden";
export {
  useVisibilidadColumnas,
  columnasQueSeVen,
  type ColumnaElegible,
  type UseVisibilidadColumnasResult,
} from "./use-columnas-visibles";
export { BotonColumnasVisibles } from "./BotonColumnas";
