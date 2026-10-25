"use client";

/**
 * Reorden de la Predicción de ventas: productos para reordenar según la
 * demanda durante el tiempo de entrega, y el botón «Auto-reorden» (POST
 * /api/forecasting/auto-reorder, que crea órdenes de compra). Salió de
 * `ForecastingDashboard.tsx` sin cambios.
 *
 * - `ForecastReordenPanel` dibuja con los datos de quien lo monta (el tablero
 *   entero comparte una sola carga y un solo «Actualizar»).
 * - El default se carga solo y pide únicamente el reorden: así lo monta
 *   Compras › Sugerencias (plan «panel unificado», ola 3).
 */

import { DataTable } from "@buleje/design-system";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { RefreshCw, ShoppingCart, Loader2, CheckCircle } from "@buleje/design-system/icons";
import { cn, formatCurrency } from "@/lib/utils";
import { useForecasting, type Forecasting, type PanelForecast } from "./use-forecasting";
import { PanelCard } from "./ForecastPiezas";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";

/** Tope de `productIds` del POST /api/forecasting/auto-reorder (su schema Zod). */
const MAX_PEDIR = 500;

const PANELES: readonly PanelForecast[] = ["reorder"];

type Item = Forecasting["state"]["reorder"][number];
const esCritico = (i: Item) => i.currentStock < i.demandDuringLeadTime;

/** La lista de reorden llega entera del servidor: se filtra y ordena aquí. */
const COLUMNAS: readonly ColumnaFiltro<Item>[] = [
  { id: "producto", label: "Producto", tipo: "texto", valor: (i) => [i.productName, i.supplierName] },
  { id: "proveedor", label: "Proveedor", tipo: "multi", valor: (i) => i.supplierName || "Sin proveedor", soloConVarios: true },
  { id: "stock", label: "Stock actual", tipo: "rango", numero: (i) => i.currentStock },
  { id: "pedir", label: "Pedir", tipo: "rango", numero: (i) => i.suggestedQuantity },
  { id: "total", label: "Total est.", tipo: "rango", numero: (i) => i.estimatedTotal, unidad: "S/", paso: 0.01 },
  { id: "aviso", label: "Aviso", tipo: "multi", valor: (i) => [esCritico(i) ? "Crítico" : null, i.confidence < 0.5 ? "Baja confianza" : null].filter((x): x is string => !!x), soloConVarios: true },
];
const ORDEN: Record<string, AccesorOrden<Item>> = {
  producto: { valor: (i) => i.productName, texto: true },
  stock: { valor: (i) => i.currentStock },
  demanda: { valor: (i) => i.demandDuringLeadTime },
  pedir: { valor: (i) => i.suggestedQuantity },
  total: { valor: (i) => i.estimatedTotal },
  aviso: { valor: (i) => (esCritico(i) ? 2 : 0) + (i.confidence < 0.5 ? 1 : 0) },
};

export default function ForecastReorden() {
  const f = useForecasting(PANELES);
  return <ForecastReordenPanel f={f} />;
}

/** El panel B (ocupa las dos columnas de la grilla del tablero). */
export function ForecastReordenPanel({ f }: { f: Forecasting }) {
  const { state, autoReordering, autoReorderMsg, ejecutarAutoReorder } = f;
  const ft = useFiltrosTabla(state.reorder, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(ft.filtradas);
  const { confirm, notice } = useConfirm();
  const pedir = async () => {
    const filtrado = ft.activos > 0;
    const n = filtrado ? ft.filtradas.length : state.reorder.length;
    if (n === 0) {
      await notice({ title: "El filtro no deja ningún producto", description: "Quita o cambia un filtro para elegir qué pedir." });
      return;
    }
    // El servidor recibe hasta MAX_PEDIR ids: más que eso, pedir todo sin filtro.
    if (filtrado && n > MAX_PEDIR) {
      await notice({ title: `Son ${n} productos: el tope es ${MAX_PEDIR}`, description: "Ajusta el filtro, o quítalo para pedir todo lo sugerido." });
      return;
    }
    const lista = filtrado ? ft.filtradas : state.reorder;
    const suma = lista.reduce((t, r) => t + (Number(r.estimatedTotal) || 0), 0);
    const proveedores = new Set(lista.map((r) => r.supplierId)).size;
    const ok = await confirm({
      title: `¿Crear órdenes de compra de ${n} producto(s)${filtrado ? " (los que ves)" : ""}?`,
      description: `Unos ${formatCurrency(suma)} en ${proveedores} orden(es), una por proveedor, con la cantidad sugerida. El monto final lo calcula el sistema.`,
      confirmLabel: "Crear órdenes",
    });
    if (!ok) return;
    void ejecutarAutoReorder(filtrado ? ft.filtradas.map((r) => String(r.productId)) : undefined);
  };
  return (
        <div className="lg:col-span-2">
          <PanelCard
            icon={<ShoppingCart className="w-4 h-4" />}
            title={`Productos para Reordenar${state.reorder.length > 0 ? ` (${state.reorder.length})` : ""}`}
            loading={state.loading}
            error={state.errors.reorder}
            isEmpty={state.reorder.length === 0 && !state.loading && !state.errors.reorder}
            emptyMsg="No hay productos que necesiten reorden en este momento"
            headerExtra={
              state.reorder.length > 0 ? (
                <button
                  onClick={pedir}
                  disabled={autoReordering}
                  className={cn(
                    "flex items-center gap-1.5 px-3 rounded-xl text-sm font-bold",
                    "bg-[var(--text-primary)] hover:opacity-90 dark:bg-zinc-700 dark:hover:bg-zinc-600",
                    "text-white transition-colors",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    "h-12", // touch target del panel (48 px)
                  )}
                  aria-label="Ejecutar reorden automática"
                  title={ft.activos > 0 ? `Pide sólo los ${ft.filtradas.length} productos que ves` : "Crea las órdenes de compra de lo sugerido"}
                >
                  {autoReordering
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />
                  }
                  {ft.activos > 0 ? `Pedir lo que ves (${ft.filtradas.length})` : "Auto-reorden"}
                </button>
              ) : undefined
            }
          >
            {/* Mensaje resultado de auto-reorder */}
            {autoReorderMsg && (
              <div className={cn(
                "flex items-start gap-2 rounded-xl p-3 mb-3 text-sm font-medium",
                autoReorderMsg.startsWith("Error")
                  ? "bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50 text-[var(--data-error-ink)]"
                  : "bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-ink)]",
              )}>
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {autoReorderMsg}
              </div>
            )}

            {state.reorder.length > 0 && (
              /* Tabla responsive — scroll horizontal en mobile */
              <>
              <BarraFiltrosTabla excel="Sugerencias de compra" vistas="reorden" f={ft} />
              <div className="overflow-x-auto -mx-1">
                <DataTable className="w-full min-w-[540px]">
                  <thead>
                    <tr>
                      <ThColumna label="Producto" ids={["producto", "proveedor"]} f={ft} orden={ord} ordenId="producto" />
                      <ThColumna label="Stock actual" ids={["stock"]} f={ft} derecha orden={ord} ordenId="stock" />
                      <ThColumna label="Demanda LT" derecha orden={ord} ordenId="demanda" />
                      <ThColumna label="Pedir" ids={["pedir"]} f={ft} derecha orden={ord} ordenId="pedir" />
                      <ThColumna label="Total est." ids={["total"]} f={ft} derecha orden={ord} ordenId="total" />
                      <ThColumna label="Aviso" ids={["aviso"]} f={ft} derecha orden={ord} ordenId="aviso" />
                    </tr>
                  </thead>
                  <tbody>
                    {filas.length === 0 && <SinCoincidenciasFila colSpan={6} />}
                    {filas.map((item) => {
                      const critico = esCritico(item);
                      return (
                        <tr
                          key={item.productId}
                          className={cn(
                            "",
                            critico
                              ? "bg-[var(--data-error-50)]/60 dark:bg-red-950/20"
                              : "hover:bg-[var(--surface-sunken)]/40",
                          )}
                        >
                          {/* Nombre + proveedor */}
                          <td>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                                {item.productName}
                              </span>
                              <span className="text-xs text-[var(--text-tertiary)]">
                                {item.supplierName} · LT {item.leadTimeDays}d
                              </span>
                            </div>
                          </td>

                          {/* Stock actual */}
                          <td className="text-right">
                            <span className={cn(
                              "font-bold",
                              critico
                                ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                                : "text-[var(--text-primary)]",
                            )}>
                              {item.currentStock} {item.unit}
                            </span>
                          </td>

                          {/* Demanda durante lead time */}
                          <td className="text-right font-medium text-[var(--text-secondary)]">
                            {item.demandDuringLeadTime} {item.unit}
                          </td>

                          {/* Cantidad sugerida */}
                          <td className="text-right">
                            <span className="font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                              {item.suggestedQuantity} {item.unit}
                            </span>
                          </td>

                          {/* Total estimado */}
                          <td className="text-right font-semibold">
                            {formatCurrency(item.estimatedTotal)}
                          </td>

                          {/* Badges */}
                          <td>
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              {critico && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/50 dark:text-[var(--data-error-500)]">
                                  Crítico
                                </span>
                              )}
                              {item.confidence < 0.5 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-amber-950/50 dark:text-[var(--data-warning-500)]">
                                  Baja conf.
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              </div>
              </>
            )}
          </PanelCard>
        </div>
  );
}
