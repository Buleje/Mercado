"use client";

/**
 * HojaDelMes — personas × días del mes, una letra por celda (ADR-414 §7).
 *
 * Es una `<table>` normal a propósito: el shell del admin ya convierte toda
 * tabla en tarjetas por fila bajo los 640px (`useMobileTableCards`, memoria
 * `admin-tablas-cards-mobile-automatico`) — con una fila por PERSONA y una
 * columna por DÍA, esa conversión automática YA ES «lista por persona» sin
 * escribir un layout aparte.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { LoadingState, EmptyState, DataTable } from "@buleje/design-system";
import { Users } from "@buleje/design-system/icons";
import { avisarFallos, useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import { rangoDeDias, mesDe } from "@/lib/rrhh/fechas";
import { dentroDeVentana, ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA, estaIncluidoEseDia, leyendaDeCalculo, motivoFueraDeVentana } from "../rrhh-ui";
import CeldaMarcaPopover from "./CeldaMarcaPopover";
import HistorialMarcaModal from "./HistorialMarcaModal";
import type { ColaboradorMinDTO, EstadoAsistencia } from "@/lib/rrhh/tipos";

const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

interface Props {
  mes: string;
  desde: string;
  hasta: string;
  onCambiarMes: (m: string) => void;
}

export default function HojaDelMes({ mes, desde, hasta, onCambiarMes }: Props) {
  const { hoja, loading, error, pendientes, erroresPorCelda, marcar, guardarAhora, recargar } = useRrhhAsistencia(desde, hasta);
  const [historial, setHistorial] = useState<{ colaborador: ColaboradorMinDTO; fecha: string } | null>(null);

  const dias = useMemo(() => rangoDeDias(desde, hasta), [desde, hasta]);
  const hoy = hoja?.hoy;
  const mesActual = hoy ? mesDe(hoy) : mes;
  const puedeAvanzar = mes < mesActual;

  // Igual que `cambiarDia` en HojaDelDia: vaciar el buffer ANTES de irse del
  // mes — si no, un flush en vuelo (o el que dispara el debounce) termina
  // aplicándose sobre el mes nuevo, o falla sin que nadie lo vea (ALTO 5).
  const cambiarMes = async (delta: number) => {
    const resultado = await guardarAhora();
    if (!resultado.ok) avisarFallos(resultado.fallos);
    const [y, m] = mes.split("-").map(Number);
    const base = new Date(Date.UTC(y, m - 1 + delta, 1));
    onCambiarMes(`${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  if (loading) return <LoadingState message="Cargando la hoja del mes..." />;
  if (error || !hoja) {
    return (
      <div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        {error ?? "No se pudo cargar la hoja"}
        <button type="button" onClick={recargar} className="ml-2 font-bold underline">Reintentar</button>
      </div>
    );
  }

  if (hoja.colaboradores.length === 0) {
    return <EmptyState icon={Users} title="Sin personal este mes" description="Agrega personas desde la Hoja del día o desde Personal." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => cambiarMes(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]" aria-label="Mes anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold capitalize text-[var(--text-primary)]">{NOMBRES_MES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}</p>
        <button
          type="button"
          onClick={() => cambiarMes(1)}
          disabled={!puedeAvanzar}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <DataTable zebra stickyHeader wrapperClassName="max-h-[70vh]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-[var(--surface-sunken)]">Persona</th>
            {dias.map((d) => (
              <th key={d} className="text-center" title={d}>{d.slice(8, 10)}</th>
            ))}
            <th className="text-center">Totales</th>
          </tr>
        </thead>
        <tbody>
          {hoja.colaboradores.map((c) => {
            const marcasDeLaPersona = hoja.marcas.filter((m) => m.colaboradorId === c.id);
            const conteo: Record<EstadoAsistencia, number> = { PRESENTE: 0, TARDANZA: 0, MEDIO_DIA: 0, FALTA: 0, PERMISO: 0, DESCANSO: 0, VACACIONES: 0 };
            let sinMarcar = 0;
            for (const d of dias) {
              if (hoy && d > hoy) continue; // el futuro no cuenta como "sin marcar"
              if (!estaIncluidoEseDia(c, d)) continue;
              const m = marcasDeLaPersona.find((x) => x.fecha === d);
              if (m) conteo[m.estado] += 1;
              else sinMarcar += 1;
            }
            return (
              <tr key={c.id}>
                <td className="sticky left-0 z-10 bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)]">
                  {c.nombre}
                  {c.puesto && <span className="block text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">{c.puesto.nombre}</span>}
                </td>
                {dias.map((d) => {
                  const incluido = estaIncluidoEseDia(c, d) && (!hoy || d <= hoy);
                  const marca = marcasDeLaPersona.find((m) => m.fecha === d);
                  const editable = dentroDeVentana(d, hoja.ventana);
                  return (
                    <td key={d} className="p-1 text-center">
                      <CeldaMarcaPopover
                        colaborador={c}
                        fecha={d}
                        marca={marca}
                        incluido={incluido}
                        editable={editable}
                        motivoNoEditable={editable ? undefined : motivoFueraDeVentana(hoja.ventana)}
                        pendiente={pendientes.has(`${c.id}|${d}`)}
                        errorMsg={erroresPorCelda.get(`${c.id}|${d}`)}
                        onMarcar={(estado) => marcar({ colaboradorId: c.id, fecha: d, estado })}
                        onVerHistorial={() => setHistorial({ colaborador: c, fecha: d })}
                      />
                    </td>
                  );
                })}
                <td className="whitespace-nowrap text-center text-xs">
                  {ORDEN_ESTADOS_ASISTENCIA.filter((e) => conteo[e] > 0).map((e) => (
                    <span key={e} className={`mr-1.5 font-bold ${ESTADO_ASISTENCIA_META[e].claseTexto}`}>{ESTADO_ASISTENCIA_META[e].letra}{conteo[e]}</span>
                  ))}
                  {sinMarcar > 0 && <span className="font-bold text-[var(--text-tertiary)]">{sinMarcar} s/m</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>

      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{leyendaDeCalculo()} · s/m Sin marcar</p>

      {historial && (
        <HistorialMarcaModal open onClose={() => setHistorial(null)} colaborador={historial.colaborador} fecha={historial.fecha} />
      )}
    </div>
  );
}
