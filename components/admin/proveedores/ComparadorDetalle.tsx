"use client";

import { AlertTriangle, Clock, CreditCard, DollarSign, Package, ShoppingCart, Star } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { SupplierWithScore } from "./comparador-datos";
import { ScoreBadge, ScoreBar, SupplierRadar } from "./ComparadorPiezas";

/** El proveedor elegido: radar, las cinco notas y «Crear orden de compra». */
export default function ComparadorDetalle({ proveedor, onCrearOC }: { proveedor: SupplierWithScore; onCrearOC: (s: SupplierWithScore) => void }) {
  const notas = [
    { label: "Calidad", value: proveedor.scoreCalidad, icon: Star, color: "bg-primary/10" },
    { label: "Precio", value: proveedor.scorePrecio, icon: DollarSign, color: "bg-primary" },
    { label: "Tiempo", value: proveedor.scoreTiempo, icon: Clock, color: "bg-primary/10" },
    { label: "Variedad", value: proveedor.scoreVariedad, icon: Package, color: "bg-[var(--text-primary)]" },
    { label: "Cond. pago", value: proveedor.scoreCondicion, icon: CreditCard, color: "bg-[var(--data-warning-500)]" },
  ];
  return (
    <div className="w-full shrink-0 overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] lg:w-72">
      <div className="border-b border-[var(--rule-soft)] px-4 py-3">
        <p className="truncate text-base font-bold text-[var(--text-primary)]">{proveedor.name}</p>
        <div className="mt-1 flex items-center gap-2">
          <ScoreBadge score={proveedor.score} hasData={proveedor.hasData} />
          <span className="text-sm text-[var(--text-secondary)]">{proveedor.hasData ? `${Number(proveedor.score).toFixed(1)} puntos` : "Sin historial suficiente para evaluar"}</span>
        </div>
      </div>

      {/* Sin datos reales no se dibuja el radar con porcentajes fabricados (reporte QA 07-08). */}
      <div className="px-3 pt-3">
        {proveedor.hasData ? (
          <SupplierRadar supplier={proveedor} />
        ) : (
          <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--rule-base)] text-center">
            <AlertTriangle className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
            <p className="text-sm font-semibold text-[var(--text-secondary)]">Sin datos para el radar</p>
            <p className="px-3 text-sm text-[var(--text-secondary)]">Se necesita historial de evaluaciones para graficar el desempeño.</p>
          </div>
        )}
      </div>

      {proveedor.hasData && (
        <div className="mt-1 space-y-2.5 px-4 pb-4">
          {notas.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 font-medium text-[var(--text-secondary)]"><Icon className="h-3.5 w-3.5" aria-hidden /> {label}</span>
                <span className="font-bold tabular-nums text-[var(--text-secondary)]">{value.toFixed(0)}%</span>
              </div>
              <ScoreBar value={value} color={color} />
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pb-4">
        <button type="button" onClick={() => onCrearOC(proveedor)} className={button({ variant: "primary", className: "w-full gap-2 rounded-xl" })}>
          <ShoppingCart className="h-4 w-4" aria-hidden /> Crear orden de compra
        </button>
      </div>
    </div>
  );
}
