"use client";

/**
 * «Poner vencimiento» y «Atar a contrato» para un adelanto YA DADO.
 *
 * Hasta el 30-09 las dos cosas sólo se cargaban al darlo: el aviso «sin
 * control» decía que S/ 17 000 no tenían fecha y no había dónde ponérsela. Va
 * en la ficha y en cada fila del aviso, con las MISMAS piezas del alta
 * (`Vencimiento`, `SelectorContrato`): los plazos en botones y el mismo
 * desplegable de permisos.
 *
 * Los plazos cuentan desde HOY, no desde que se dio: a un adelanto de hace dos
 * meses, «1 semana» desde el día del adelanto ya estaría vencido.
 */

import { useState } from "react";
import { CalendarClock, FileText } from "@buleje/design-system/icons";
import SelectorContrato from "@/components/admin/forestal/SelectorContrato";
import { diaCorto } from "@/lib/adelantos/control-edicion";
import { limaDateKey } from "@/lib/utils";
import Vencimiento from "../crear-adelanto/Vencimiento";
import { useControlarAdelanto } from "./use-controlar-adelanto";

type Panel = "vencimiento" | "contrato" | null;

const claseAccion =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]";

export default function ControlarAdelanto({
  adelantoId,
  fechaVencimiento,
  contratoId,
  onGuardado,
}: {
  adelantoId: string;
  /** ISO guardado, o `null` sin fecha. */
  fechaVencimiento: string | null | undefined;
  contratoId: string | null | undefined;
  /** Recargar quien lo muestra: la ficha y el aviso. */
  onGuardado: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const diaActual = fechaVencimiento ? limaDateKey(fechaVencimiento) : "";
  const [dia, setDia] = useState(diaActual);
  const [contrato, setContrato] = useState<string | null>(contratoId ?? null);
  const { guardar, guardando, error, limpiarError } = useControlarAdelanto(adelantoId);

  const abrir = (p: Panel) => {
    limpiarError();
    setDia(diaActual);
    setContrato(contratoId ?? null);
    setPanel(p);
  };

  const confirmar = async () => {
    const ok = await guardar(panel === "vencimiento" ? { fechaVencimiento: dia || null } : { contratoId: contrato });
    if (ok) {
      setPanel(null);
      onGuardado();
    }
  };

  const sinCambio = panel === "vencimiento" ? dia === diaActual : contrato === (contratoId ?? null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => abrir(panel === "vencimiento" ? null : "vencimiento")} aria-expanded={panel === "vencimiento"} className={claseAccion}>
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
          {diaActual ? `Vence el ${diaCorto(diaActual)} · Cambiar` : "Poner vencimiento"}
        </button>
        <button type="button" onClick={() => abrir(panel === "contrato" ? null : "contrato")} aria-expanded={panel === "contrato"} className={claseAccion}>
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          {contratoId ? "Cambiar contrato" : "Atar a contrato"}
        </button>
      </div>

      {panel && (
        <div className="space-y-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
          {panel === "vencimiento" ? (
            <>
              <p className="text-base font-bold text-[var(--text-primary)]">¿Para cuándo quedó en devolverlo?</p>
              <Vencimiento fechaAdelanto={limaDateKey()} vencimiento={dia} onCambiar={setDia} />
            </>
          ) : (
            <SelectorContrato
              id={`controlar-contrato-${adelantoId}`}
              value={contrato}
              onChange={setContrato}
              sugerirActivo={false}
              hint="El adelanto pasa a contar en el balance de ese permiso."
            />
          )}
          {error && (
            <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setPanel(null)} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={guardando || sinCambio}
              className="h-11 rounded-xl bg-[var(--accent-dark)] px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
            >
              {guardando ? "Guardando…" : panel === "vencimiento" && !dia ? "Quitar la fecha" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
