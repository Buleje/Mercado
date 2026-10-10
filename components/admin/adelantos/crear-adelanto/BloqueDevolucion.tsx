"use client";

/**
 * Bloque 4 del alta (dar · servicio · préstamo): cómo se cancela la plata.
 *
 * Dar: la persona te lo devuelve (cuenta corriente, plan o planilla). Recibir:
 * tú se lo devuelves (con el servicio, con plata o madera, o con un plan). El
 * descuento por planilla sólo existe para lo que das: es un adelanto de sueldo.
 */

import { AlertTriangle, CalendarDays, CreditCard, Tag } from "@buleje/design-system/icons";
import { SeccionForm } from "@/components/admin/shared/SeccionForm";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { AdelantoModalidad } from "@/lib/db/adelantos.db";
import type { AltaAdelanto } from "../hooks/use-alta-adelanto";
import { Field } from "../shared";
import PlanDeEntregas from "./PlanDeEntregas";
import Vencimiento from "./Vencimiento";
import { CLASE_BLOQUE, MarcaSeleccion, claseOpcion } from "./piezas";

const ICONO: Record<AdelantoModalidad, typeof CreditCard> = {
  CUENTA_CORRIENTE: CreditCard,
  ENTREGAS_PACTADAS: CalendarDays,
  DESCUENTO_PLANILLA: Tag,
};

export default function BloqueDevolucion({ alta }: { alta: AltaAdelanto }) {
  const { def, modo, modalidad, persona } = alta;
  const recibido = def.direccion === "RECIBIDO";
  const tres = def.modalidades.length === 3;
  return (
    <SeccionForm
      numero={4}
      titulo={def.tituloDevolucion}
      titular="tarjeta"
      columnas="libre"
      className={CLASE_BLOQUE}
      info={
        recibido
          ? {
              what: "Cómo le vas a devolver lo que te dio: con el trabajo que le hagas, con plata o madera, o con un plan de fechas.",
              affects: "Lo que le debes baja con cada entrega que le registres en la ficha del adelanto.",
              example: "Te adelantó S/ 1 731 por 3 462 pt de aserrío: cada corrida que le hagas descuenta.",
            }
          : {
              what: "Cómo te va a devolver la plata: con lo que vaya entregando, con un plan de fechas o descontado de su sueldo.",
              affects: "La cobranza mide el atraso contra el plan o la fecha acordada.",
              example: "Adelanto de sueldo de S/ 300: «Descuento por planilla» y sale del pago del mes.",
            }
      }
    >
      <div className="space-y-4">
        <div role="group" aria-label={def.tituloDevolucion} className={`grid gap-2.5 ${tres ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {def.modalidades.map((m) => {
            const activa = modalidad === m.id;
            const Icono = ICONO[m.id];
            return (
              <button key={m.id} type="button" aria-pressed={activa} onClick={() => alta.setModalidad(m.id)} className={claseOpcion(activa)}>
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    activa ? "bg-primary/15 text-[var(--accent-ink)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                  }`}
                >
                  <Icono className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-[var(--text-primary)]">{m.label}</span>
                  <span className="block text-sm font-medium text-[var(--text-secondary)]">{m.pista}</span>
                </span>
                <MarcaSeleccion activa={activa} />
              </button>
            );
          })}
        </div>

        {/* WASACO: su aserrío ya se cobra solo en cada corrida. Si además se
            anotaran entregas acá, se cobraría dos veces (ADR-448 §2.7). */}
        {modo === "servicio" && persona?.forestPartyId && (
          <p className="flex items-center gap-2 rounded-xl bg-[var(--data-info-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-info-ink)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">Su aserrío ya se cobra en cada corrida: no le anotes entregas a mano.</span>
            <InfoTip
              title="Su cuenta de aserríos"
              what="Cada corrida que le haces carga el aserrío en su cuenta forestal, sola."
              affects="Esta plata queda como lo que le debes. Se descuenta cruzándola con esos cargos, no con entregas a mano: si no, el aserrío se cobra dos veces."
              example="Te adelantó S/ 1 731 por aserrío: cada corrida que le haces ya carga su cobro en la cuenta."
            />
          </p>
        )}

        <Field
          grupo
          label={recibido ? "¿Para cuándo lo devuelves? (opcional)" : "¿Para cuándo lo devuelve? (opcional)"}
          info={{
            what: "La fecha acordada para cancelar.",
            affects: alta.vencimiento ? "La cobranza medirá el atraso contra esta fecha." : "Sin fecha, la cobranza sólo puede mirar la antigüedad.",
          }}
        >
          <Vencimiento fechaAdelanto={alta.fecha} vencimiento={alta.vencimiento} onCambiar={alta.setVencimiento} plazoHabitual={alta.plazoHabitual} />
        </Field>

        {modalidad === "ENTREGAS_PACTADAS" && (
          <PlanDeEntregas cuotas={alta.cuotas} onCambiar={alta.setCuotas} montoAdelantado={alta.montoNum} moneda={alta.moneda} />
        )}
      </div>
    </SeccionForm>
  );
}
