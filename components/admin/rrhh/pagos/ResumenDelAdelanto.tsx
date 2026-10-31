/**
 * El pie de «Dar adelanto»: cuándo se le descuenta y, si cae en el pago de
 * esta semana, cómo le quedaría el sábado («Ganó S/ 300 esta semana −
 * adelantos S/ 90 = le pagarías S/ 210»). Los números son los del pago del
 * sábado que calculó el servidor; acá sólo se les suma el monto que escribes.
 */

import { CalendarClock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { textoDelDescuento, type DescuentoDelAdelanto, type VistaPreviaDelPago } from "@/lib/rrhh/adelanto-rrhh";
import { formatearPEN } from "../rrhh-ui";

interface Props {
  descuento: DescuentoDelAdelanto | null;
  vista: VistaPreviaDelPago | null;
}

function Cuenta({ vista }: { vista: VistaPreviaDelPago }) {
  if (vista.ganado == null) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Falta definir cuánto gana esta semana: el sábado se le descuentan{" "}
        <strong className="tabular-nums text-[var(--text-primary)]">{formatearPEN(vista.aDescontar)}</strong> en adelantos.
      </p>
    );
  }
  return (
    <p className="text-sm text-[var(--text-secondary)]">
      Ganó <strong className="tabular-nums text-[var(--text-primary)]">{formatearPEN(vista.ganado)}</strong> esta semana − adelantos{" "}
      <strong className="tabular-nums text-[var(--text-primary)]">{formatearPEN(vista.aDescontar)}</strong> = le pagarías{" "}
      <strong className="tabular-nums text-[var(--text-primary)]">{formatearPEN(vista.neto)}</strong>
      {vista.sigueDebiendo > 0 && (
        <span className="text-[var(--data-warning-ink)]"> · sigue debiendo {formatearPEN(vista.sigueDebiendo)}</span>
      )}
    </p>
  );
}

export default function ResumenDelAdelanto({ descuento, vista }: Props) {
  const cuando = descuento ? textoDelDescuento(descuento) : "Se descuenta en su próximo pago del sábado";
  return (
    <div className="space-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3.5 py-2.5 sm:col-span-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <CalendarClock className="h-4 w-4 shrink-0" />
        {cuando}
        {descuento?.semanaPagada && <span className="font-normal text-[var(--text-secondary)]">(esta semana ya se le pagó)</span>}
        <InfoTip
          title="Cuándo se descuenta"
          what="El pago del sábado le resta todos sus adelantos abiertos. Si esa semana ya se le pagó, cae en el sábado siguiente; si cobra por mes, en su pago del mes."
          affects="La fecha queda en el adelanto: la ves en Mi Plata › Adelantos y en el aviso de cobros."
          example="Le das S/ 50 el jueves: el sábado le pagas lo ganado menos S/ 50."
          side="top"
        />
      </p>
      {vista && <Cuenta vista={vista} />}
    </div>
  );
}
