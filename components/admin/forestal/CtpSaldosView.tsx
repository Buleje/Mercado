"use client";

/**
 * CtpSaldosView — balance de planta del Libro CTP (ADR-127): lo que se declara
 * ante SERFOR y lo que puede salir de la planta.
 *
 * Orquesta; no dibuja ni pide (916 → ~200 líneas, ADR-431): las lecturas viven
 * en `hooks/`, cada bloque en `saldos/`. Un solo «Recargar» refresca TODO:
 * saldos, patio, lotes, corridas, pendientes y antigüedad.
 */

import { useCallback, useMemo, useState } from "react";
import { useContratoActivo } from "@/contexts/contrato-activo-context";
import { useCtpSaldos } from "@/hooks/use-ctp-saldos";
import { useParamsDeSaldos } from "@/hooks/use-params-de-saldos";
import { antiguedadPorGuia } from "@/lib/forestal/antiguedad-por-guia";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { ctpPeriodShortLabel, type CtpPeriod } from "@/lib/forestal/ctp-period";
import type { DestinoExcepcion, Excepcion } from "@/lib/forestal/ctp-saldos-excepciones";
import { resumenPorPermiso } from "@/lib/forestal/patio-resumen";
import { PanelSkeleton } from "./ctp-shared";
import { useAntiguedadGuias } from "./hooks/use-antiguedad-guias";
import { useCapacidadDeSaldos } from "./hooks/use-capacidad-de-saldos";
import { useExcepcionesDeSaldos } from "./hooks/use-excepciones-de-saldos";
import { useFuentesDeCapacidad } from "./hooks/use-fuentes-de-capacidad";
import { useReportesDeSaldos } from "./hooks/use-reportes-de-saldos";
import ExcepcionesSaldo from "./saldos/ExcepcionesSaldo";
import SaldosCabecera from "./saldos/SaldosCabecera";
import SaldosModales, { useModalesDeSaldos } from "./saldos/SaldosModales";
import SeccionCapacidad from "./saldos/SeccionCapacidad";
import SeccionEstado from "./saldos/SeccionEstado";
import SeccionesSaldos, {
  FiltroEspecieKpis,
  SECCION_IDS,
  type Seccion,
} from "./saldos/SeccionesSaldos";
import SeccionLibro from "./saldos/SeccionLibro";
import SeccionMovimiento from "./saldos/SeccionMovimiento";

export function CtpSaldosView({
  period,
  onDespachar,
  onIr,
}: {
  period: CtpPeriod;
  /** Atajo "del stock a la guía": lleva a Despacho con producto y especie ya elegidos. */
  onDespachar?: (producto: string, especie: string | null) => void;
  /** Lleva a la pestaña del libro donde se corrige cada excepción. */
  onIr?: (vista: DestinoExcepcion, filtro?: Excepcion["filtro"]) => void;
}) {
  const { activo, contratoFiltro } = useContratoActivo();
  const codigoContrato = contratoFiltro ? (activo?.codigo ?? null) : null;
  const { seccion, setSeccion, filtros, setFiltros, especieKpi, setEspecieKpi } =
    useParamsDeSaldos<Seccion>(SECCION_IDS, "estado");
  const { data, concil, curva, loading, error, recargar } = useCtpSaldos(
    period,
    especieKpi || undefined,
  );
  const fuentes = useFuentesDeCapacidad({ period, contratoFiltro, codigoContrato });
  const aging = useAntiguedadGuias();
  const capacidad = useCapacidadDeSaldos({
    fuentes,
    productos: data?.productos,
    period,
    filtros,
    setFiltros,
  });
  const modales = useModalesDeSaldos();
  const [lotesElegidos, setLotesElegidos] = useState<Set<string>>(new Set());

  const porPermiso = useMemo(() => resumenPorPermiso(fuentes.patio, new Date()), [fuentes.patio]);
  const antiguedad = useMemo(
    () => antiguedadPorGuia(aging.guias, new Date(), especieKpi),
    [aging.guias, especieKpi],
  );
  const { lotesTodos, origen, balance } = capacidad;
  const reportes = useReportesDeSaldos({
    data,
    concil,
    period,
    lotesTodos,
    lotesElegidos,
    balance,
    origen,
    filtros,
    patio: fuentes.patio,
    porPermiso,
    alcance: codigoContrato,
    patioTruncado: fuentes.patioTruncado,
  });

  const { recargar: recargarFuentes } = fuentes,
    { recargar: recargarAging } = aging;
  const recargarTodo = useCallback(() => {
    for (const f of ["saldos=1", "conciliacion=1", "curva=1"]) invalidarCtp(f);
    void recargar();
    recargarFuentes();
    recargarAging();
  }, [recargar, recargarFuentes, recargarAging]);

  const excepciones = useExcepcionesDeSaldos({
    data,
    curva,
    concil,
    origen,
    lotes: lotesTodos,
    estadoAntiguedad: aging.estado,
    antiguedad,
  });

  return (
    <div className="space-y-4" data-vista="ctp-saldos">
      <SaldosCabecera
        periodo={ctpPeriodShortLabel(period)}
        hayDatos={Boolean(data)}
        fuentesCargando={capacidad.fuentesCargando}
        recargando={loading || capacidad.fuentesCargando || aging.estado === "cargando"}
        onRecargar={recargarTodo}
        onPdf={() => void reportes.descargarPdf()}
        onExcel={() => void reportes.descargarExcel()}
        onCsv={reportes.descargarCsv}
        errorReporte={reportes.error}
        errorCarga={error}
        alcance={codigoContrato}
      />

      {data && (
        <>
          <ExcepcionesSaldo excepciones={excepciones} onIr={onIr} onSeccion={setSeccion} />

          <SeccionesSaldos seccion={seccion} onSeccion={setSeccion} cargando={loading}>
            {seccion !== "capacidad" && (
              <FiltroEspecieKpis
                especie={especieKpi}
                opciones={data.especiesDelPeriodo ?? data.porEspecie.map((e) => e.especie)}
                onCambiar={setEspecieKpi}
              />
            )}
            {seccion === "estado" && (
              <SeccionEstado
                data={data}
                period={period}
                curva={curva}
                onVerMovimiento={() => setSeccion("movimiento")}
                onKardex={modales.setKardexEspecie}
                porPermiso={porPermiso}
                estadoPatio={fuentes.estado.patio}
                permisosActivos={filtros.permiso ?? []}
                onElegirPermiso={(p) => {
                  capacidad.aplicarFiltros({ ...filtros, permiso: [p] }, "permiso");
                  setSeccion("capacidad");
                }}
                antiguedad={{ resumen: antiguedad, estado: aging.estado, error: aging.error }}
                especieKpi={especieKpi}
                onIr={onIr}
              />
            )}
            {seccion === "capacidad" && (
              <SeccionCapacidad
                capacidad={capacidad}
                filtros={filtros}
                hayLotes={fuentes.lotes.length > 0}
                lotesMezclados={fuentes.lotesMezclados}
                lotesElegidos={lotesElegidos}
                onLotesElegidos={setLotesElegidos}
                modales={modales}
              />
            )}
            {seccion === "movimiento" && (
              <SeccionMovimiento
                data={data}
                curva={curva}
                period={period}
                concil={concil}
                aperturaPendiente={loading}
              />
            )}
            {seccion === "libro" && (
              <SeccionLibro
                data={data}
                concil={concil}
                onKardex={modales.setKardexEspecie}
                onDespachar={onDespachar}
              />
            )}
          </SeccionesSaldos>
        </>
      )}
      {loading && !data && <PanelSkeleton kpis={4} />}

      <SaldosModales
        m={modales}
        entrada={capacidad.entrada}
        filtros={filtros}
        period={period}
        onCorridasCambiaron={fuentes.recargarCorridas}
      />
    </div>
  );
}
