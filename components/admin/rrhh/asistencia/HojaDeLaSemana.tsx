"use client";

/**
 * HojaDeLaSemana — personas × lunes a domingo, con lo ganado del día y de la
 * semana (ADR-416, pedido de Brandon 2026-09-14).
 *
 * Las marcas salen de `use-rrhh-asistencia`: es la misma hoja que el día y el
 * mes, y se edita igual. Lo ganado sale de `/api/rrhh/ganado`, o sea de
 * `calcularGanado` en el servidor (nunca una cuenta aparte), y sólo lo ve el
 * nivel completo. Bajo 640 px va el calendario por persona del mes, con 7 días.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, Users } from "@buleje/design-system/icons";
import { DataTable, EmptyState, LoadingState, StatCard } from "@buleje/design-system";
import { useSettingsSafe } from "@/contexts/settings-context";
import { avisarFallos, useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import { useRrhhGanado } from "@/hooks/use-rrhh-ganado";
import { sinDato } from "@/lib/errores/sin-dato";
import { etiquetaDia, rangoDeDias, semanaDe, sumarDias } from "@/lib/rrhh/fechas";
import { cn, limaDateKey } from "@/lib/utils";
import { AvisoRrhh, BOTON } from "../rrhh-form";
import { COPY_REFERENCIA, dentroDeVentana, estaIncluidoEseDia, etiquetaModalidad, formatearPEN, motivoFueraDeVentana } from "../rrhh-ui";
import CeldaMarcaPopover from "./CeldaMarcaPopover";
import HistorialMarcaModal from "./HistorialMarcaModal";
import LeyendaEstados from "./LeyendaEstados";
import MesPorPersona from "./MesPorPersona";
import NavegadorPeriodo from "./NavegadorPeriodo";
import { conteoDelMes, diasTrabajados } from "./conteo-mes";
import { etiquetaSemana, formatearDias, nombreCortoDelDia } from "./semana";
import { descargarPdfDeLaSemana, type FilaSemana } from "./semana-pdf";
import type { ColaboradorMinDTO, GanadoPersona, NivelRrhh } from "@/lib/rrhh/tipos";

interface Props {
  /** Lunes de la semana que se mira. */
  desde: string;
  onCambiarSemana: (lunes: string) => void;
  nivel: NivelRrhh;
  /** El switch Día/Semana/Mes, que va en la misma barra que el navegador. */
  selectorModo?: ReactNode;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export default function HojaDeLaSemana({ desde, onCambiarSemana, nivel, selectorModo }: Props) {
  const hasta = sumarDias(desde, 6);
  const conPlata = nivel === "completo";
  const { hoja, loading, error, pendientes, erroresPorCelda, marcar, guardarAhora, recargar } = useRrhhAsistencia(desde, hasta);
  const { ganado, error: errorGanado, recargar: recargarGanado } = useRrhhGanado(desde, hasta, undefined, conPlata);
  const settings = useSettingsSafe();
  const [historial, setHistorial] = useState<{ colaborador: ColaboradorMinDTO; fecha: string } | null>(null);
  const [descargando, setDescargando] = useState(false);

  const dias = useMemo(() => rangoDeDias(desde, hasta), [desde, hasta]);
  const hoy = hoja?.hoy ?? limaDateKey();
  const semanaActual = semanaDe(hoy).desde;

  // Lo ganado se vuelve a pedir cuando una marca ya quedó guardada (sin
  // pendientes): con el toque optimista todavía no cambió nada en el servidor.
  const firmaMarcas = useMemo(() => (hoja?.marcas ?? []).map((m) => `${m.id}:${m.estado}`).sort().join("|"), [hoja]);
  const firmaAnterior = useRef<{ desde: string; firma: string } | null>(null);
  useEffect(() => {
    if (!conPlata || !hoja || pendientes.size > 0) return;
    const previa = firmaAnterior.current;
    if (previa && previa.desde === hoja.desde && previa.firma !== firmaMarcas) recargarGanado();
    firmaAnterior.current = { desde: hoja.desde, firma: firmaMarcas };
  }, [conPlata, hoja, pendientes.size, firmaMarcas, recargarGanado]);

  const ganadoPorId = useMemo(() => {
    // Lo ganado de la semana anterior, todavía en pantalla, no se mezcla con la nueva.
    if (!ganado || ganado.desde !== desde) return null;
    return new Map<string, GanadoPersona>(ganado.personas.map((p) => [p.colaboradorId, p]));
  }, [ganado, desde]);

  const filas = useMemo<FilaSemana[]>(() => {
    if (!hoja) return [];
    return hoja.colaboradores.map((c) => {
      const marcasDeLaPersona = hoja.marcas.filter((m) => m.colaboradorId === c.id);
      const { conteo, sinMarcar } = conteoDelMes(c, marcasDeLaPersona, dias, hoy);
      return { c, marcasDeLaPersona, conteo, sinMarcar, trabajados: diasTrabajados(conteo), plata: ganadoPorId?.get(c.id) ?? null };
    });
  }, [hoja, dias, hoy, ganadoPorId]);

  const totales = useMemo(
    () => ({
      trabajados: filas.reduce((a, f) => a + f.trabajados, 0),
      faltas: filas.reduce((a, f) => a + f.conteo.FALTA, 0),
      ganado: ganadoPorId ? r2(filas.reduce((a, f) => a + (f.plata?.total ?? 0), 0)) : null,
    }),
    [filas, ganadoPorId],
  );

  // Igual que el día y el mes: vaciar el buffer ANTES de irse de la semana.
  const irASemana = async (lunes: string) => {
    if (lunes === desde || lunes > semanaActual) return;
    const resultado = await guardarAhora();
    if (!resultado.ok) avisarFallos(resultado.fallos);
    onCambiarSemana(lunes);
  };

  const descargar = async () => {
    setDescargando(true);
    try {
      await descargarPdfDeLaSemana({ filas, dias, lunes: desde, hoy, nivel, negocio: settings?.businessName ?? null, total: totales.ganado });
    } catch (err) {
      sinDato("RRHH PDF de la semana")(err);
      toast.error("No se pudo armar el PDF. Reintenta.");
    } finally {
      setDescargando(false);
    }
  };

  let contenido: ReactNode;
  if (loading) {
    contenido = <LoadingState message="Cargando la hoja de la semana..." />;
  } else if (error || !hoja) {
    contenido = (
      <AvisoRrhh tono="error" accion={<button type="button" onClick={recargar} className={BOTON.chico}>Reintentar</button>}>
        {error ?? "No se pudo cargar la hoja."}
      </AvisoRrhh>
    );
  } else if (filas.length === 0) {
    contenido = <EmptyState icon={Users} title="Sin personal esta semana" description="Agrega personas desde la hoja del día o desde Personal." />;
  } else {
    contenido = (
      <>
        <div className={cn("grid grid-cols-2 gap-3", conPlata ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          <StatCard label="Personas" value={filas.length} density="compact" />
          <StatCard label="Días trabajados" value={formatearDias(totales.trabajados)} density="compact" />
          <StatCard label="Faltas" value={totales.faltas} density="compact" />
          {conPlata && <StatCard label="Ganado de la semana" value={totales.ganado != null ? formatearPEN(totales.ganado) : "—"} density="compact" />}
        </div>

        {conPlata && errorGanado && <AvisoRrhh tono="error">{errorGanado}: la hoja se ve igual, sin los montos.</AvisoRrhh>}

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
                    const editable = dentroDeVentana(d, hoja.ventana);
                    const importe = plata?.dias.find((x) => x.fecha === d)?.importe ?? null;
                    return (
                      <td key={d} className={cn("p-1 text-center", d === hoy && "bg-primary/5")}>
                        <div className="flex flex-col items-center gap-1">
                          <CeldaMarcaPopover
                            colaborador={c}
                            fecha={d}
                            marca={marcasDeLaPersona.find((m) => m.fecha === d)}
                            incluido={estaIncluidoEseDia(c, d) && d <= hoy}
                            editable={editable}
                            motivoNoEditable={editable ? undefined : motivoFueraDeVentana(hoja.ventana)}
                            pendiente={pendientes.has(`${c.id}|${d}`)}
                            errorMsg={erroresPorCelda.get(`${c.id}|${d}`)}
                            onMarcar={(estado) => marcar({ colaboradorId: c.id, fecha: d, estado })}
                            onVerHistorial={() => setHistorial({ colaborador: c, fecha: d })}
                          />
                          {conPlata && (
                            <span className={cn("text-xs tabular-nums", importe ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]")}>
                              {importe == null ? "·" : importe.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

        <div className="space-y-3 sm:hidden">
          <MesPorPersona
            colaboradores={hoja.colaboradores}
            marcas={hoja.marcas}
            dias={dias}
            hoy={hoy}
            ventana={hoja.ventana}
            pendientes={pendientes}
            erroresPorCelda={erroresPorCelda}
            onMarcar={(colaboradorId, fecha, estado) => marcar({ colaboradorId, fecha, estado })}
            onVerHistorial={(colaborador, fecha) => setHistorial({ colaborador, fecha })}
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

        <LeyendaEstados />
        {conPlata && <p className="text-xs text-[var(--text-tertiary)]">{COPY_REFERENCIA}</p>}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {selectorModo}
        <div className="flex flex-wrap items-center gap-2">
          <NavegadorPeriodo
            etiqueta={etiquetaSemana(desde)}
            esActual={desde === semanaActual}
            textoActual="Esta semana"
            textoVolver="Ir a esta semana"
            puedeAvanzar={desde < semanaActual}
            etiquetaAnterior="Semana anterior"
            etiquetaSiguiente="Semana siguiente"
            onAnterior={() => irASemana(sumarDias(desde, -7))}
            onSiguiente={() => irASemana(sumarDias(desde, 7))}
            onVolver={() => irASemana(semanaActual)}
            selector={{ tipo: "date", valor: desde, max: hoy, onElegir: (f) => irASemana(semanaDe(f).desde) }}
          />
          <button type="button" onClick={descargar} disabled={!hoja || filas.length === 0 || descargando} className={cn(BOTON.secundario, "gap-2")}>
            <Download className="h-4 w-4" />
            {descargando ? "Armando el PDF…" : "Descargar PDF"}
          </button>
        </div>
      </div>

      {contenido}

      {historial && <HistorialMarcaModal open onClose={() => setHistorial(null)} colaborador={historial.colaborador} fecha={historial.fecha} />}
    </div>
  );
}
