"use client";

/**
 * «Para quién»: cuántos clientes hay en cada audiencia y, con un toque, la
 * campaña nueva ya apuntada a ese grupo. Es lo que hacía la pestaña Segmentos
 * (cinco tarjetas de ~200 px con el mismo botón) en una fila de 48 px; lo que
 * ya se manda solo va al ⓘ.
 */
import { Bot } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { AUDIENCIAS, type Segment } from "./tipos";

export function AudienciasCampana({
  conteos,
  onElegir,
}: {
  conteos: Partial<Record<Segment, number | null>>;
  onElegir: (s: Segment) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 max-sm:-my-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:py-1 scrollbar-hide" role="group" aria-label="Crear una campaña para">
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]">
        Para quién
        <InfoTip
          title="Para quién va una campaña"
          what={
            <>
              {AUDIENCIAS.map((a) => (
                <span key={a.id} className="block">
                  <strong>{a.corto}:</strong> {a.regla}
                  {a.auto ? ` ${a.auto}` : ""}
                </span>
              ))}
            </>
          }
          affects="Sólo reciben los que aceptaron promociones (Ley 29733). Toca un grupo para escribirle."
          example="Inactivos 15: toca y la campaña nueva sale apuntada a esos 15."
        />
      </span>
      {AUDIENCIAS.map((a) => {
        const n = conteos[a.id];
        const Icono = a.icono;
        const vacio = n === 0;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onElegir(a.id)}
            disabled={vacio}
            title={`${a.regla}${a.auto ? ` ${a.auto}` : ""}`}
            className={cn(
              "inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] transition-colors",
              vacio ? "cursor-not-allowed text-[var(--text-tertiary)]" : "hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]",
            )}
          >
            <Icono className="h-4 w-4 shrink-0" aria-hidden />
            {a.corto}
            <span className="tabular-nums font-bold">{n === undefined || n === null ? "…" : n}</span>
            {a.auto && <Bot className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-label="ya recibe un mensaje automático" />}
          </button>
        );
      })}
    </div>
  );
}
