"use client";

import { X, Loader2, Check, FileText, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Devolucion } from "@/components/admin/pos/devolucion/use-devolucion";

/** Paso 3: resultado de la devolución y, si salió bien, la Nota de Crédito. */
export default function DevolucionResultado({
  dev,
  result,
}: {
  dev: Devolucion;
  result: NonNullable<Devolucion["result"]>;
}) {
  const { selectedSale, ncResult, creatingNC, resetAndClose, crearNotaCredito, volverAlPaso2 } = dev;
  // Sin respuesta (o 5xx) no se sabe si quedó: ámbar de «revisa», no rojo de «falló».
  const incierta = !result.success && !result.puedeCorregir;
  return (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center gap-3">
              <div className={cn(
                "h-14 w-14 rounded-full flex items-center justify-center",
                result.success ? "bg-primary/10" : incierta ? "bg-[var(--data-warning-50)]" : "bg-[var(--data-error-50)]"
              )}>
                {result.success ? (
                  <Check className="h-7 w-7 text-[var(--data-success-500)]" />
                ) : incierta ? (
                  <AlertTriangle className="h-7 w-7 text-[var(--data-warning-500)]" aria-hidden />
                ) : (
                  <X className="h-7 w-7 text-[var(--data-error-500)]" />
                )}
              </div>
              <p className={cn(
                "text-sm font-bold",
                result.success ? "text-[var(--data-success-500)]" : incierta ? "text-[var(--data-warning-ink)]" : "text-[var(--data-error-500)]"
              )} role={result.success ? "status" : "alert"}>
                {result.message}
              </p>

              {/* Mejora 9: Crear Nota de Crédito desde devolución */}
              {result.success && selectedSale && !ncResult && (
                <button
                  onClick={crearNotaCredito}
                  disabled={creatingNC}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 hover:bg-primary/20 disabled:opacity-50 transition-colors"
                >
                  {creatingNC ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  Crear Nota de Crédito
                </button>
              )}
              {ncResult && (
                <p role="status" className={cn("text-xs font-bold", ncResult.ok ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                  {ncResult.texto}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2">
                {result.puedeCorregir && (
                  <button
                    type="button"
                    onClick={volverAlPaso2}
                    className="px-6 min-h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
                  >
                    Volver y corregir
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetAndClose}
                  className={cn(
                    "px-6 min-h-11 rounded-xl text-sm font-semibold transition-colors",
                    result.success
                      ? "bg-primary text-white hover:bg-primary-dark"
                      : "bg-[var(--rule-soft)] text-[var(--text-secondary)] hover:bg-[var(--rule-base)]",
                  )}
                >
                  Cerrar
                </button>
              </div>
            </div>
  );
}
