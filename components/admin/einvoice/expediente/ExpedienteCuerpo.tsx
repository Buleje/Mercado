"use client";

/**
 * El cuerpo del expediente (N03): arriba la pregunta que importa («¿qué falta
 * para cerrar?»), después los papeles y los importes, y al final el cobro, los
 * productos y la línea de tiempo. Los botones sólo NAVEGAN a la pantalla que
 * resuelve cada faltante: el expediente no emite ni guarda nada.
 */
import { CardTitle } from "@buleje/design-system";
import { ArrowRight, CheckCircle2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { textoFecha } from "@/lib/comprobantes/periodo";
import type { AccionFaltante, Expediente } from "@/lib/comprobantes/expediente";
import { fmt } from "../tipos";
import { CHIP, CHIP_TONO, PUNTO_TONO, ROTULO_GRAVEDAD, TONO_GRAVEDAD } from "../tonos";
import { Cobro, Importes, LineaDeTiempo, Papeles, Productos } from "./ExpedientePartes";

const ROTULO_ACCION: Record<NonNullable<AccionFaltante>, string> = {
  emitir: "Emitir comprobante",
  guia: "Ir a Guías",
  notas: "Ir a Notas de crédito",
  facturas: "Ver en Facturas y boletas",
};

export function ExpedienteCuerpo({ expediente, onIr }: { expediente: Expediente; onIr: (accion: NonNullable<AccionFaltante>) => void }) {
  const { operacion, documentos, faltantes, importes, eventos } = expediente;
  return (
    <div className="grid gap-4">
      {operacion ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold text-[var(--text-primary)]">{operacion.cliente || "Sin nombre"}</span>
          {operacion.telefono && <span className="tabular-nums text-[var(--text-secondary)]">{operacion.telefono}</span>}
          <span className="text-[var(--text-secondary)]">{textoFecha(operacion.fecha)}</span>
          {operacion.estadoRotulo && <span className={cn(CHIP, CHIP_TONO.neutro)}>{operacion.estadoRotulo}</span>}
          <span className="ml-auto text-base font-extrabold tabular-nums text-[var(--text-primary)]">{fmt(operacion.total)}</span>
          {operacion.cancelacion && (
            <p className={cn("basis-full", "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]")}>
              Cancelado{operacion.cancelacion.fecha ? ` el ${textoFecha(operacion.cancelacion.fecha)}` : ""}
              {operacion.cancelacion.motivo ? `: ${operacion.cancelacion.motivo}` : ""}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">Este documento no está unido a ningún pedido ni venta de tu negocio.</p>
      )}

      <section aria-labelledby="exp-falta" className="rounded-xl border border-[var(--rule-base)] p-4">
        <CardTitle id="exp-falta" className={faltantes.length === 0 ? "sr-only" : "mb-2"}>
          Qué falta para cerrar
        </CardTitle>
        {faltantes.length === 0 ? (
          <p className="flex items-center gap-2 font-semibold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]">
            <CheckCircle2 className="h-5 w-5" aria-hidden /> Nada pendiente: la operación tiene sus papeles en orden.
          </p>
        ) : (
          <>
            <ul className="grid gap-2">
              {faltantes.map((f) => (
                <li key={f.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PUNTO_TONO[TONO_GRAVEDAD[f.gravedad]])} aria-hidden />
                  <span className={cn(CHIP, CHIP_TONO[TONO_GRAVEDAD[f.gravedad]])}>{ROTULO_GRAVEDAD[f.gravedad]}</span>
                  <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">{f.texto}</span>
                  {f.accion && (
                    <button
                      type="button"
                      data-qa={`expediente-accion-${f.accion}`}
                      onClick={() => f.accion && onIr(f.accion)}
                      className={button({ variant: "secondary", className: "rounded-xl" })}
                    >
                      {ROTULO_ACCION[f.accion]} <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Papeles documentos={documentos} interno={operacion?.documentoInterno ?? null} />

      <div className="grid gap-4 md:grid-cols-2">
        <Importes importes={importes} />
        {operacion && <Cobro cobro={operacion.cobro} />}
      </div>

      {operacion && <Productos lineas={operacion.lineas} />}
      <LineaDeTiempo eventos={eventos} />
    </div>
  );
}
