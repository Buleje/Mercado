"use client";

/**
 * SemanaEnTabla — la hoja de la semana en escritorio: personas × lunes a
 * domingo, con lo ganado del día y el total de cada uno (ADR-416).
 *
 * Salió tal cual de `HojaDeLaSemana`, que pasaba las ~300 líneas del estándar:
 * el markup es el MISMO y las tres acciones (marcar, confirmar la tardanza, ver
 * el historial) siguen siendo del padre, ahora por props. Bajo 640 px esto se
 * esconde y se ve `SemanaEnCelular`.
 */

import { DataTable } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { etiquetaDia } from "@/lib/rrhh/fechas";
import { dentroDeVentana, estaIncluidoEseDia, etiquetaModalidad, formatearPEN, motivoFueraDeVentana, type VentanaMarcado } from "../rrhh-ui";
import CeldaMarcaPopover from "./CeldaMarcaPopover";
import { formatearDias, nombreCortoDelDia, type HorarioDelPuesto } from "./semana";
import type { FilaSemana } from "./semana-pdf";
import type { ColaboradorMinDTO, EstadoAsistencia, FechaKey } from "@/lib/rrhh/tipos";
import { formatNumber } from "@/lib/format";

interface Props {
  filas: FilaSemana[];
  dias: FechaKey[];
  hoy: FechaKey;
  ventana: VentanaMarcado;
  horarios: ReadonlyMap<string, HorarioDelPuesto>;
  pendientes: ReadonlySet<string>;
  erroresPorCelda: ReadonlyMap<string, string>;
  /** Sólo el nivel completo ve plata. */
  conPlata: boolean;
  totales: { trabajados: number; faltas: number; ganado: number | null };
  onMarcar: (colaboradorId: string, fecha: FechaKey, estado: EstadoAsistencia | null) => void;
  onAceptarTardanza: (colaboradorId: string, fecha: FechaKey) => void;
  onVerHistorial: (colaborador: ColaboradorMinDTO, fecha: FechaKey) => void;
}

export default function SemanaEnTabla({ filas, dias, hoy, ventana, horarios, pendientes, erroresPorCelda, conPlata, totales, onMarcar, onAceptarTardanza, onVerHistorial }: Props) {
  return (
    <div className="hidden sm:block">
      <DataTable zebra stickyHeader wrapperClassName="max-h-[70vh] rounded-2xl">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-[var(--surface-sunken)]">
              <span className="block w-44">Persona</span>
            </th>
            {dias.map((d) => (
              <th key={d} title={etiquetaDia(d, hoy)} className={cn("px-1 text-center", d === hoy && "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]")}>
                <span className="block text-xs font-semibold">{nombreCortoDelDia(d)}</span>
                <span className="block tabular-nums">{d.slice(8, 10)}</span>
              </th>
            ))}
            <th className="text-center">Días trab.</th>
            <th className="text-center">Faltas</th>
            {conPlata && (
              <th>
                <span className="block text-right">Referencia</span>
              </th>
            )}
            {conPlata && (
              <th>
                <span className="block text-right">Ganado semana</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {filas.map(({ c, marcasDeLaPersona, conteo, sinMarcar, trabajados, plata }) => (
            <tr key={c.id}>
              <td className="sticky left-0 z-10 bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)]">
                <span className="block w-44 truncate" title={c.nombre}>
                  {c.nombre}
                </span>
                {c.puesto && <span className="block w-44 truncate text-xs font-normal text-[var(--text-tertiary)]">{c.puesto.nombre}</span>}
              </td>
              {dias.map((d) => {
                const editable = dentroDeVentana(d, ventana);
                const importe = plata?.dias.find((x) => x.fecha === d)?.importe ?? null;
                const marca = marcasDeLaPersona.find((m) => m.fecha === d);
                return (
                  <td key={d} className={cn("p-1 text-center", d === hoy && "bg-primary/5")}>
                    <div className="flex flex-col items-center gap-1">
                      <CeldaMarcaPopover
                        colaborador={c}
                        fecha={d}
                        marca={marca}
                        incluido={estaIncluidoEseDia(c, d) && d <= hoy}
                        editable={editable}
                        motivoNoEditable={editable ? undefined : motivoFueraDeVentana(ventana)}
                        pendiente={pendientes.has(`${c.id}|${d}`)}
                        errorMsg={erroresPorCelda.get(`${c.id}|${d}`)}
                        horario={horarios.get(c.id) ?? null}
                        onMarcar={(estado) => onMarcar(c.id, d, estado)}
                        onAceptarTardanza={() => onAceptarTardanza(c.id, d)}
                        onVerHistorial={() => onVerHistorial(c, d)}
                      />
                      {conPlata && (
                        <span className={cn("text-xs tabular-nums", importe ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]")}>
                          {importe == null ? "·" : formatNumber(importe, 2)}
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
              <td className="text-center font-semibold tabular-nums text-[var(--text-primary)]">
                {formatearDias(trabajados)}
                {sinMarcar > 0 && <span className="block text-xs font-normal text-[var(--text-tertiary)]">{sinMarcar} sin marcar</span>}
              </td>
              <td className="text-center tabular-nums">
                {conteo.FALTA}
                {conteo.PERMISO > 0 && <span className="block text-xs text-[var(--text-tertiary)]">+{conteo.PERMISO} perm.</span>}
              </td>
              {conPlata && (
                <td>
                  <span className="block whitespace-nowrap text-right text-sm tabular-nums">
                    {plata?.referencia ? formatearPEN(plata.referencia.monto) : <span className="text-[var(--text-tertiary)]">Sin tarifa</span>}
                    {plata?.referencia && <span className="block text-xs text-[var(--text-tertiary)]">{etiquetaModalidad(plata.referencia.modalidad)}</span>}
                  </span>
                </td>
              )}
              {conPlata && (
                <td>
                  <span className="block whitespace-nowrap text-right font-bold tabular-nums text-[var(--text-primary)]">{plata ? formatearPEN(plata.total) : "—"}</span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {conPlata && totales.ganado != null && (
          <tfoot>
            <tr>
              <td className="sticky left-0 z-10 bg-[var(--surface-sunken)] font-bold text-[var(--text-primary)]">Total de la semana</td>
              <td colSpan={7} />
              <td className="text-center font-bold tabular-nums">{formatearDias(totales.trabajados)}</td>
              <td className="text-center font-bold tabular-nums">{totales.faltas}</td>
              <td />
              <td>
                <span className="block whitespace-nowrap text-right font-bold tabular-nums text-[var(--text-primary)]">{formatearPEN(totales.ganado)}</span>
              </td>
            </tr>
          </tfoot>
        )}
      </DataTable>
    </div>
  );
}
