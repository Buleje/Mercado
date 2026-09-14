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

import { useMemo, useState, type ReactNode } from "react";
import { Users } from "@buleje/design-system/icons";
import { LoadingState, EmptyState, DataTable } from "@buleje/design-system";
import { avisarFallos, useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import { dateDeFechaKey, etiquetaDia, mesDe, rangoDeDias } from "@/lib/rrhh/fechas";
import { cn, limaDateKey } from "@/lib/utils";
import { AvisoRrhh, BOTON } from "../rrhh-form";
import { dentroDeVentana, ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA, estaIncluidoEseDia, motivoFueraDeVentana } from "../rrhh-ui";
import CeldaMarcaPopover from "./CeldaMarcaPopover";
import HistorialMarcaModal from "./HistorialMarcaModal";
import LeyendaEstados from "./LeyendaEstados";
import NavegadorPeriodo from "./NavegadorPeriodo";
import type { ColaboradorMinDTO, EstadoAsistencia } from "@/lib/rrhh/tipos";

const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
/** Por `getUTCDay()`: 0 = domingo. */
const LETRA_DIA = ["D", "L", "M", "M", "J", "V", "S"];

interface Props {
  mes: string;
  desde: string;
  hasta: string;
  onCambiarMes: (m: string) => void;
  /** El switch Día/Mes, que va en la misma barra que el navegador. */
  selectorModo?: ReactNode;
}

function sumarMeses(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function HojaDelMes({ mes, desde, hasta, onCambiarMes, selectorModo }: Props) {
  const { hoja, loading, error, pendientes, erroresPorCelda, marcar, guardarAhora, recargar } = useRrhhAsistencia(desde, hasta);
  const [historial, setHistorial] = useState<{ colaborador: ColaboradorMinDTO; fecha: string } | null>(null);

  const dias = useMemo(() => rangoDeDias(desde, hasta), [desde, hasta]);
  const hoy = hoja?.hoy ?? limaDateKey();
  const mesActual = mesDe(hoy);
  const puedeAvanzar = mes < mesActual;

  // Igual que en HojaDelDia: vaciar el buffer ANTES de irse del mes — si no,
  // un flush en vuelo termina aplicándose sobre el mes nuevo, o falla sin que
  // nadie lo vea (ALTO 5).
  const irAMes = async (destino: string) => {
    if (destino === mes || destino > mesActual) return;
    const resultado = await guardarAhora();
    if (!resultado.ok) avisarFallos(resultado.fallos);
    onCambiarMes(destino);
  };

  let contenido: ReactNode;
  if (loading) {
    contenido = <LoadingState message="Cargando la hoja del mes..." />;
  } else if (error || !hoja) {
    contenido = (
      <AvisoRrhh tono="error" accion={<button type="button" onClick={recargar} className={BOTON.chico}>Reintentar</button>}>
        {error ?? "No se pudo cargar la hoja."}
      </AvisoRrhh>
    );
  } else if (hoja.colaboradores.length === 0) {
    contenido = <EmptyState icon={Users} title="Sin personal este mes" description="Agrega personas desde la hoja del día o desde Personal." />;
  } else {
    contenido = (
      <>
        <DataTable zebra stickyHeader wrapperClassName="max-h-[70vh] rounded-2xl">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--surface-sunken)]">
                <span className="block w-48">Persona</span>
              </th>
              {dias.map((d) => {
                const esHoy = d === hoy;
                const diaSemana = dateDeFechaKey(d).getUTCDay();
                const finde = diaSemana === 0 || diaSemana === 6;
                return (
                  <th
                    key={d}
                    title={etiquetaDia(d, hoy)}
                    className={cn(
                      "px-1 text-center",
                      esHoy && "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
                      finde && !esHoy && "text-[var(--text-tertiary)]",
                    )}
                  >
                    <span className="block text-xs font-semibold">{LETRA_DIA[diaSemana]}</span>
                    <span className="block tabular-nums">{d.slice(8, 10)}</span>
                  </th>
                );
              })}
              <th className="text-center">Totales</th>
            </tr>
          </thead>
          <tbody>
            {hoja.colaboradores.map((c) => {
              const marcasDeLaPersona = hoja.marcas.filter((m) => m.colaboradorId === c.id);
              const conteo: Record<EstadoAsistencia, number> = { PRESENTE: 0, TARDANZA: 0, MEDIO_DIA: 0, FALTA: 0, PERMISO: 0, DESCANSO: 0, VACACIONES: 0 };
              let sinMarcar = 0;
              for (const d of dias) {
                if (d > hoy) continue; // el futuro no cuenta como "sin marcar"
                if (!estaIncluidoEseDia(c, d)) continue;
                const m = marcasDeLaPersona.find((x) => x.fecha === d);
                if (m) conteo[m.estado] += 1;
                else sinMarcar += 1;
              }
              return (
                <tr key={c.id}>
                  <td className="sticky left-0 z-10 bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)]">
                    <span className="block w-48 truncate" title={c.nombre}>
                      {c.nombre}
                    </span>
                    {c.puesto && <span className="block w-48 truncate text-xs font-normal text-[var(--text-tertiary)]">{c.puesto.nombre}</span>}
                  </td>
                  {dias.map((d) => {
                    const incluido = estaIncluidoEseDia(c, d) && d <= hoy;
                    const editable = dentroDeVentana(d, hoja.ventana);
                    return (
                      <td key={d} className={cn("p-1 text-center", d === hoy && "bg-primary/5")}>
                        <CeldaMarcaPopover
                          colaborador={c}
                          fecha={d}
                          marca={marcasDeLaPersona.find((m) => m.fecha === d)}
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
                    <span className="inline-flex flex-wrap justify-center gap-1">
                      {ORDEN_ESTADOS_ASISTENCIA.filter((e) => conteo[e] > 0).map((e) => (
                        <span key={e} title={ESTADO_ASISTENCIA_META[e].label} className={cn("rounded-md px-1.5 py-0.5 font-bold tabular-nums", ESTADO_ASISTENCIA_META[e].claseChip)}>
                          {ESTADO_ASISTENCIA_META[e].letra} {conteo[e]}
                        </span>
                      ))}
                      {sinMarcar > 0 && (
                        <span className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 font-bold tabular-nums text-[var(--text-secondary)]">{sinMarcar} sin marcar</span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>

        <LeyendaEstados
          extra={
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-grid h-5 min-w-[1.5rem] place-items-center rounded-md bg-[var(--surface-sunken)] px-1 text-xs font-bold text-[var(--text-tertiary)]">
                ·
              </span>
              Sin marcar
            </li>
          }
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {selectorModo}
        <NavegadorPeriodo
          etiqueta={`${NOMBRES_MES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`}
          esActual={mes === mesActual}
          textoActual="Este mes"
          textoVolver="Ir a este mes"
          puedeAvanzar={puedeAvanzar}
          etiquetaAnterior="Mes anterior"
          etiquetaSiguiente="Mes siguiente"
          onAnterior={() => irAMes(sumarMeses(mes, -1))}
          onSiguiente={() => irAMes(sumarMeses(mes, 1))}
          onVolver={() => irAMes(mesActual)}
          selector={{ tipo: "month", valor: mes, max: mesActual, onElegir: irAMes }}
        />
      </div>

      {contenido}

      {historial && <HistorialMarcaModal open onClose={() => setHistorial(null)} colaborador={historial.colaborador} fecha={historial.fecha} />}
    </div>
  );
}
