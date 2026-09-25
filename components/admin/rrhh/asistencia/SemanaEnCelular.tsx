"use client";

/**
 * SemanaEnCelular — la hoja de la semana bajo 640 px: el calendario por persona
 * (`MesPorPersona`, con los 7 días) y abajo el resumen de cada uno.
 *
 * Salió tal cual de `HojaDeLaSemana`, que pasaba las ~300 líneas del estándar:
 * es el MISMO markup, sin cambios de comportamiento. Lo único que se agregó al
 * mudarlo es el par de la tardanza (`horarios` + `onAceptarTardanza`, ADR-417),
 * para que lo que se ve en la tabla de escritorio se vea también en el celular
 * —que es donde Brandon revisa—.
 */

import MesPorPersona from "./MesPorPersona";
import { formatearPEN } from "../rrhh-ui";
import { formatearDias, type HorarioDelPuesto } from "./semana";
import type { FilaSemana } from "./semana-pdf";
import type { VentanaMarcado } from "../rrhh-ui";
import type { AsistenciaDTO, ColaboradorMinDTO, EstadoAsistencia, FechaKey } from "@/lib/rrhh/tipos";

interface Props {
  filas: FilaSemana[];
  colaboradores: ColaboradorMinDTO[];
  marcas: AsistenciaDTO[];
  dias: FechaKey[];
  hoy: FechaKey;
  ventana: VentanaMarcado;
  horarios: ReadonlyMap<string, HorarioDelPuesto>;
  pendientes: ReadonlySet<string>;
  erroresPorCelda: ReadonlyMap<string, string>;
  /** Sólo el nivel completo ve plata. */
  conPlata: boolean;
  onMarcar: (colaboradorId: string, fecha: FechaKey, estado: EstadoAsistencia | null) => void;
  onAceptarTardanza: (colaboradorId: string, fecha: FechaKey) => void;
  onVerHistorial: (colaborador: ColaboradorMinDTO, fecha: FechaKey) => void;
}

export default function SemanaEnCelular({ filas, colaboradores, marcas, dias, hoy, ventana, horarios, pendientes, erroresPorCelda, conPlata, onMarcar, onAceptarTardanza, onVerHistorial }: Props) {
  return (
    <div className="space-y-3 sm:hidden">
      <MesPorPersona
        colaboradores={colaboradores}
        marcas={marcas}
        dias={dias}
        hoy={hoy}
        ventana={ventana}
        pendientes={pendientes}
        erroresPorCelda={erroresPorCelda}
        horarios={horarios}
        onMarcar={onMarcar}
        onAceptarTardanza={onAceptarTardanza}
        onVerHistorial={onVerHistorial}
      />
      <ul aria-label="Resumen de la semana por persona" className="space-y-2">
        {filas.map(({ c, conteo, trabajados, plata }) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--text-primary)]">{c.nombre}</p>
              <p className="text-xs text-[var(--text-tertiary)]">
                {formatearDias(trabajados)} días trabajados · {conteo.FALTA} {conteo.FALTA === 1 ? "falta" : "faltas"}
              </p>
            </div>
            {conPlata && <span className="shrink-0 font-bold tabular-nums text-[var(--text-primary)]">{plata ? formatearPEN(plata.total) : "—"}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
