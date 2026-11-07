"use client";

/**
 * AtrasadasAgrupadas — lo atrasado de la ventana de avisos, UNA fila por
 * actividad (Brandon 31-10: «Marcar la asistencia» y «Hacer Facturas a Don
 * Lucho» salían repetidas un renglón por día y la lista no se terminaba).
 * La fila dice cuántos días lleva y de qué día a qué día; al abrirla salen
 * esos días con sus botones de siempre (`ListaOcurrencias`: Hecha, ir, «⋯»).
 * Lo que se atrasó un solo día sale tal cual, sin grupo.
 */
import { useState, type MouseEvent } from "react";
import { ArrowUpRight, ChevronDown } from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda } from "@/hooks/use-agenda";
import type { OcurrenciaDTO } from "@/lib/agenda/tipos";
import { cn } from "@/lib/utils";
import { CLASE_CHIP_ESTADO, ListaOcurrencias } from "../comun/ListaOcurrencias";
import { ESTILO_ESTADO, PUNTO_COLOR } from "../comun/estado-ocurrencia";
import { fechaRelativa, hoyKey } from "../comun/fechas";

export interface GrupoAtrasado {
  actividadId: string;
  /** Del día más viejo al más nuevo. */
  ocurrencias: OcurrenciaDTO[];
}

/** Agrupa por actividad: primero las que más días llevan; a igual cuenta, la que empezó antes. */
export function agruparAtrasadas(atrasadas: readonly OcurrenciaDTO[]): GrupoAtrasado[] {
  const porActividad = new Map<string, OcurrenciaDTO[]>();
  for (const o of atrasadas) {
    const lista = porActividad.get(o.actividadId);
    if (lista) lista.push(o);
    else porActividad.set(o.actividadId, [o]);
  }
  return [...porActividad.entries()]
    .map(([actividadId, ocurrencias]) => ({ actividadId, ocurrencias: [...ocurrencias].sort((a, b) => a.fecha.localeCompare(b.fecha)) }))
    .sort((a, b) => b.ocurrencias.length - a.ocurrencias.length || a.ocurrencias[0].fecha.localeCompare(b.ocurrencias[0].fecha));
}

interface Props {
  atrasadas: readonly OcurrenciaDTO[];
  densa: boolean;
}

export function AtrasadasAgrupadas({ atrasadas, densa }: Props) {
  const grupos = agruparAtrasadas(atrasadas);
  return (
    <div className="divide-y divide-[var(--rule-soft)]">
      {grupos.map((g) =>
        g.ocurrencias.length === 1 ? (
          <ListaOcurrencias key={g.actividadId} etiqueta={`Atrasada: ${g.ocurrencias[0].nombre}`} ocurrencias={g.ocurrencias} conFecha densa={densa} />
        ) : (
          <FilaDelGrupo key={g.actividadId} ocurrencias={g.ocurrencias} densa={densa} />
        ),
      )}
    </div>
  );
}

function irSinRecargar(e: MouseEvent<HTMLAnchorElement>, href: string) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  void irAEnlace(href);
}

function FilaDelGrupo({ ocurrencias, densa }: { ocurrencias: OcurrenciaDTO[]; densa: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const { colorDe } = useAgenda();
  const hoy = hoyKey();
  const primera = ocurrencias[0];
  const ultima = ocurrencias[ocurrencias.length - 1];
  const estilo = ESTILO_ESTADO[ultima.estado];
  const Icono = estilo.icon;
  const panelId = `atrasadas-${primera.actividadId}`;
  return (
    <div className="py-2" data-qa="aviso-atrasada-grupo">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={panelId}
          onClick={() => setAbierto((v) => !v)}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-1 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)]"
          title={abierto ? "Esconder los días" : "Ver cada día"}
        >
          <Icono className={cn("size-5 shrink-0", estilo.texto)} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 font-semibold text-[var(--text-primary)]">
                <span className={cn("mr-2 inline-block size-2 rounded-full align-middle", PUNTO_COLOR[colorDe(primera.actividadId)])} aria-hidden="true" />
                {primera.nombre}
              </span>
              {primera.hora && <span className="text-sm tabular-nums text-[var(--text-tertiary)]">{primera.hora}</span>}
              <span className={cn(CLASE_CHIP_ESTADO, estilo.chip)}>{ocurrencias.length} días</span>
            </span>
            <span className="mt-0.5 block text-sm text-[var(--text-tertiary)]">
              {fechaRelativa(primera.fecha, hoy)} → {fechaRelativa(ultima.fecha, hoy)}
            </span>
          </span>
          <ChevronDown className={cn("size-5 shrink-0 text-[var(--text-tertiary)] transition-transform", abierto && "rotate-180")} aria-hidden="true" />
        </button>
        <a
          href={ultima.href}
          onClick={(e) => irSinRecargar(e, ultima.href)}
          className={button({ variant: "ghost", size: "icon", className: "size-10 shrink-0" })}
          aria-label={`Ir a hacerlo: ${primera.nombre}`}
          title="Ir a hacerlo"
        >
          <ArrowUpRight className="size-5" aria-hidden="true" />
        </a>
      </div>
      {abierto && (
        <div id={panelId} className="ml-3 mt-1 border-l-2 border-[var(--rule-soft)] pl-3">
          <ListaOcurrencias etiqueta={`${primera.nombre}: días atrasados`} ocurrencias={ocurrencias} conFecha densa={densa} />
        </div>
      )}
    </div>
  );
}
