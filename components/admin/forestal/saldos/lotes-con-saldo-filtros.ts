/**
 * Columnas con autofiltro de «Lo que resta en cada lote». Todas las cantidades
 * son m³ (o piezas/días): ninguna cambia de unidad por fila, así que llevan rango.
 * Un lote sin producción sumable (`null`) no entra en un rango de Producido/Resta:
 * el libro no sabe ese dato y la tabla no debe afirmarlo.
 */
import type { ColumnaFiltro } from "@/components/admin/shared/filtros-columna";
import type { LoteDeReporte } from "@/lib/forestal/saldos-reporte";

export const COLUMNAS_LOTES_CON_SALDO: ColumnaFiltro<LoteDeReporte>[] = [
  { id: "lote", label: "Lote", tipo: "texto", valor: (l) => l.code },
  { id: "permiso", label: "N° de permiso", tipo: "multi", valor: (l) => l.permisos },
  { id: "especie", label: "Especie", tipo: "multi", valor: (l) => l.especie },
  { id: "estado", label: "Estado", tipo: "multi", valor: (l) => l.status },
  { id: "consumido", label: "Consumido", tipo: "rango", numero: (l) => l.consumidoM3, unidad: "m³", paso: 0.01 },
  { id: "al56", label: "Al 56 %", tipo: "rango", numero: (l) => l.esperado56M3, unidad: "m³", paso: 0.01 },
  { id: "producido", label: "Producido", tipo: "rango", numero: (l) => l.producidoM3, unidad: "m³", paso: 0.01 },
  { id: "resta", label: "Resta", tipo: "rango", numero: (l) => l.restaM3, unidad: "m³", paso: 0.01 },
  { id: "piezas", label: "Piezas", tipo: "rango", numero: (l) => l.piezas, paso: 1 },
  { id: "parado", label: "Parado", tipo: "rango", numero: (l) => l.diasParado, unidad: "días", paso: 1 },
  { id: "fin", label: "Fin de proceso", tipo: "fecha", numero: (l) => l.finProceso },
  { id: "plazo", label: "Plazo", tipo: "rango", numero: (l) => l.diasParaVencer, unidad: "días", paso: 1 },
];
