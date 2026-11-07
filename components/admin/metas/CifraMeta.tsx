/**
 * CifraMeta — una cifra de los indicadores plegables de Metas y logros (Hoy y
 * Calendario): etiqueta con su ícono, el valor grande y una línea de detalle.
 * Todo en 14 px o más; el tono (éxito/aviso/error) sólo pinta el valor.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { TEXTO_TONO, type TonoMeta } from "@/components/admin/metas/clases-meta";
import { cn } from "@/lib/utils";

export function CifraMeta({
  etiqueta,
  valor,
  detalle,
  icono: Icono,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle?: ReactNode;
  icono: LucideIcon;
  tono?: TonoMeta;
}) {
  return (
    <div className="flex h-full flex-col gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--text-secondary)]">
        {etiqueta}
        <Icono aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
      </span>
      <span className={cn("text-2xl font-bold tabular-nums text-[var(--text-primary)]", tono && TEXTO_TONO[tono])}>
        {valor}
      </span>
      {detalle && <span className="text-sm text-[var(--text-secondary)]">{detalle}</span>}
    </div>
  );
}
