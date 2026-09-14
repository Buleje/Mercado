"use client";

/**
 * MesPorPersona — la hoja del mes en el celular: una persona a la vez, en
 * calendario (semanas × días).
 *
 * Por qué: medido 2026-09-14 a 400 px, la tabla del mes convertida en
 * tarjetas apilaba los 31 días de cada persona uno debajo del otro — 1.490 px
 * por persona. En calendario, el mes entero entra en una pantalla y cada
 * casilla abre el mismo `CeldaMarcaPopover` que la tabla.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { dateDeFechaKey, etiquetaDia } from "@/lib/rrhh/fechas";
import { BOTON, CLASE_CAMPO, CLASE_CHIP } from "../rrhh-form";
import { ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA, contarEstado, dentroDeVentana, estaIncluidoEseDia, motivoFueraDeVentana, pluralizar, type VentanaMarcado } from "../rrhh-ui";
import CeldaMarcaPopover from "./CeldaMarcaPopover";
import { conteoDelMes } from "./conteo-mes";
import type { AsistenciaDTO, ColaboradorMinDTO, EstadoAsistencia, FechaKey } from "@/lib/rrhh/tipos";

interface Props {
  colaboradores: ColaboradorMinDTO[];
  marcas: AsistenciaDTO[];
  dias: FechaKey[];
  hoy: FechaKey;
  ventana: VentanaMarcado;
  pendientes: ReadonlySet<string>;
  erroresPorCelda: ReadonlyMap<string, string>;
  onMarcar: (colaboradorId: string, fecha: FechaKey, estado: EstadoAsistencia | null) => void;
  onVerHistorial: (colaborador: ColaboradorMinDTO, fecha: FechaKey) => void;
}

/** Lunes primero, como se lee un calendario en el Perú. */
const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];
const CLASE_FLECHA = cn(BOTON.icono, "h-11 w-11 border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]");

export default function MesPorPersona({ colaboradores, marcas, dias, hoy, ventana, pendientes, erroresPorCelda, onMarcar, onVerHistorial }: Props) {
  const [indice, setIndice] = useState(0);
  if (colaboradores.length === 0 || dias.length === 0) return null;

  const i = Math.min(indice, colaboradores.length - 1);
  const persona = colaboradores[i]!;
  const marcasDeLaPersona = marcas.filter((m) => m.colaboradorId === persona.id);
  const { conteo, sinMarcar } = conteoDelMes(persona, marcasDeLaPersona, dias, hoy);
  // Casillas vacías antes del día 1: getUTCDay() da 0 = domingo; con lunes primero, domingo va al final.
  const huecos = (dateDeFechaKey(dias[0]!).getUTCDay() + 6) % 7;

  return (
    <section aria-label="Hoja del mes por persona" className="space-y-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setIndice(i - 1)} disabled={i === 0} className={CLASE_FLECHA} aria-label="Persona anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <select aria-label="Persona" value={persona.id} onChange={(e) => setIndice(Math.max(0, colaboradores.findIndex((c) => c.id === e.target.value)))} className={cn(CLASE_CAMPO, "flex-1")}>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setIndice(i + 1)} disabled={i === colaboradores.length - 1} className={CLASE_FLECHA} aria-label="Persona siguiente">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[var(--text-tertiary)]">
          {i + 1} de {colaboradores.length}
          {persona.puesto && ` · ${persona.puesto.nombre}`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ORDEN_ESTADOS_ASISTENCIA.filter((e) => conteo[e] > 0).map((e) => (
            <span key={e} className={cn(CLASE_CHIP, ESTADO_ASISTENCIA_META[e].claseChip)}>
              {contarEstado(conteo[e], e)}
            </span>
          ))}
          {sinMarcar > 0 && <span className={cn(CLASE_CHIP, "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>{pluralizar(sinMarcar, "día sin marcar", "días sin marcar")}</span>}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DIAS_SEMANA.map((letra, k) => (
          <span key={`dia-${k}`} aria-hidden className="pb-1 text-xs font-semibold text-[var(--text-tertiary)]">
            {letra}
          </span>
        ))}
        {Array.from({ length: huecos }, (_, k) => (
          <span key={`hueco-${k}`} aria-hidden />
        ))}
        {dias.map((d) => {
          const editable = dentroDeVentana(d, ventana);
          return (
            <div key={d} title={etiquetaDia(d, hoy)} className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1", d === hoy && "bg-primary/10")}>
              <span aria-hidden className={cn("text-xs tabular-nums", d === hoy ? "font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-tertiary)]")}>
                {Number(d.slice(8, 10))}
              </span>
              <CeldaMarcaPopover
                tamano="grande"
                colaborador={persona}
                fecha={d}
                marca={marcasDeLaPersona.find((m) => m.fecha === d)}
                incluido={estaIncluidoEseDia(persona, d) && d <= hoy}
                editable={editable}
                motivoNoEditable={editable ? undefined : motivoFueraDeVentana(ventana)}
                pendiente={pendientes.has(`${persona.id}|${d}`)}
                errorMsg={erroresPorCelda.get(`${persona.id}|${d}`)}
                onMarcar={(estado) => onMarcar(persona.id, d, estado)}
                onVerHistorial={() => onVerHistorial(persona, d)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
