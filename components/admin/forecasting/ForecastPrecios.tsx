"use client";

/**
 * Precios de la Predicción de ventas: sugerencias de ajuste de precio con
 * «Aplicar precio» (PATCH /api/products/:id). Salió de
 * `ForecastingDashboard.tsx` sin cambios.
 *
 * - `ForecastPreciosPanel` dibuja con los datos de quien lo monta.
 * - El default se carga solo y pide únicamente los precios.
 */

import { Tag } from "@buleje/design-system/icons";
import { useForecasting, type Forecasting, type PanelForecast } from "./use-forecasting";
import { PanelCard, PriceCard } from "./ForecastPiezas";

const PANELES: readonly PanelForecast[] = ["prices"];

export default function ForecastPrecios() {
  const f = useForecasting(PANELES);
  return <ForecastPreciosPanel f={f} />;
}

/** El panel C (ocupa las dos columnas de la grilla del tablero). */
export function ForecastPreciosPanel({ f }: { f: Forecasting }) {
  const { state, appliedPrices, applyingPrice, aplicarPrecio } = f;
  return (
        <div className="lg:col-span-2">
          <PanelCard
            icon={<Tag className="w-4 h-4" />}
            title={`Sugerencias de Precios${state.prices.length > 0 ? ` (${state.prices.length})` : ""}`}
            loading={state.loading}
            error={state.errors.prices}
            isEmpty={state.prices.length === 0 && !state.loading && !state.errors.prices}
            emptyMsg="Sin sugerencias de ajuste de precio en este momento"
          >
            {state.prices.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 overflow-x-hidden">
                {state.prices.map((s) => {
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
        </div>
  );
}
