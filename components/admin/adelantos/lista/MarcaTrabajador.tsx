/**
 * «Trabajador · se descuenta el sábado 31/10 · Ver en Equipo» — la marca de un
 * adelanto por planilla cuya cuenta es de alguien del equipo (25-10, el que se
 * da desde la asistencia). El dato llega resuelto con la lista (`trabajador`):
 * ni un pedido por fila. El enlace lleva a la asistencia, donde se le paga.
 */

import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { HREF_EQUIPO_ASISTENCIA, cuandoSeDescuenta } from "@/lib/adelantos/trabajador-del-adelanto";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { cn } from "@/lib/utils";

interface Props {
  adelanto: Pick<DbAdelanto, "fechaVencimiento" | "status">;
  /** Lo que va antes del «·» (en la lista, «Trabajador»; en la ficha, su nombre). */
  rotulo: string;
  className?: string;
}

function cuando(a: Props["adelanto"]): string | null {
  if (a.status === "ABIERTO") return cuandoSeDescuenta(a.fechaVencimiento);
  if (a.status === "LIQUIDADO") return "ya se le descontó";
  return null;
}

export default function MarcaTrabajador({ adelanto, rotulo, className }: Props) {
  const texto = cuando(adelanto);
  return (
    <span data-qa="adelanto-marca-trabajador" className={cn("block text-sm text-[var(--text-secondary)]", className)}>
      <span className="font-semibold text-[var(--text-primary)]">{rotulo}</span>
      {texto && ` · ${texto}`}
      {" · "}
      <EnlacePanel href={HREF_EQUIPO_ASISTENCIA} title="Abre la asistencia de tu equipo, donde se le paga el sábado">
        Ver en Equipo
      </EnlacePanel>
    </span>
  );
}
