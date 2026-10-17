"use client";

/**
 * Caja › Hoy › «Para revisar del turno» (auditoría 15-10, M22): lo raro del
 * turno en una lista, cada cosa con un «Ver» que lleva a donde se mira. Sólo
 * lista; no corrige nada. Sin rarezas no se dibuja.
 */
import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import { useCierreACiegas } from "@/components/admin/turnos/cierre-a-ciegas";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { excepcionesDelTurno, type DestinoExcepcion } from "@/lib/caja/excepciones-del-turno";
import { cn } from "@/lib/utils";
import { fmt, type CashMovement, type CashRegister } from "./tipos";

interface Props {
  movimientos: readonly CashMovement[];
  cerradas: readonly CashRegister[];
  tolerancia: number;
  onIr: (destino: Exclude<DestinoExcepcion, "caja">) => void;
  onVerCaja: (caja: CashRegister) => void;
}

export function ExcepcionesDelTurno({ movimientos, cerradas, tolerancia, onIr, onVerCaja }: Props) {
  /* Mientras no se sabe si es a ciegas, sin montos de diferencia (delatan el esperado). */
  const { ciego } = useCierreACiegas();
  const lista = useMemo(
    () => excepcionesDelTurno({ ahora: new Date(), movimientos, cerradas, tolerancia, aCiegas: ciego !== false }, fmt),
    [movimientos, cerradas, tolerancia, ciego],
  );
  if (lista.length === 0) return null;

  const ver = (ir: DestinoExcepcion, cajaId?: string) => {
    if (ir !== "caja") return onIr(ir);
    const caja = cerradas.find((c) => c.id === cajaId);
    if (caja) onVerCaja(caja);
  };

  return (
    <section data-qa="caja-excepciones" className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-1.5">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Para revisar del turno ({lista.length})</CardTitle>
        <InfoTip
          what="Lo raro del turno junto: arqueos fuera de la tolerancia, cobros que parecen repetidos, retiros sin detalle y cajas de la última semana cerradas sin contar o con diferencia sin explicar."
          affects="Revisarlo antes de cerrar evita que la diferencia llegue al cierre sin explicación."
          example="«2 retiros sin detalle (S/ 45.00)» → Ver te lleva a Movimientos."
        />
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {lista.map((x) => (
          <li key={x.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <span
              aria-hidden
              className={cn("h-2 w-2 shrink-0 rounded-full", x.grave ? "bg-[var(--data-error-500)]" : "bg-[var(--data-warning-500)]")}
            />
            <span className={cn("min-w-0 flex-1 text-sm", x.grave ? "font-semibold text-[var(--data-error-ink)]" : "text-[var(--text-primary)]")}>
              {x.texto}
            </span>
            <InfoTip what={x.detalle} />
            <button type="button" onClick={() => ver(x.ir, x.cajaId)} className={button({ variant: "ghost", className: "gap-1.5 rounded-xl" })}>
              Ver <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
