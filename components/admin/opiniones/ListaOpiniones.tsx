import { CornerUpLeft, MessageSquare, Star } from "@buleje/design-system/icons";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ETIQUETA_CANAL, tipoDe, type Opinion } from "./shared";

const COLOR_PUNTAJE = {
  contento: "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]",
  conforme: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]",
  descontento: "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]",
} as const;

export function ListaOpiniones({ opiniones }: { opiniones: Opinion[] }) {
  return (
    <ul className="space-y-2">
      {opiniones.map((o) => (
        <li key={o.id} className="flex items-start gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <span className={cn("flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full text-base font-extrabold leading-none", COLOR_PUNTAJE[tipoDe(o.puntaje)])} title={`${o.estrellas} de 5 estrellas`}>
            {o.estrellas}
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-bold text-[var(--text-primary)]">{o.cliente}</span>
              <span className="rounded bg-[var(--rule-soft)] px-1.5 py-0.5 text-sm text-[var(--text-secondary)]">{ETIQUETA_CANAL[o.canal]}</span>
              <span className="text-sm text-[var(--text-secondary)]">{formatDateShort(o.fecha)}</span>
              {o.pendiente && <span className="rounded bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-sm font-semibold text-[var(--data-warning-ink)]">Por moderar</span>}
            </div>
            {o.comentario && (
              <p className="flex items-start gap-1.5 text-sm text-[var(--text-primary)]">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                {o.comentario}
              </p>
            )}
            {o.respuesta && (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
                <CornerUpLeft className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span><strong>Tu respuesta:</strong> {o.respuesta}</span>
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
