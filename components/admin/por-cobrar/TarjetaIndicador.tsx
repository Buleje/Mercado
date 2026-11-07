/**
 * Una tarjeta de los Indicadores plegables de «Por cobrar y pagar» (las cuatro
 * vistas: lo que te deben, lo que debes, a quién fiarle y préstamos): rótulo,
 * cifra y una línea de detalle. La misma forma que `use-indicadores-caja`.
 */

import type { ReactNode } from "react";
import { StatCard } from "@buleje/design-system";
import type { LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export default function TarjetaIndicador({
  rotulo,
  valor,
  detalle,
  icono,
  tono = "normal",
  ayuda,
  accion,
}: {
  rotulo: string;
  valor: string;
  detalle?: string;
  icono: LucideIcon;
  /** `alerta` = vencido o bloqueado (rojo); `destacado` = la cifra que se mira primero. */
  tono?: "normal" | "destacado" | "alerta";
  ayuda?: ReactNode;
  /** Un botón que lleva a donde se resuelve esa cifra (el «Cobrar» de los fiados). */
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <StatCard
        density="compact"
        label={rotulo}
        value={valor}
        subValue={detalle}
        icon={icono}
        emphasis={tono === "alerta" ? "error" : "neutral"}
        highlight={tono === "destacado"}
        info={ayuda ? <InfoTip what={ayuda} /> : undefined}
      />
      {accion && <div>{accion}</div>}
    </div>
  );
}
