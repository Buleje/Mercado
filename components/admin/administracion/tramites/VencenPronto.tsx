"use client";

/**
 * VencenPronto — los trámites abiertos cuyo vencimiento o próximo paso cae en
 * los próximos 30 días (o ya pasó). Va arriba de la lista: es lo primero que
 * se mira. Sin ninguno, no ocupa lugar.
 */
import { CalendarClock } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { TramiteDto } from "@/lib/admin/fichas-tramites-alquileres";
import { fechaRelativa, hoyKey, sumarDias } from "../comun/fechas";
import { ESTADOS_TERMINADOS, entidadDe, proximaFecha } from "./tramites-ui";

const DIAS = 30;
const MAX = 5;

export function VencenPronto({ tramites, onAbrir }: { tramites: readonly TramiteDto[]; onAbrir: (t: TramiteDto) => void }) {
  const hoy = hoyKey();
  const tope = sumarDias(hoy, DIAS);
  const pronto = tramites
    .filter((t) => !ESTADOS_TERMINADOS.includes(t.estado))
    .map((t) => ({ t, fecha: proximaFecha(t) }))
    .filter((x): x is { t: TramiteDto; fecha: string } => !!x.fecha && x.fecha <= tope)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (pronto.length === 0) return null;

  return (
    <section aria-label="Vencen pronto" className="space-y-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-5 text-[var(--text-tertiary)]" aria-hidden="true" />
        <CardTitle as="h3">Vencen pronto</CardTitle>
        <InfoTip
          what={`Trámites sin cerrar cuyo vencimiento o próximo paso cae en los próximos ${DIAS} días, o que ya pasó.`}
          affects="Los mismos salen en Hoy y en el calendario de la agenda."
          example="«Reactivar el RUC» con el próximo paso «ir a la SUNAT» el jueves."
        />
        <span className="ml-auto text-sm text-[var(--text-tertiary)]">{pronto.length}</span>
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {pronto.slice(0, MAX).map(({ t, fecha }) => {
          const paso = t.proximoPasoEl === fecha;
          const vencido = fecha < hoy;
          return (
            <li key={t.id}>
              <button type="button" className={button({ variant: "ghost", className: "h-auto min-h-12 w-full justify-start gap-3 px-2 text-left" })} onClick={() => onAbrir(t)}>
                <span className={cn("w-28 shrink-0 font-semibold", vencido ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]")}>{fechaRelativa(fecha, hoy)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--text-primary)]">{t.asunto}</span>
                  <span className="block truncate text-sm font-normal text-[var(--text-tertiary)]">
                    {entidadDe(t)} · {paso ? (t.proximoPaso ?? "Próximo paso") : vencido ? "Venció" : "Vence"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {pronto.length > MAX && <p className="px-2 text-sm text-[var(--text-tertiary)]">y {pronto.length - MAX} más en la lista</p>}
    </section>
  );
}
