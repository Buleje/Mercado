/**
 * lib/types/recetas.ts
 *
 * Contract types for the Recetas module.
 * Shared between backend (RecetasDB, API routes) and frontend (RecetasModule).
 *
 * Referenced by CONTRACTS/ola-2.md — item #13.
 */

/**
 * Per-ingredient cost breakdown line, used inside RecetaCostBreakdown.
 */
export interface RecetaCostIngredientLine {
  productoId: number;
  nombre: string;
  cantidad: number;
  unidad: string;
  costoUnitario: number;
  costoLinea: number;
}

/**
 * Full cost breakdown of a recipe.
 *
 * Contract:
 *   costoTotalUnitario = costoIngredientes + costoManoObra + costoIndirectos
 *   margenBruto        = precioVenta - costoTotalUnitario
 *   margenPorcentaje   = (margenBruto / precioVenta) * 100   (0 if precioVenta = 0)
 */
export interface RecetaCostBreakdown {
  recetaId: string;
  recetaNombre: string;
  costoIngredientes: number;
  costoManoObra: number;
  costoIndirectos: number;
  costoTotalUnitario: number;
  precioVenta: number;
  margenBruto: number;
  margenPorcentaje: number;
  ingredientes: RecetaCostIngredientLine[];
}

/**
 * Result of a production run (registering one execution of a recipe).
 */
export interface ProductionResult {
  produccionLoteId: string;
  recetaId: string;
  cantidad: number;
  costoReal: number;
  movimientosCreados: number;
  stockIngrediente: Array<{
    productoId: number;
    previousStock: number;
    newStock: number;
  }>;
  stockProductoFinal: {
    productoId: number;
    previousStock: number;
    newStock: number;
  } | null;
}
