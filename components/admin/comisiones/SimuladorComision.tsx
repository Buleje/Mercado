"use client";

/**
 * «Si vende S/ …» al lado del formulario de reglas (auditoría 15-10, M41):
 * cuánto ganaría hoy y cuánto con la regla que estás escribiendo, antes de
 * guardarla. Vista previa: lo que se paga lo calcula el backend.
 */
import { useState } from "react";
import { REGLA_GENERAL, simularComision, type ReglaComision, type Simulacion } from "@/lib/comisiones/calcular";
import { fmt } from "./formato";

const FUENTE: Record<Simulacion["fuente"], string> = { propia: "su regla", general: "la de todo el equipo", por_defecto: "por defecto" };

const leer = (s: Simulacion) => `${s.tasa} % (${FUENTE[s.fuente]}${s.tramo ? `, ${s.tramo}` : ""}) → ${fmt(s.comision)}`;

type Props = {
  reglas: ReglaComision[];
  /** La regla del formulario; `null` si todavía no es válida. */
  nueva: Omit<ReglaComision, "id" | "label"> | null;
  campo: string;
};

export default function SimuladorComision({ reglas, nueva, campo }: Props) {
  const [monto, setMonto] = useState("5000");
  const vendido = Number(monto.replace(",", "."));
  // «Todo el equipo»: se prueba con alguien sin regla propia.
  const quien = nueva && nueva.cashierId !== REGLA_GENERAL ? nueva.cashierId : "__sin_regla_propia__";
  const s = Number.isFinite(vendido) && vendido >= 0 ? simularComision(quien, vendido, reglas, nueva) : null;
  const cambia = s?.conLaNueva && (s.conLaNueva.tasa !== s.hoy.tasa || s.conLaNueva.fuente !== s.hoy.fuente);

  return (
    <div data-qa="simulador-comision" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm">
      <label className="flex items-center gap-2 font-semibold text-[var(--text-secondary)]">
        Si vende S/
        <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} aria-label="Monto vendido para probar la regla" className={`${campo} w-28 text-right`} />
      </label>
      {s ? (
        <span className="tabular-nums text-[var(--text-primary)]">
          hoy gana <b>{leer(s.hoy)}</b>
          {s.conLaNueva && (cambia
            ? <> · con la regla nueva, <b className="text-[var(--accent-ink)] dark:text-[var(--accent)]">{leer(s.conLaNueva)}</b></>
            : <span className="text-[var(--text-secondary)]"> · la regla nueva no cambia este monto</span>)}
        </span>
      ) : (
        <span className="text-[var(--text-secondary)]">Escribe un monto.</span>
      )}
    </div>
  );
}
