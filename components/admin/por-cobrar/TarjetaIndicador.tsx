/**
 * Una tarjeta de los Indicadores plegables de «Por cobrar y pagar» (las cuatro
 * vistas: lo que te deben, lo que debes, a quién fiarle y préstamos): rótulo,
 * cifra y una línea de detalle. La misma forma que `use-indicadores-caja`.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";

export default function TarjetaIndicador({
  rotulo,
  valor,
  detalle,
  icono: Icono,
  tono = "normal",
  ayuda,
}: {
  rotulo: string;
  valor: string;
  detalle?: string;
  icono: LucideIcon;
  /** `alerta` = vencido o bloqueado (rojo); `destacado` = la cifra que se mira primero. */
  tono?: "normal" | "destacado" | "alerta";
  ayuda?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--surface-raised)] p-3",
        tono === "destacado" ? "border-primary/40 ring-1 ring-primary/20" : "border-[var(--rule-base)]",
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
          <Icono className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip what={ayuda} />}
      </div>
      <p
        className={cn(
          "text-lg font-extrabold tabular-nums",
          tono === "alerta" ? "text-[var(--data-error-ink)]" : tono === "destacado" ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-primary)]",
        )}
      >
        {valor}
      </p>
      {detalle && <p className="text-sm text-[var(--text-secondary)]">{detalle}</p>}
    </div>
  );
}
