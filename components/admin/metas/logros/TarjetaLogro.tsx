/**
 * TarjetaLogro — un logro: icono con el color de su área si está ganado (gris
 * si no), el nombre, el día en que se ganó o cuánto falta con una barra, y un
 * ⓘ con qué mide y de dónde sale. Compacta (una fila) para que 24 logros
 * entren en menos de dos pantallas.
 */
import type { CSSProperties } from "react";
import { Award, Check } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";
import { formatNumber } from "@/lib/format";
import { fechaParaMostrar } from "@/lib/admin/metas-tareas";
import type { LogroDTO } from "@/lib/metas/logros-reglas";
import { cn } from "@/lib/utils";
import { ICONO_LOGRO } from "./areas-logro";

function cifra(v: number, unidad: string): string {
  if (unidad === "S/") return cifraDeMeta(v, "S/");
  if (unidad === "m³") return `${formatNumber(v, { max: 1 })} m³`;
  return `${formatNumber(v, { max: 0 })} ${unidad}`;
}

export function TarjetaLogro({ logro, color }: { logro: LogroDTO; color: string }) {
  const Icono = ICONO_LOGRO[logro.id] ?? Award;
  const p = logro.progreso;
  const pct = p && p.meta > 0 ? Math.max(0, Math.min(100, (p.valor / p.meta) * 100)) : 0;
  const estado = logro.sinDato
    ? "Sin dato"
    : logro.ganado
      ? logro.desde
        ? `Ganado el ${fechaParaMostrar(logro.desde)}`
        : "Ganado"
      : p
        ? logro.id === "mejor-dia"
          ? `Hoy ${cifra(p.valor, p.unidad)} · récord ${cifra(p.meta, p.unidad)}`
          : p.unidad === "S/"
            ? `${cifra(Math.min(p.valor, p.meta), p.unidad)} de ${cifra(p.meta, p.unidad)}`
            : `${formatNumber(Math.min(p.valor, p.meta), { max: 1 })} de ${cifra(p.meta, p.unidad)}`
        : (logro.detalle ?? "Por ganar");
  return (
    <li
      data-logro={logro.id}
      data-ganado={logro.ganado ? "si" : "no"}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
        logro.ganado
          ? "border-[color-mix(in_srgb,var(--area)_40%,transparent)] bg-[color-mix(in_srgb,var(--area)_8%,var(--surface-raised))]"
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
            {...(logro.detalle ? { body: logro.detalle } : {})}
            ariaLabel={`Qué mide «${logro.nombre}»`}
          />
        </div>
        <span
          className={cn(
            "line-clamp-2 text-xs",
            logro.ganado
              ? "font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              : "text-[var(--text-tertiary)]",
          )}
        >
          {estado}
        </span>
        {!logro.ganado && p && p.meta > 0 && (
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
