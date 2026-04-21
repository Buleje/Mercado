"use client";
import { useEffect } from "react";
import { m as motion } from "framer-motion";
import type { PreviewData } from "./useCierreDiario";

type Props = {
  preview: PreviewData | null;
  isLoading: boolean;
  efectivoContado: number;
  efectivoEsperado: number;
  diferencia: number;
  skipCaja: boolean;
  fetchPreview: () => void;
  onBack: () => void;
  onNext: () => void;
};

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5 animate-pulse">
      <div className="h-4 w-24 bg-gray-200 dark:bg-surface rounded mb-4" />
      <div className="h-8 w-32 bg-gray-200 dark:bg-surface rounded mb-2" />
      <div className="h-3 w-48 bg-gray-200 dark:bg-surface rounded" />
    </div>
  );
}

export default function CierrePaso2Resumen({
  preview,
  isLoading,
  efectivoContado,
  efectivoEsperado,
  diferencia,
  skipCaja,
  fetchPreview,
  onBack,
  onNext,
}: Props) {
  useEffect(() => {
    if (!preview && !isLoading) {
      fetchPreview();
    }
  }, [preview, isLoading, fetchPreview]);

  if (isLoading || !preview) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-foreground">
          Resumen del d&iacute;a
        </h2>
        <p className="text-sm text-gray-500 dark:text-muted mt-1">
          {preview.fecha}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: VENTAS HOY */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Ventas hoy
          </p>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-foreground">
            S/ {preview.ventas.total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
          </p>
          <div className="space-y-1 text-sm text-gray-600 dark:text-muted">
            <p>{preview.ventas.cantidad} ventas realizadas</p>
            <p>Ticket promedio: S/ {preview.ventas.ticketPromedio.toFixed(2)}</p>
            {preview.ventas.mejorHora && (
              <p>Mejor hora: {preview.ventas.mejorHora}</p>
            )}
            {preview.ventas.productoTop && (
              <p>M&aacute;s vendido: {preview.ventas.productoTop}</p>
            )}
          </div>
        </div>

        {/* Card 2: COBROS Y FIADOS */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Cobros y fiados
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-muted">Fiados cobrados hoy</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                S/ {preview.fiados.cobradosHoy.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-muted">Fiados nuevos hoy</span>
              <span className="text-lg font-bold text-orange-500">
                S/ {preview.fiados.nuevosHoy.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-muted">Fiados vencidos</span>
              <span className={`text-lg font-bold ${preview.fiados.vencidos > 0 ? "text-red-500" : "text-gray-600 dark:text-foreground"}`}>
                {preview.fiados.vencidos}
                {preview.fiados.vencidos > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400">
                    Pendiente
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: CAJA FINAL */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Caja final
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-muted">Efectivo contado</span>
              <span className="text-lg font-bold text-gray-900 dark:text-foreground">
                {skipCaja ? "N/A" : `S/ ${efectivoContado.toFixed(2)}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-muted">Efectivo esperado</span>
              <span className="text-lg font-bold text-gray-900 dark:text-foreground">
                S/ {efectivoEsperado.toFixed(2)}
              </span>
            </div>
            {!skipCaja && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-card-border">
                <span className="text-sm font-semibold text-gray-600 dark:text-muted">Diferencia</span>
                <span className={`text-xl font-extrabold ${
                  diferencia > 0 ? "text-emerald-600" : diferencia < 0 ? "text-red-500" : "text-gray-600 dark:text-foreground"
                }`}>
                  {diferencia >= 0 ? "+" : ""}S/ {diferencia.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card 4: ALERTAS STOCK */}
        {preview.stockAlertas.length > 0 && (
          <div className="bg-white dark:bg-card rounded-2xl border border-red-200 dark:border-red-900/30 p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
              Alertas de stock ({preview.stockAlertas.length})
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {preview.stockAlertas.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-foreground truncate flex-1 mr-2">{p.nombre}</span>
                  <span className="shrink-0 font-bold text-red-500">
                    {p.stock}/{p.stockMin}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent transition-colors"
        >
          &larr; Corregir caja
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm"
        >
          Generar reporte &rarr;
        </button>
      </div>
    </motion.div>
  );
}
