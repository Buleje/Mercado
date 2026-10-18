"use client";

/**
 * VistaSemana — la semana de lunes a domingo: siete columnas desde 768 px y,
 * en el celular, un día debajo del otro. Cada actividad sale con su hora, su
 * estado y su color; tocar un día lo abre en el panel de al lado.
 */
import { ListChecks, StickyNote, Bell } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ColorAgenda, DiaAgenda, FechaKey } from "@/lib/agenda/tipos";
import { ESTILO_ESTADO, PUNTO_COLOR } from "../comun/estado-ocurrencia";
import { DIAS_CORTOS, diaDelMes, diaSemanaDe } from "../comun/fechas";
import { resumenDelDia } from "./GrillaMes";

interface Props {
  dias: readonly FechaKey[];
  datos: ReadonlyMap<FechaKey, DiaAgenda>;
  hoy: FechaKey;
  elegido: FechaKey;
  onElegir: (fecha: FechaKey) => void;
  colorDe: (actividadId: string) => ColorAgenda;
}

export function VistaSemana({ dias, datos, hoy, elegido, onElegir, colorDe }: Props) {
  return (
    <div role="group" aria-label="Días de la semana" className="grid gap-2 lg:grid-cols-7">
      {dias.map((fecha) => {
        const dia = datos.get(fecha);
        const esHoy = fecha === hoy;
        const esElegido = fecha === elegido;
        const ocurrencias = [...(dia?.ocurrencias ?? [])].sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99"));
        return (
          <button
            key={fecha}
            type="button"
            aria-pressed={esElegido}
            aria-current={esHoy ? "date" : undefined}
            aria-label={resumenDelDia(fecha, dia)}
            onClick={() => onElegir(fecha)}
            className={cn(
              "flex min-w-0 flex-col gap-2 rounded-xl border bg-[var(--surface-raised)] p-2 text-left transition-colors lg:min-h-64",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              esElegido ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            <span className="flex items-center gap-2" aria-hidden="true">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{DIAS_CORTOS[diaSemanaDe(fecha)]}</span>
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                  esHoy ? "bg-[var(--accent-ink)] text-white dark:bg-[var(--accent)] dark:text-[var(--surface-canvas)]" : "text-[var(--text-primary)]",
                )}
              >
                {diaDelMes(fecha)}
              </span>
            </span>
            <span className="flex min-w-0 flex-col gap-1" aria-hidden="true">
              {ocurrencias.length === 0 && <span className="text-xs text-[var(--text-tertiary)]">Nada</span>}
              {ocurrencias.map((o) => {
                const estilo = ESTILO_ESTADO[o.estado];
                const Icono = estilo.icon;
                return (
                  <span key={o.actividadId} className={cn("flex min-w-0 items-start gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium", estilo.chip)}>
                    <Icono className="mt-px size-3.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1">
                        <span className={cn("size-1.5 shrink-0 rounded-full", PUNTO_COLOR[colorDe(o.actividadId)])} />
                        {o.hora && <span className="tabular-nums">{o.hora}</span>}
                      </span>
                      <span className="block break-words">{o.nombre}</span>
                    </span>
                  </span>
                );
              })}
            </span>
            {dia && dia.notas.length + dia.tareas.length + dia.vencimientos.length > 0 && (
              <span className="mt-auto flex flex-wrap gap-x-2 text-xs text-[var(--text-tertiary)]" aria-hidden="true">
                {dia.tareas.length > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <ListChecks className="size-3" /> {dia.tareas.length}
                  </span>
                )}
                {dia.vencimientos.length > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <Bell className="size-3" /> {dia.vencimientos.length}
                  </span>
                )}
                {dia.notas.length > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <StickyNote className="size-3" /> {dia.notas.length}
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
