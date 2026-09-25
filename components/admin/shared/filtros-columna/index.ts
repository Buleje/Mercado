/**
 * filtros-columna — el autofiltro tipo Excel, genérico para cualquier tabla
 * admin (Fase 1, 2026-09-22). Fase 2: migrar los consumidores forestales de
 * `components/admin/forestal/ctp-filtros-panel.tsx` y agregar `filtrable` a
 * `<DataTable>` del DS — ver la propuesta en el reporte de la Fase 1.
 */
export { FiltroColumna, type FiltroColumnaProps } from "./filtro-columna";
export { FiltroColumnaMulti, type FiltroColumnaMultiProps } from "./filtro-columna-multi";
export { FiltroColumnaRango, type FiltroColumnaRangoProps } from "./filtro-columna-rango";
export { ChipsDeFiltros, type ChipsDeFiltrosProps } from "./chips-de-filtros";
export { usePopoverCabecera, SUMMARY_CABECERA, type PosicionPopover } from "./use-popover-cabecera";
export { useFiltrosDeColumna, type UseFiltrosDeColumnaResult } from "./use-filtros-de-columna";
export type {
  ColumnaFiltro,
  ChipFiltro,
  FacetaOpcion,
  FacetasEstado,
  Rango,
  RangoNumerico,
  TipoColumnaFiltro,
  ValorFaceta,
} from "@/lib/admin/filtros-columna";
