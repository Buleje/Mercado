/**
 * TarjetaLogro — un logro: icono con el color de su área si está ganado (gris
 * si no), el nombre, el día en que se ganó («Ganado el jueves 17/05») o cuánto
 * te falta con una barra, y un ⓘ con qué mide y de dónde sale. Una fila de
 * 14 px o más; `proximo` marca el que tienes más cerca.
 */
import type { CSSProperties } from "react";
import { Award, Check } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { LogroDTO } from "@/lib/metas/logros-reglas";
import { cn } from "@/lib/utils";
import { ICONO_LOGRO } from "./areas-logro";
import { avanceLogro, cifraLogro, elDia, faltaLogro } from "./formato-logro";

function estadoDe(logro: LogroDTO, hoy: string): string {
  if (logro.sinDato) return "Sin dato: la fuente no se pudo leer";
  if (logro.ganado) return logro.desde ? `Ganado ${elDia(logro.desde, hoy)}` : "Ganado";
  return faltaLogro(logro) ?? logro.detalle ?? "Por ganar";
}

export function TarjetaLogro({
  logro,
  color,
  hoy,
  proximo = false,
}: {
  logro: LogroDTO;
  color: string;
  hoy: string;
  proximo?: boolean;
}) {
  const Icono = ICONO_LOGRO[logro.id] ?? Award;
  const p = logro.progreso;
  const pct = avanceLogro(logro) * 100;
  const estado = estadoDe(logro, hoy);
  const conBarra = !logro.ganado && !logro.sinDato && p !== undefined && p.meta > 0;
  /* «x de y» va al ⓘ: a la vista, sólo cuánto falta. */
  const llevas =
    p && conBarra && logro.id !== "mejor-dia"
      ? `Llevas ${cifraLogro(Math.min(p.valor, p.meta), p.unidad)} de ${cifraLogro(p.meta, p.unidad)}.`
      : null;
  const cuerpo = [logro.detalle, llevas].filter(Boolean).join(" · ");
  return (
    <li
      data-logro={logro.id}
      data-ganado={logro.ganado ? "si" : "no"}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
        logro.ganado
          ? "border-[color-mix(in_srgb,var(--area)_40%,transparent)] bg-[color-mix(in_srgb,var(--area)_8%,var(--surface-raised))]"
          : proximo
            ? "border-[var(--accent)] bg-[var(--surface-raised)]"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
      )}
      style={{ "--area": color } as CSSProperties}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative grid h-10 w-10 shrink-0 place-items-center rounded-full",
          logro.ganado
            ? "bg-[color-mix(in_srgb,var(--area)_18%,transparent)] text-[var(--area)]"
            : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
        )}
      >
        <Icono className="h-5 w-5" />
        {logro.ganado && (
          <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-[var(--data-success)] text-[var(--surface-raised)]">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <span
            className={cn(
              "line-clamp-2 text-sm font-bold leading-snug",
              logro.ganado ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
            )}
          >
            {logro.nombre}
          </span>
          <InfoTip
            title={logro.nombre}
            what={logro.queMide}
            {...(cuerpo ? { body: cuerpo } : {})}
            ariaLabel={`Qué mide «${logro.nombre}»`}
          />
        </div>
        <span
          className={cn(
            "line-clamp-2 text-sm",
            logro.ganado
              ? "font-semibold text-[var(--data-success-ink)]"
              : proximo
                ? "font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "text-[var(--text-secondary)]",
          )}
        >
          {proximo && !logro.ganado ? `Lo próximo · ${estado.charAt(0).toLowerCase()}${estado.slice(1)}` : estado}
        </span>
        {conBarra && (
          <span
            role="progressbar"
            aria-label={`${logro.nombre}: ${estado}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
          >
            <span
              className="block h-full rounded-full bg-[var(--area)]"
              style={{ width: `${pct}%` }}
            />
          </span>
        )}
      </div>
    </li>
  );
}
