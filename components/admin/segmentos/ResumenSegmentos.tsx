"use client";

/**
 * «Por segmento» para los Indicadores de Mis clientes: cuántos hay en cada
 * grupo y cuánto gastaron, y un toque filtra la lista por ese grupo.
 * Es lo que Clientes › Segmentos agrega a la faceta «Segmento» de la tabla;
 * con esto montado, esa vista puede quedar como alias de Mis clientes.
 *
 * Montaje (CrmIndicadores, panel abierto):
 *   <ResumenSegmentos clientes={crm.customers} onElegir={(s) => crm.setFilterSegment([s])} />
 */
import { SEGMENT_CONFIG, type Customer, type Segment } from "@/components/admin/crm/crm-compartido";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AYUDA_SEGMENTOS, REGLA_SEGMENTO } from "./regla-segmentos";

const SEGMENTOS = Object.keys(SEGMENT_CONFIG) as Segment[];

export function ResumenSegmentos({ clientes, onElegir }: { clientes: readonly Customer[]; onElegir?: (s: Segment) => void }) {
  const filas = SEGMENTOS.map((s) => {
    const del = clientes.filter((c) => (c._segment ?? "nuevo") === s);
    return { s, n: del.length, gastado: del.reduce((t, c) => t + (c.totalSpent ?? 0), 0) };
  });

  return (
    <div className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">Por segmento</span>
        <InfoTip title="Segmentos" what={AYUDA_SEGMENTOS.what} affects={AYUDA_SEGMENTOS.affects} example={AYUDA_SEGMENTOS.example} />
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {filas.map(({ s, n, gastado }) => {
          const cfg = SEGMENT_CONFIG[s];
          const Icono = cfg.Icon;
          return (
            <li key={s}>
              <button
                type="button"
                disabled={!onElegir}
                onClick={() => onElegir?.(s)}
                title={REGLA_SEGMENTO[s]}
                className="flex min-h-12 w-full items-center gap-2 text-left text-sm transition-colors enabled:hover:text-[var(--accent-ink)] dark:enabled:hover:text-[var(--accent)]"
              >
                <Icono className={cn("h-4 w-4 shrink-0", cfg.color)} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">{cfg.label}</span>
                <span className="tabular-nums text-[var(--text-secondary)]">{n}</span>
                <span className="w-24 text-right font-semibold tabular-nums text-[var(--text-primary)]">{formatCurrency(gastado)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
