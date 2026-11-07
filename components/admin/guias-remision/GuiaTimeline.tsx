/** Los estados por los que pasó la guía: borrador → emitida → en tránsito → entregada (o anulada). */
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { ESTADOS_ORDEN, STATUS_META, type GuiaRemision } from "./tipos";

export function GuiaTimeline({ guia }: { guia: GuiaRemision }) {
  const anulada = guia.status === "ANULADA";
  const actual = ESTADOS_ORDEN.indexOf(anulada ? "BORRADOR" : (guia.status as (typeof ESTADOS_ORDEN)[number]));
  return (
    <ol className="space-y-0">
      {ESTADOS_ORDEN.map((st, idx) => {
        const hecho = idx <= actual && !anulada;
        return (
          <li key={st} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", hecho ? "bg-[var(--data-success-100)]" : "bg-[var(--surface-sunken)]")}>
                <span className={cn("h-2 w-2 rounded-full", hecho ? "bg-[var(--data-success-500)]" : "bg-[var(--rule-base)]")} />
              </span>
              {idx < ESTADOS_ORDEN.length - 1 && <span className={cn("h-5 w-0.5", hecho ? "bg-[var(--data-success-500)]" : "bg-[var(--rule-soft)]")} />}
            </div>
            <div className="pb-2">
              <p className={cn("text-sm font-bold", hecho ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>{STATUS_META[st].label}</p>
              {hecho && idx === 0 && <p className="text-sm text-[var(--text-tertiary)]">{formatDate(guia.createdAt)}</p>}
              {hecho && idx === actual && idx > 0 && <p className="text-sm text-[var(--text-tertiary)]">{formatDate(guia.updatedAt)}</p>}
              {!hecho && <p className="text-sm italic text-[var(--text-tertiary)]">pendiente</p>}
            </div>
          </li>
        );
      })}
      {anulada && (
        <li className="mt-1 flex items-center gap-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--data-error-100)]">
            <span className="h-2 w-2 rounded-full bg-[var(--data-error-500)]" />
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--data-error-ink)]">Anulada</p>
            <p className="text-sm text-[var(--text-tertiary)]">{formatDate(guia.updatedAt)}</p>
          </div>
        </li>
      )}
    </ol>
  );
}
