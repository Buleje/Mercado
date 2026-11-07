"use client";

/**
 * GrillaMes — el mes como en Google Calendar: 6 semanas de lunes a domingo,
 * hoy en un círculo, un chip por actividad con el color de su estado y
 * «+N más» cuando no entran. En el celular cada día muestra puntos en vez de
 * chips. Las flechas mueven el día elegido (un solo Tab entra a la grilla).
 */
import { useRef, type KeyboardEvent } from "react";
import { Bell, ListChecks, StickyNote } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ColorAgenda, DiaAgenda, FechaKey } from "@/lib/agenda/tipos";
import { ESTILO_ESTADO, PUNTO_COLOR } from "../comun/estado-ocurrencia";
import { DIAS_CORTOS, DIAS_INICIAL, ORDEN_SEMANA, diaDelMes, fechaLarga, mismoMes, sumarDias } from "../comun/fechas";

const CHIPS_POR_DIA = 3;
const PUNTOS_POR_DIA = 4;

interface Props {
  dias: readonly FechaKey[];
  mes: FechaKey;
  datos: ReadonlyMap<FechaKey, DiaAgenda>;
  hoy: FechaKey;
  elegido: FechaKey;
  onElegir: (fecha: FechaKey) => void;
  colorDe: (actividadId: string) => ColorAgenda;
}

/** «sábado 18/10: 3 actividades (1 atrasada), 1 nota». */
export function resumenDelDia(fecha: FechaKey, dia: DiaAgenda | undefined): string {
  const partes: string[] = [];
  const n = dia?.ocurrencias.length ?? 0;
  if (n > 0) {
    const atrasadas = dia?.ocurrencias.filter((o) => o.estado === "atrasada").length ?? 0;
    partes.push(`${n} ${n === 1 ? "actividad" : "actividades"}${atrasadas > 0 ? ` (${atrasadas} atrasada${atrasadas === 1 ? "" : "s"})` : ""}`);
  }
  const t = dia?.tareas.length ?? 0;
  if (t > 0) partes.push(`${t} ${t === 1 ? "tarea" : "tareas"}`);
  const v = dia?.vencimientos.length ?? 0;
  if (v > 0) partes.push(`${v} ${v === 1 ? "vencimiento" : "vencimientos"}`);
  const no = dia?.notas.length ?? 0;
  if (no > 0) partes.push(`${no} ${no === 1 ? "nota" : "notas"}`);
  return `${fechaLarga(fecha)}: ${partes.length ? partes.join(", ") : "nada"}`;
}

export function GrillaMes({ dias, mes, datos, hoy, elegido, onElegir, colorDe }: Props) {
  const celdas = useRef(new Map<FechaKey, HTMLButtonElement>());

  const mover = (e: KeyboardEvent<HTMLButtonElement>, fecha: FechaKey) => {
    const salto = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (salto === undefined) return;
    e.preventDefault();
    const destino = sumarDias(fecha, salto);
    onElegir(destino);
    requestAnimationFrame(() => celdas.current.get(destino)?.focus());
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="grid grid-cols-7 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]" aria-hidden="true">
        {ORDEN_SEMANA.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            <span className="sm:hidden">{DIAS_INICIAL[d]}</span>
            <span className="max-sm:hidden">{DIAS_CORTOS[d]}</span>
          </div>
        ))}
      </div>
      <div role="group" aria-label="Días del mes" className="grid grid-cols-7">
        {dias.map((fecha, i) => {
          const dia = datos.get(fecha);
          const delMes = mismoMes(fecha, mes);
          const esHoy = fecha === hoy;
          const esElegido = fecha === elegido;
          const ocurrencias = dia?.ocurrencias ?? [];
          const extra = ocurrencias.length - CHIPS_POR_DIA;
          return (
            <button
              key={fecha}
              ref={(el) => {
                if (el) celdas.current.set(fecha, el);
                else celdas.current.delete(fecha);
              }}
              type="button"
              tabIndex={esElegido ? 0 : -1}
              aria-pressed={esElegido}
              aria-current={esHoy ? "date" : undefined}
              aria-label={resumenDelDia(fecha, dia)}
              onClick={() => onElegir(fecha)}
              onKeyDown={(e) => mover(e, fecha)}
              className={cn(
                "flex min-h-[4.5rem] min-w-0 flex-col gap-1 p-1 text-left align-top transition-colors sm:min-h-28 sm:p-1.5",
                "focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                i % 7 !== 6 && "border-r border-[var(--rule-soft)]",
                i < 35 && "border-b border-[var(--rule-soft)]",
                delMes ? "hover:bg-[var(--surface-sunken)]" : "bg-[var(--surface-sunken)]/60 hover:bg-[var(--surface-sunken)]",
                esElegido && "bg-[var(--accent-soft)] ring-1 ring-inset ring-[var(--accent)] hover:bg-[var(--accent-soft)]",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                  esHoy ? "bg-[var(--accent-ink)] text-white dark:bg-[var(--accent)] dark:text-[var(--surface-canvas)]" : delMes ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
                )}
              >
                {diaDelMes(fecha)}
              </span>
              {/* Celular: un punto por actividad, en el color de su estado. */}
              {ocurrencias.length > 0 && (
                <span className="flex flex-wrap gap-0.5 px-0.5 sm:hidden" aria-hidden="true">
                  {ocurrencias.slice(0, PUNTOS_POR_DIA).map((o) => (
                    <span key={o.actividadId} className={cn("size-1.5 rounded-full", ESTILO_ESTADO[o.estado].punto)} />
                  ))}
                </span>
              )}
              {/* Desde 640 px: chips con el nombre. */}
              <span className="hidden min-w-0 flex-col gap-0.5 sm:flex" aria-hidden="true">
                {ocurrencias.slice(0, CHIPS_POR_DIA).map((o) => {
                  const estilo = ESTILO_ESTADO[o.estado];
                  return (
                    <span key={o.actividadId} title={o.nombre} className={cn("flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium", estilo.chip)}>
                      <span className={cn("size-1.5 shrink-0 rounded-full", PUNTO_COLOR[colorDe(o.actividadId)])} />
                      <span className="truncate">{o.nombre}</span>
                    </span>
                  );
                })}
                {extra > 0 && <span className="px-1.5 text-xs font-semibold text-[var(--text-secondary)]">+{extra} más</span>}
              </span>
              <Marcas dia={dia} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Notas, tareas y vencimientos del día: un ícono con su cuenta. */
function Marcas({ dia }: { dia: DiaAgenda | undefined }) {
  if (!dia) return null;
  const items = [
    { n: dia.notas.length, icon: StickyNote, clave: "notas" },
    { n: dia.tareas.length, icon: ListChecks, clave: "tareas" },
    { n: dia.vencimientos.length, icon: Bell, clave: "vencimientos" },
  ].filter((x) => x.n > 0);
  if (items.length === 0) return null;
  return (
    <span className="mt-auto flex flex-wrap items-center gap-x-1.5 px-0.5 text-xs text-[var(--text-tertiary)]" aria-hidden="true">
      {items.map(({ n, icon: Icono, clave }) => (
        <span key={clave} className="inline-flex items-center gap-0.5">
          <Icono className="size-3" />
          <span className="max-sm:hidden">{n}</span>
        </span>
      ))}
    </span>
  );
}
