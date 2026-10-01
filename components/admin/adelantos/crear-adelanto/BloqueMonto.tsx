"use client";

/**
 * Bloque 3 del alta: cuánto, cuándo y por dónde pasa la plata.
 *
 * En un adelanto por servicio el monto se arma como se habla en el patio:
 * «3 462 pt a 0,50» — con el precio del trato del cliente si su ficha está
 * vinculada. La caja pregunta «¿de dónde sale?» o «¿a dónde entra?» según el
 * modo, y si la fecha no es hoy arranca en «No mover la caja»: la plata de otro
 * día no salió del cajón de hoy.
 */

import type { RefObject } from "react";
import { Landmark } from "@buleje/design-system/icons";
import { SeccionForm } from "@/components/admin/shared/SeccionForm";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDateNumeric, formatNumber, formatWeekday } from "@/lib/format";
import type { AltaAdelanto } from "../hooks/use-alta-adelanto";
import { cn } from "@/lib/utils";
import { Field, inputCls } from "../shared";
import { FechaAdelanto, HOY, MontoRapido, OrigenCaja } from "./campos-monto";
import { CLASE_BLOQUE } from "./piezas";

/** «domingo 28/09»: el día como lo dice Brandon. */
const diaLegible = (iso: string) =>
  `${formatWeekday(iso, { largo: true, soloFecha: true })} ${formatDateNumeric(iso, { soloFecha: true }).slice(0, 5)}`;

export default function BloqueMonto({ alta, montoRef }: { alta: AltaAdelanto; montoRef: RefObject<HTMLInputElement | null> }) {
  const { def, modo, moneda, persona, servicio } = alta;
  const otroDia = alta.fecha !== HOY();
  return (
    <SeccionForm
      numero={3}
      titulo={def.tituloMonto}
      titular="tarjeta"
      columnas="libre"
      className={CLASE_BLOQUE}
      info={{
        what: `El monto, el día y ${def.caja === "egreso" ? "de dónde sale" : "a dónde entra"} la plata.`,
        affects: "La caja abierta: se anota el movimiento para que el arqueo cuadre. «No mover la caja» no anota nada.",
        example: "Si cargas hoy un adelanto de ayer, la caja arranca en «No mover la caja»: esa plata no salió del cajón de hoy.",
      }}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          {modo === "servicio" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Pies tablares">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={servicio.pt}
                  onChange={(e) => servicio.setPt(e.target.value)}
                  placeholder="3462"
                  className={`${inputCls} tabular-nums`}
                />
              </Field>
              <Field label="S/ por pt">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={servicio.precioPt}
                  onChange={(e) => servicio.setPrecioPt(e.target.value)}
                  placeholder="0.50"
                  className={`${inputCls} tabular-nums`}
                />
              </Field>
              {servicio.tarifa && (
                <p className="col-span-2 text-sm font-medium text-[var(--text-tertiary)]">
                  Su trato: S/ {formatNumber(servicio.tarifa.precioPt, { min: 2, max: 4 })} por pt
                  {servicio.tarifa.desde ? ` desde ${diaLegible(servicio.tarifa.desde)}` : ""}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Field label={modo === "servicio" ? "Monto (pt × precio)" : "Monto"}>
                <div className="relative">
                  {/* El símbolo adentro del campo: sin él, «500» se lee como cantidad de algo. */}
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--text-tertiary)]">
                    {moneda === "USD" ? "$" : "S/"}
                  </span>
                  <input
                    ref={montoRef}
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step="0.01"
                    value={alta.monto}
                    onChange={(e) => alta.setMonto(e.target.value)}
                    placeholder="500.00"
                    className={cn(inputCls, "h-14 pl-12 text-2xl font-extrabold tabular-nums")}
                  />
                </div>
              </Field>
            </div>
            {modo !== "abono" && (
              <div className="w-32 shrink-0">
                <Field label="Moneda">
                  <select value={moneda} onChange={(e) => alta.setMoneda(e.target.value as "PEN" | "USD")} className={cn(inputCls, "h-14")}>
                    <option value="PEN">Soles</option>
                    <option value="USD">Dólares</option>
                  </select>
                </Field>
              </div>
            )}
          </div>
          {modo !== "servicio" && <MontoRapido monto={alta.monto} onCambiar={alta.setMonto} />}
        </div>

        <Field label="Fecha" grupo>
          <FechaAdelanto fecha={alta.fecha} onCambiar={alta.setFecha} />
          <span className="block text-sm font-semibold text-[var(--text-secondary)]">{diaLegible(alta.fecha)}</span>
        </Field>
      </div>

      <div role="group" aria-labelledby="alta-caja-titulo" className="mt-5 space-y-2 border-t border-[var(--rule-soft)] pt-4">
        <div className="flex items-center gap-1.5">
          <span id="alta-caja-titulo" className="text-sm font-semibold text-[var(--text-secondary)]">
            {def.preguntaCaja}
          </span>
          <InfoTip
            title={def.preguntaCaja}
            what={def.caja === "egreso" ? "Se anota el egreso en la caja abierta." : "Se anota el ingreso en la caja abierta."}
            affects="«No mover la caja» no anota nada: úsalo si la plata no pasó por el cajón de hoy."
            example={def.caja === "egreso" ? "Le transfieres desde el banco: elige «Transferencia»." : "WASACO te paga por Yape: elige «Yape»."}
          />
        </div>
        <OrigenCaja metodo={alta.metodoCaja} onCambiar={alta.setMetodoCaja} />
        {otroDia && !alta.metodoCaja && (
          <p className="text-sm font-medium text-[var(--text-tertiary)]">Es de otro día: no toca la caja de hoy.</p>
        )}
        {/* Dónde cobra, cuando se le va a transferir: estaba en su ficha. */}
        {modo === "dar" && alta.metodoCaja === "transferencia" && persona && (
          <div className="flex items-start gap-2 rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm">
            <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            {persona.cuentaBancaria || persona.cci ? (
              <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                {persona.banco && <strong>{persona.banco} </strong>}
                {persona.cuentaBancaria}
                {persona.cci && <span className="block text-[var(--text-secondary)]">CCI {persona.cci}</span>}
              </span>
            ) : (
              <span className="text-[var(--text-tertiary)]">No tiene cuenta cargada. Se agrega en su ficha.</span>
            )}
          </div>
        )}
      </div>
    </SeccionForm>
  );
}
