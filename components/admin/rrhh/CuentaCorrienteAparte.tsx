"use client";

/**
 * CuentaCorrienteAparte — «Cuenta corriente: debe S/ 573» al lado de lo que
 * queda por pagar (decisión 7 de `lib/rrhh/ganado.ts`). Lo que debe en cuenta
 * corriente NO sale del sueldo: no se resta, pero se ve en la misma fila para
 * que no se olvide, con el enlace a su cuenta en Mi Plata.
 *
 * Lo usan Lo ganado, el pago del sábado y la ficha: el mismo texto en las tres.
 * El clic y el Enter no suben a la fila (la de Lo ganado abre «Cómo sale»).
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { cn } from "@/lib/utils";
import { formatearPEN } from "./rrhh-ui";

export default function CuentaCorrienteAparte({
  monto,
  beneficiarioId,
  className,
}: {
  /** Lo abierto que no es de planilla, en soles (`cuentaCorrientePen`). */
  monto: number;
  /** Su cuenta en Adelantos; sin ella no hay enlace. */
  beneficiarioId: string | null;
  className?: string;
}) {
  if (!(monto > 0)) return null;
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-[var(--text-secondary)]", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span>
        Cuenta corriente: debe <span className="font-semibold tabular-nums text-[var(--text-primary)]">{formatearPEN(monto)}</span>
      </span>
      <InfoTip
        title="Cuenta corriente"
        what="Lo que te debe en cuenta corriente (o en entregas pactadas). No se descuenta del sueldo: se cobra por su lado."
        affects="No entra en «Queda por pagar» ni en el pago del sábado: ahí sólo se descuentan los adelantos por planilla."
        example="Ganó S/ 120 y debe S/ 573 de cuenta corriente: el sábado se le pagan S/ 120 y la cuenta corriente sigue en S/ 573."
        ariaLabel="Qué es la cuenta corriente"
      />
      {beneficiarioId && (
        <EnlacePanel cosa="cuenta-adelantos" id={`benef:${beneficiarioId}`}>
          Ver su cuenta
        </EnlacePanel>
      )}
    </span>
  );
}
