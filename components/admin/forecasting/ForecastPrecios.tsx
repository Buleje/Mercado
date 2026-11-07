"use client";

/**
 * Precios de la Predicción de ventas:
 *  · «Rebajar lo que no se vende» = la lista única de rebajas (`RebajasLista`),
 *    la misma que aplica la IA en Precios en bloque, con su recibo y deshacer;
 *  · «Subir precio» = lo que se vende más rápido de lo que hay (tarjetas con
 *    «Aplicar precio», PATCH /api/products/:id, como antes).
 * Sin la lista (servidor viejo o aún cargando) se ven todas las tarjetas.
 *
 * - `ForecastPreciosPanel` dibuja con los datos de quien lo monta.
 * - El default se carga solo y pide únicamente los precios.
 */

import { Tag } from "@buleje/design-system/icons";
import { useForecasting, type Forecasting, type PanelForecast } from "./use-forecasting";
import { PanelCard, PriceCard } from "./ForecastPiezas";
import RebajasLista from "./RebajasLista";

const PANELES: readonly PanelForecast[] = ["prices"];

export default function ForecastPrecios() {
  const f = useForecasting(PANELES);
  return <ForecastPreciosPanel f={f} />;
}

/** El panel C (ocupa las dos columnas de la grilla del tablero). */
export function ForecastPreciosPanel({ f }: { f: Forecasting }) {
  const { state, appliedPrices, applyingPrice, aplicarPrecio } = f;
  const conLista = state.rebajas != null && !state.loading;
  // Con la lista, las rebajas viven en ella: las tarjetas quedan para subir precio.
  const tarjetas = conLista ? state.prices.filter((s) => s.reason === "hot_item") : state.prices;
  return (
        <div className="lg:col-span-2 space-y-4">
          {conLista && state.rebajas && <RebajasLista rebajas={state.rebajas} />}
          {(!conLista || tarjetas.length > 0) && (
          <PanelCard
            icon={<Tag className="w-4 h-4" />}
            title={conLista ? `Subir precio (${tarjetas.length})` : `Sugerencias de Precios${tarjetas.length > 0 ? ` (${tarjetas.length})` : ""}`}
            loading={state.loading}
            error={state.errors.prices}
            isEmpty={tarjetas.length === 0 && !state.loading && !state.errors.prices}
            emptyMsg="Sin sugerencias de ajuste de precio en este momento"
          >
            {tarjetas.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 overflow-x-hidden">
                {tarjetas.map((s) => {
                  const isApplied = appliedPrices.has(s.productId);
                  const isApplying = applyingPrice === s.productId;
                  const esBaja = s.adjustmentPercent < 0;

                  return (
                    <PriceCard
                      key={s.productId}
                      suggestion={s}
                      isApplied={isApplied}
                      isApplying={isApplying}
                      onAplicar={() => aplicarPrecio(s)}
                      esBaja={esBaja}
                    />
                  );
                })}
              </div>
            )}
          </PanelCard>
          )}
        </div>
  );
}
