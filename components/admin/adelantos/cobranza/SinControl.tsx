"use client";

/**
 * Los adelantos que diste y quedaron sueltos: quietos hace un mes, sin fecha
 * para devolverlos o vencidos. La regla vive en `lib/adelantos/sin-control.ts`
 * y la cuenta la hace el servidor (`/api/adelantos/resumen` → `sinControl`),
 * sin el tope de 500 filas de la lista.
 *
 * Cada fila abre su ficha y, debajo, ofrece «Poner vencimiento» y «Atar a
 * contrato» ahí mismo (`ControlarAdelanto`, el mismo de la ficha). Al guardar
 * se recarga el resumen: si ya no aplica ningún motivo, la fila sale.
 */

import { useState } from "react";
import ControlarAdelanto from "../detalle/ControlarAdelanto";
import { AlertTriangle, ChevronRight } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DIAS_SIN_ENTREGA, type ResumenSinControl } from "@/lib/adelantos/sin-control";
import DetalleAdelantoModal from "../detalle/DetalleAdelantoModal";
import { fmtMon, fmtMonedas } from "../shared";

/** Filas a la vista: más que esto ya no es un aviso, es otra lista. */
const A_LA_VISTA = 8;

export default function SinControl({
  datos,
  onChange,
}: {
  /** `null`/ausente = el servidor no lo pudo calcular: no se afirma nada. */
  datos: ResumenSinControl | null | undefined;
  /** Recargar el módulo después de tocar algo en la ficha o en la fila. */
  onChange: () => void;
}) {
  const [fichaId, setFichaId] = useState<string | null>(null);
  if (!datos || datos.cantidad === 0) return null;

  const n = datos.cantidad;

  return (
    <div className="rounded-xl bg-[var(--data-warning)]/8 p-5 ring-1 ring-[var(--data-warning)]/25">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base font-extrabold text-[var(--text-primary)]">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--data-warning)]" aria-hidden />
          {n} adelanto{n === 1 ? "" : "s"} sin control · {fmtMonedas(datos.porMoneda)}
          <InfoTip
            title="Adelantos sin control"
            what={
              <span>
                Plata que diste y sigue abierta con al menos una de estas: {DIAS_SIN_ENTREGA} días o más sin ninguna
                entrega, sin fecha para devolverla, o con la fecha ya pasada.
              </span>
            }
            affects={<span>La cifra es el saldo que todavía te deben de esos adelantos. Lo que recibiste no entra.</span>}
            example={<span>Diste S/ 17 000 el 03/08, sin fecha y sin entregas: sale acá hasta que entregue algo.</span>}
          />
        </CardTitle>
      </div>

      <ul className="divide-y divide-[var(--rule-soft)]">
        {datos.adelantos.slice(0, A_LA_VISTA).map((a) => (
          <li key={a.id} className="py-1">
            <button
              type="button"
              onClick={() => setFichaId(a.id)}
              className="-mx-1 flex w-full flex-wrap items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-[var(--surface-raised)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-[var(--text-primary)]">
                  {a.nombre}
                  <span className="font-semibold text-[var(--text-tertiary)]"> · {a.codigoOperacion ?? "sin código"}</span>
                </span>
                <span className="block text-sm text-[var(--data-warning-ink)]">
                  {a.motivos.map((m) => m.texto).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                {fmtMon(a.saldoPendiente, a.moneda)}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                Ver ficha <ChevronRight className="h-4 w-4" aria-hidden />
              </span>
            </button>
            {/* Fuera del botón de la fila: un botón no va dentro de otro. Al
                guardar se recarga el aviso y la fila sale si ya no aplica. */}
            <ControlarAdelanto
              adelantoId={a.id}
              fechaVencimiento={a.fechaVencimiento}
              contratoId={a.contratoId}
              onGuardado={onChange}
            />
          </li>
        ))}
      </ul>
      {n > A_LA_VISTA && (
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">y {n - A_LA_VISTA} más…</p>
      )}

      {fichaId && (
        <DetalleAdelantoModal
          adelantoId={fichaId}
          onClose={() => setFichaId(null)}
          onChange={onChange}
        />
      )}
    </div>
  );
}
