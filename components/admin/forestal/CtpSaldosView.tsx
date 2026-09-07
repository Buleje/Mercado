"use client";

/**
 * CtpSaldosView — balance de planta del Libro CTP (ADR-127): materia prima
 * (m³) y stock de productos transformados. Hermana de CtpEntriesView
 * (Producción/Despacho), que vive en su propio archivo.
 *
 * Orquesta; no dibuja. Cada bloque vive en `saldos/` y se lee de arriba abajo
 * como se pregunta: qué está mal (excepciones) → cuánto hay (KPIs) → de qué
 * (disponible por tipo) → hacia dónde va (curva) → cómo se llegó (cascada y
 * composición) → el detalle que se firma (conciliación, stock, antigüedad).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertCircle, FileDown, FileSpreadsheet } from "@buleje/design-system/icons";
import { Btn, PanelSkeleton, VistaHeader } from "./ctp-shared";
import DisponiblePorTipo from "./saldos/DisponiblePorTipo";
import ExcepcionesSaldo from "./saldos/ExcepcionesSaldo";
import KpisDeExistencias from "./saldos/KpisDeExistencias";
import CurvaDeSaldo from "./saldos/CurvaDeSaldo";
import TablaConciliacion from "./saldos/TablaConciliacion";
import TablaProductos from "./saldos/TablaProductos";
import CtpSaldosGraficos from "./CtpSaldosGraficos";
import { printExistencias } from "@/lib/forestal/ctp-existencias-print";
import { nombreArchivoSaldos, saldosACsv } from "@/lib/forestal/ctp-saldos-csv";
import { excepcionesDeSaldo, type Excepcion } from "@/lib/forestal/ctp-saldos-excepciones";
import { ctpPeriodShortLabel, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { useCtpSaldos } from "@/hooks/use-ctp-saldos";
import CtpKardexModal from "./CtpKardexModal";
import CtpPatioAging from "./CtpPatioAging";
import LotesConSaldo, { diasParaVencer } from "./saldos/LotesConSaldo";
import { logger } from "@/lib/logger";
import { consumidoDelLote, diasDeEspera, loteVencido, permisosDelLote, piezasLibres, producidoDelLote, volumenLibre, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";

const AVISO = {
  error: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]",
  warning:
    "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]",
} as const;

export function CtpSaldosView({
  period,
  onDespachar,
  onIr,
}: {
  period: CtpPeriod;
  /** Atajo "del stock a la guía": lleva a Despacho con producto y especie ya elegidos. */
  onDespachar?: (producto: string, especie: string | null) => void;
  /**
   * Lleva a la pestaña donde se corrige cada excepción. Incluye `rentabilidad`
   * —que no es una excepción de saldo— porque ahí vive «Valorizar ingresos»,
   * la pantalla que tapa el hueco de costos que denuncia Antigüedad.
   */
  onIr?: (vista: NonNullable<Excepcion["ir"]> | "rentabilidad") => void;
}) {
  const { data, concil, curva, loading, error, recargar } = useCtpSaldos(period);
  const [reportError, setReportError] = useState<string | null>(null);
  const [kardexEspecie, setKardexEspecie] = useState<string | null>(null);

  /* Los lotes con su saldo. Van por su propio pedido y no por `useCtpSaldos`
     porque no dependen del período: un lote abierto en julio sigue con madera
     apartada hoy, y filtrarlo por el trimestre lo escondería justo cuando más
     hay que cerrarlo. Secundario: si falla, Saldos se muestra igual. */
  const [lotes, setLotes] = useState<LoteAserrio[]>([]);
  /* Qué lotes entran al reporte. Vacío = TODOS, que es lo que esperaba quien
     descargaba antes de que existiera la selección: tildar nada no puede
     significar «un reporte sin lotes». */
  const [lotesElegidos, setLotesElegidos] = useState<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/lotes-aserrio", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo && Array.isArray(j?.lotes)) setLotes(j.lotes as LoteAserrio[]); })
      .catch((err) => logger.warn("[ctp-saldos] lotes no cargaron", { error: String(err) }));
    return () => { vivo = false; };
  }, []);

  /* Los lotes en la forma que piden los dos reportes. Se arma UNA vez y la usan
     el PDF y el CSV: dos versiones de la misma tabla divergen a la primera
     columna nueva, que es exactamente lo que ya pasó con las guías. */
  const lotesDelReporte = useMemo(() => {
    const ahora = new Date();
    const elegidos = lotesElegidos.size > 0 ? lotes.filter((l) => lotesElegidos.has(l.id)) : lotes;
    return elegidos.map((l) => ({
      code: l.code,
      permisos: permisosDelLote(l),
      especie: l.speciesCommon,
      status: l.status,
      consumidoM3: consumidoDelLote(l),
      esperado56M3: Math.round(consumidoDelLote(l) * RENDIMIENTO_META * 10000) / 10000,
      producidoM3: producidoDelLote(l),
      /* La MISMA resta que muestra la tabla: al 56 % − producido. Si el reporte
         dijera otra cosa que la pantalla, el que firma no sabría a cuál creerle. */
      restaM3: (() => {
        const p = producidoDelLote(l);
        return p == null ? null : Math.round((consumidoDelLote(l) * RENDIMIENTO_META - p) * 10000) / 10000;
      })(),
      apartadoM3: volumenLibre(l),
      piezas: piezasLibres(l).length,
      diasParado: diasDeEspera(l, ahora),
      finProceso: l.finProceso ? String(l.finProceso).slice(0, 10) : null,
      diasParaVencer: diasParaVencer(l.finProceso, ahora),
      vencido: loteVencido(l, ahora),
    }));
  }, [lotes, lotesElegidos]);

  // Reporte de existencias imprimible (PDF) para fiscalización: misma data del
  // panel + identidad del CTP (best-effort desde la Ficha).
  const handleReport = useCallback(async () => {
    if (!data) return;
    setReportError(null);
    const ficha = await fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body?.ficha ?? null)
      .catch((err) => {
        console.warn("[ctp-existencias] ficha fetch failed", err);
        return null;
      });
    try {
      printExistencias({
        periodLabel: period.label,
        materiaPrima: data.materiaPrima,
        porEspecie: data.porEspecie,
        productos: data.productos,
        concil,
        ficha,
        lotes: lotesDelReporte,
      });
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    }
  }, [data, concil, period.label, lotesDelReporte]);

  /** Lo mismo que se ve, para cruzar en Excel contra la planilla del contador. */
  /**
   * El mismo reporte, en Excel.
   *
   * `exportToExcel` ya existía y lo usan cuatro módulos del panel; acá sólo se
   * arma la grilla. Va en TRES hojas —materia prima, productos y lotes— porque
   * apilar tres tablas distintas en una sola hoja obliga a borrar filas antes
   * de poder ordenar o filtrar, que es lo que se hace con un Excel.
   *
   * Las cantidades van como NÚMERO, no como texto: un m³ que llega como cadena
   * no se suma en la planilla, y la razón de exportar a Excel es sumar.
   */
  const descargarExcel = useCallback(async () => {
    if (!data) return;
    setReportError(null);
    try {
      const { exportToExcel } = await import("@/lib/export-excel");
      const nombre = nombreArchivoSaldos(period.label).replace(/\.csv$/, "");
      await exportToExcel(
        data.porEspecie.map((e) => ({
          Especie: e.especie,
          "Nombre científico": e.scientific ?? "",
          CITES: e.cites ? "Sí" : "No",
          "Ingresado (m³)": e.ingresoM3,
          "Sin validar (m³)": e.pendienteM3,
          "Consumido (m³)": e.consumidoM3,
          "Saldo (m³)": e.saldoM3,
        })),
        `${nombre}-materia-prima`,
        "Materia prima",
      );
      if (lotesDelReporte.length > 0) {
        await exportToExcel(
          lotesDelReporte.map((l) => ({
            Lote: l.code,
            "N° de permiso": l.permisos.join(" + "),
            Especie: l.especie,
            Estado: l.status,
            "Consumido (m³)": l.consumidoM3,
            "Al 56 % (m³)": l.esperado56M3,
            "Producido (m³)": l.producidoM3 ?? "",
            "Resta al 56 % (m³)": l.restaM3 ?? "",
            "Apartado sin aserrar (m³)": l.apartadoM3,
            "Piezas libres": l.piezas,
            "Días parado": l.diasParado ?? "",
            "Fin de proceso": l.finProceso ?? "",
            "Días para vencer": l.diasParaVencer ?? "",
            Plazo: l.vencido
              ? `${Math.abs(l.diasParaVencer ?? 0)} días vencido`
              : l.diasParaVencer == null
                ? "sin fecha"
                : l.diasParaVencer === 0
                  ? "vence hoy"
                  : `quedan ${l.diasParaVencer} días`,
          })),
          `${nombre}-lotes`,
          "Lotes de aserrío",
        );
      }
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    }
  }, [data, period.label, lotesDelReporte]);

  const descargarCsv = useCallback(() => {
    if (!data) return;
    const csv = saldosACsv(data.porEspecie, data.productos, period.label, lotesDelReporte);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoSaldos(period.label);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [data, period.label, lotesDelReporte]);

  const mp = data?.materiaPrima;


  const excepciones = useMemo(
    () =>
      data
        ? excepcionesDeSaldo({
            materiaPrima: data.materiaPrima,
            porEspecie: data.porEspecie,
            productos: data.productos,
            valleDelPeriodo: curva?.valle ?? null,
            /* La existencia FINAL manda sobre el movimiento del período: una
               planta con stock heredado puede consumir más de lo que recibió
               sin que el libro tenga nada malo. Va sólo si la conciliación
               llegó; si no, el aviso se queda con lo que se sabe. */
            existenciaFinal: concil?.materiaPrima.map((m) => ({ especie: m.especie, final: m.final })),
          })
        : [],
    [data, curva, concil],
  );

  // Existencia heredada del cierre anterior. Es la que hace que la cascada
  // arranque donde terminó el mes pasado en vez de en cero; sin conciliación
  // no se conoce, y `null` es distinto de 0 (ver `pasosDeBalance`).
  const apertura = useMemo(
    () => (concil ? concil.materiaPrima.reduce((a, s) => a + s.apertura, 0) : null),
    [concil],
  );

  return (
    <div className="space-y-3">
      <VistaHeader
        titulo="Existencias del Libro (LO-CTP)"
        meta={ctpPeriodShortLabel(period)}
        hint="Materia prima que entra vs. producto que sale. Es el saldo que se declara ante SERFOR — va en la hoja «Existencias» del export oficial."
      >
        <Btn variant="dark" size="md" onClick={() => void handleReport()} disabled={!data}>
          <FileDown className="h-4 w-4" /> Descargar reporte
        </Btn>
        <Btn variant="secondary" size="md" onClick={descargarCsv} disabled={!data}>
          <FileSpreadsheet className="h-4 w-4" /> CSV
        </Btn>
        <Btn variant="secondary" size="md" onClick={() => void descargarExcel()} disabled={!data}>
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </Btn>
        <Btn variant="secondary" size="md" onClick={() => void recargar()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar
        </Btn>
      </VistaHeader>

      {reportError && (
        <div className={`flex items-start gap-3 rounded-xl border-2 p-4 text-sm ${AVISO.warning}`}>
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>No se pudo abrir el reporte:</strong> {reportError}
          </div>
        </div>
      )}

      {error && (
        <div className={`flex items-start gap-3 rounded-xl border-2 p-4 text-sm ${AVISO.error}`}>
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {data && mp && (
        <>
          {/* Todo lo que está mal, junto y con nombre propio. Va primero: es lo
              único de esta pantalla que obliga a hacer algo hoy. */}
          <ExcepcionesSaldo excepciones={excepciones} onIr={onIr} />

          <KpisDeExistencias
            materiaPrima={mp}
            porEspecie={data.porEspecie}
            productos={data.productos}
            period={period}
            /* La trayectoria del saldo al lado del número. Sale de la curva, que
               es un pedido aparte: si no llegó, el héroe se dibuja sin rastro. */
            serieSaldo={curva?.puntos.map((p) => Number(p.saldo))}
          />

          {/* Lo primero que se pregunta quien abre esta pantalla: cuánta
              madera tengo y de qué. Va arriba de los derivados porque el saldo
              se mira antes que la rotación. */}
          <DisponiblePorTipo
            especies={data.porEspecie}
            productos={data.productos}
            onKardex={setKardexEspecie}
          />

          {/* ¿Sube o baja? La foto de arriba no lo dice, y es con lo que se
              decide comprar madera. */}
          {curva && <CurvaDeSaldo curva={curva} periodoLabel={ctpPeriodShortLabel(period)} />}

          {/* Cómo se llegó al saldo, de qué especie está hecho y en qué estado
              está el volumen de cada una. */}
          <CtpSaldosGraficos
            materiaPrima={mp}
            porEspecie={data.porEspecie}
            apertura={apertura}
            aperturaPendiente={loading}
          />

          {/* Conciliación: apertura (del cierre anterior) + movimientos = final (ADR-139 rollforward). */}
          {concil && <TablaConciliacion concil={concil} onKardex={setKardexEspecie} />}

          <TablaProductos productos={data.productos} onDespachar={onDespachar} />

          {/* Gemelo del patio: materia prima parada por antigüedad (self-fetch). */}
          <LotesConSaldo lotes={lotes} seleccion={lotesElegidos} onSeleccion={setLotesElegidos} />

          <CtpPatioAging onValorizar={onIr ? () => onIr("rentabilidad") : undefined} />
        </>
      )}
      {loading && !data && <PanelSkeleton kpis={4} />}

      {kardexEspecie && (
        <CtpKardexModal especie={kardexEspecie} period={period} onClose={() => setKardexEspecie(null)} />
      )}
    </div>
  );
}
