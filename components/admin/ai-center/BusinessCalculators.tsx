"use client";

import React from "react";

const inputCls =
  "w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary/30";

export default function BusinessCalculators() {
  const [margenCosto, setMargenCosto] = React.useState("");
  const [margenPct, setMargenPct] = React.useState("");
  const [eqGastos, setEqGastos] = React.useState("");
  const [eqMargen, setEqMargen] = React.useState("");
  const [roiInversion, setRoiInversion] = React.useState("");
  const [roiGanancia, setRoiGanancia] = React.useState("");

  const precioSugerido =
    margenCosto && margenPct && parseFloat(margenPct) < 100 && parseFloat(margenPct) > 0
      ? (parseFloat(margenCosto) / (1 - parseFloat(margenPct) / 100)).toFixed(2)
      : null;
  const gananciaMargen =
    precioSugerido && margenCosto
      ? (parseFloat(precioSugerido) - parseFloat(margenCosto)).toFixed(2)
      : null;

  const ventasNecesarias =
    eqGastos && eqMargen && parseFloat(eqMargen) > 0
      ? (parseFloat(eqGastos) / (parseFloat(eqMargen) / 100)).toFixed(2)
      : null;

  const roiPct =
    roiInversion && roiGanancia && parseFloat(roiInversion) > 0
      ? ((parseFloat(roiGanancia) / parseFloat(roiInversion)) * 100).toFixed(1)
      : null;
  const mesesRecuperar =
    roiInversion && roiGanancia && parseFloat(roiGanancia) > 0
      ? Math.ceil(parseFloat(roiInversion) / parseFloat(roiGanancia))
      : null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">
        Calculadoras de negocio
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Margen */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-400">
            Calculadora de Margen
          </p>
          <div>
            <label className="text-[10px] text-gray-400">Costo (S/)</label>
            <input
              type="number"
              value={margenCosto}
              onChange={(e) => setMargenCosto(e.target.value)}
              placeholder="Ej: 10"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400">Margen deseado (%)</label>
            <input
              type="number"
              value={margenPct}
              onChange={(e) => setMargenPct(e.target.value)}
              placeholder="Ej: 30"
              className={inputCls}
            />
          </div>
          {precioSugerido && (
            <div className="bg-primary/10 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500">Precio sugerido</p>
              <p className="text-lg font-bold text-primary">S/{precioSugerido}</p>
              <p className="text-[10px] text-gray-400">Ganancia: S/{gananciaMargen}</p>
            </div>
          )}
        </div>

        {/* Punto de equilibrio */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-400">
            Punto de Equilibrio
          </p>
          <div>
            <label className="text-[10px] text-gray-400">Gastos fijos mensuales (S/)</label>
            <input
              type="number"
              value={eqGastos}
              onChange={(e) => setEqGastos(e.target.value)}
              placeholder="Ej: 3000"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400">Margen promedio (%)</label>
            <input
              type="number"
              value={eqMargen}
              onChange={(e) => setEqMargen(e.target.value)}
              placeholder="Ej: 25"
              className={inputCls}
            />
          </div>
          {ventasNecesarias && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500">Ventas necesarias/mes</p>
              <p className="text-lg font-bold text-amber-600">S/{ventasNecesarias}</p>
              <p className="text-[10px] text-gray-400">Para cubrir tus gastos fijos</p>
            </div>
          )}
        </div>

        {/* ROI */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-400">Calculadora ROI</p>
          <div>
            <label className="text-[10px] text-gray-400">Inversion total (S/)</label>
            <input
              type="number"
              value={roiInversion}
              onChange={(e) => setRoiInversion(e.target.value)}
              placeholder="Ej: 5000"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400">Ganancia mensual (S/)</label>
            <input
              type="number"
              value={roiGanancia}
              onChange={(e) => setRoiGanancia(e.target.value)}
              placeholder="Ej: 800"
              className={inputCls}
            />
          </div>
          {roiPct && mesesRecuperar && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500">ROI mensual</p>
              <p className="text-lg font-bold text-emerald-600">{roiPct}%</p>
              <p className="text-[10px] text-gray-400">
                Recuperas en {mesesRecuperar} mes{mesesRecuperar !== 1 ? "es" : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
