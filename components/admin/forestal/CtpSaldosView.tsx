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
import BalanceDeCapacidad from "./saldos/BalanceDeCapacidad";
import DetalleDeFuente, { textoDeFiltros } from "./saldos/DetalleDeFuente";
import {
  armarBalance,
  opcionesDeCapacidad,
  type CorridaDisponible,
  type EntradaCapacidad,
  type FuenteDeCapacidad,
} from "@/lib/forestal/capacidad-de-planta";
import { useParamsDeSaldos } from "@/hooks/use-params-de-saldos";
import OrigenIncompleto from "./saldos/OrigenIncompleto";
import DeclararAperturaModal from "./saldos/DeclararAperturaModal";
import CtpNodeDetailLoader, { type DetailTarget } from "./CtpNodeDetailLoader";
import { resumenDeOrigen } from "@/lib/forestal/origen-incompleto";
import type { EstadoFuente } from "@/lib/forestal/capacidad-de-planta";
import { applyCtpPeriodParams } from "@/lib/forestal/ctp-period";
import { logger } from "@/lib/logger";
import {
  consumidoDelLote,
  diasDeEspera,
  loteVencido,
  permisosDelLote,
  pieTablarDe,
  piezasLibres,
  producidoDelLote,
  volumenLibre,
  type LoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

/** Las cuatro preguntas que contesta Saldos, cada una con su pestaña. */
const SECCIONES = [
  { id: "estado" as const, label: "Cómo está hoy" },
  { id: "capacidad" as const, label: "Qué puede salir" },
  { id: "movimiento" as const, label: "Cómo se movió" },
  { id: "libro" as const, label: "Lo que firma el libro" },
];
type Seccion = (typeof SECCIONES)[number]["id"];
const SECCION_IDS = SECCIONES.map((s) => s.id) as readonly Seccion[];

const AVISO = {
  error:
    "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]",
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
  /* El patio, para el balance de capacidad: lo que hay sin aserrar y lo que
     todavía no se recibió. Va por su cuenta como los lotes — no depende del
     período: madera que llegó en julio y sigue en el patio es capacidad de hoy. */
  const [patio, setPatio] = useState<TrozaConsumible[]>([]);
  /* La pestaña y el recorte permiso→especie→guía viven en la URL: el link a
     «la capacidad del permiso X» tiene que abrir eso, no la pestaña default. */
  const {
    seccion,
    setSeccion,
    filtros: filtrosCapacidad,
    setFiltros: setFiltrosCapacidad,
  } = useParamsDeSaldos<Seccion>(SECCION_IDS, "estado");
  /** La fuente cuyo detalle está abierto en el modal. */
  const [detalleFuente, setDetalleFuente] = useState<FuenteDeCapacidad | null>(null);
  /** Las corridas con saldo en el depósito HOY (foto, sin período). `null` = cargando. */
  const [corridas, setCorridas] = useState<CorridaDisponible[] | null>(null);
  /* Cómo llegó cada fetch. Un `[]` que en realidad es «todavía no» o «falló»
     bajaba un reporte firmable con «0 piezas libres» donde había 5.000. */
  const [estado, setEstado] = useState<
    Record<"patio" | "lotes" | "corridas" | "pendientes", EstadoFuente>
  >({
    patio: "cargando",
    lotes: "cargando",
    corridas: "cargando",
    pendientes: "cargando",
  });
  const marcar = useCallback(
    (k: "patio" | "lotes" | "corridas" | "pendientes", v: EstadoFuente) =>
      setEstado((e) => (e[k] === v ? e : { ...e, [k]: v })),
    [],
  );
  /** El endpoint del patio recorta a 5.000 piezas: si recortó, el techo es parcial. */
  const [patioTruncado, setPatioTruncado] = useState<{ devueltas: number; total: number } | null>(
    null,
  );
  /** Ingresos sin validar que NO tienen piezas (los que sí, entran troza por troza). */
  const [pendienteSinPiezasM3, setPendienteSinPiezasM3] = useState(0);
  /** La corrida que se está declarando (o des-declarando) existencia de apertura. */
  const [aperturaDe, setAperturaDe] = useState<{
    id: string;
    lote: string | null;
    deshacer: boolean;
  } | null>(null);
  /** La corrida abierta desde «Origen incompleto», para atarle materia prima. */
  const [corridaAbierta, setCorridaAbierta] = useState<DetailTarget | null>(null);
  /* Lo disponible es una FOTO del depósito, no un movimiento del mes: un
     paquete aserrado en 2024 que nadie despachó sigue estando hoy. Por eso
     va SIN `soloDelPeriodo` (ADR-349) — el período sólo acompaña. Es una
     función porque se vuelve a pedir después de atar un origen. */
  const cargarCorridas = useCallback(() => {
    return fetch(
      `/api/admin/forestal/ctp?${applyCtpPeriodParams(new URLSearchParams({ disponibles: "1" }), period)}`,
      {
        credentials: "include",
      },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j?.corridas)) {
          setCorridas(j.corridas as CorridaDisponible[]);
          marcar("corridas", "ok");
        } else {
          setCorridas([]);
          marcar("corridas", "error");
        }
      })
      .catch((err) => {
        logger.warn("[ctp-saldos] disponibles no cargaron", { error: String(err) });
        /* Un fallo de red NO es un depósito vacío: se marca y el balance lo dice. */
        setCorridas([]);
        marcar("corridas", "error");
      });
    // El período sólo acompaña; lo que se lista no depende de él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/lotes-aserrio", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo) return;
        if (Array.isArray(j?.lotes)) {
          setLotes(j.lotes as LoteAserrio[]);
          marcar("lotes", "ok");
        } else marcar("lotes", "error");
      })
      .catch((err) => {
        logger.warn("[ctp-saldos] lotes no cargaron", { error: String(err) });
        if (vivo) marcar("lotes", "error");
      });
    fetch("/api/admin/forestal/trozas/patio", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo) return;
        if (Array.isArray(j?.trozas)) {
          setPatio(j.trozas as TrozaConsumible[]);
          setPatioTruncado(
            j.truncado
              ? { devueltas: Number(j.devueltas ?? j.trozas.length), total: Number(j.total ?? 0) }
              : null,
          );
          marcar("patio", "ok");
        } else marcar("patio", "error");
      })
      .catch((err) => {
        logger.warn("[ctp-saldos] patio no cargó", { error: String(err) });
        if (vivo) marcar("patio", "error");
      });
    /* Los ingresos sin validar y SIN piezas: los que tienen piezas ya entran
       troza por troza en «por recepcionar». Sumar el total del libro además
       contaba la misma madera dos veces. */
    fetch("/api/admin/forestal/wood-entries?status=pendiente&limit=500", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo) return;
        const filas = (j?.entries ?? j?.items) as
          | { volumeM3?: unknown; trozasCount?: unknown }[]
          | undefined;
        if (!Array.isArray(filas)) return marcar("pendientes", "error");
        setPendienteSinPiezasM3(
          filas
            .filter((e) => Number(e.trozasCount ?? 0) === 0)
            .reduce((a, e) => a + Number(e.volumeM3 ?? 0), 0),
        );
        marcar("pendientes", "ok");
      })
      .catch((err) => {
        logger.warn("[ctp-saldos] pendientes no cargaron", { error: String(err) });
        if (vivo) marcar("pendientes", "error");
      });
    void cargarCorridas();
    return () => {
      vivo = false;
    };
  }, [cargarCorridas, marcar]);

  /* Los lotes en la forma que piden los dos reportes. Se arma UNA vez y la usan
     el PDF y el CSV: dos versiones de la misma tabla divergen a la primera
     columna nueva, que es exactamente lo que ya pasó con las guías. */
  const lotesTodos = useMemo(() => {
    const ahora = new Date();
    return lotes.map((l) => ({
      id: l.id,
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
        return p == null
          ? null
          : Math.round((consumidoDelLote(l) * RENDIMIENTO_META - p) * 10000) / 10000;
      })(),
      apartadoM3: volumenLibre(l),
      piezas: piezasLibres(l).length,
      diasParado: diasDeEspera(l, ahora),
      finProceso: l.finProceso ? String(l.finProceso).slice(0, 10) : null,
      diasParaVencer: diasParaVencer(l.finProceso, ahora),
      vencido: loteVencido(l, ahora),
      /* Las piezas, con su guía: el cruce lote↔guía que pide el detalle. */
      trozas: l.trozas.map((t) => ({
        id: t.id,
        codigo: t.codigoPlanta ?? t.codificacion ?? "—",
        especie: t.especieComun ?? l.speciesCommon,
        m3: Number(t.volumenM3 ?? 0),
        permiso: (t.permiso ?? "").trim(),
        guia: (t.gtfNumber ?? "").trim(),
        consumida: Boolean(t.consumidaEnId),
      })),
    }));
  }, [lotes]);

  /* Tildar lotes acota SÓLO la hoja/tabla de lotes del reporte. El balance de
     capacidad sigue hablando de toda la planta: un techo que se achica en
     silencio al tildar dos filas es un techo que miente (auditoría 2026-09-06). */
  const lotesDelReporte = useMemo(
    () => (lotesElegidos.size > 0 ? lotesTodos.filter((l) => lotesElegidos.has(l.id)) : lotesTodos),
    [lotesTodos, lotesElegidos],
  );

  const mp = data?.materiaPrima;

  /* La entrada del balance: lo que ya se pidió, en la forma que espera el
     núcleo. Se arma acá —no en la tarjeta— porque el MISMO objeto lo leen la
     tarjeta, el modal de detalle, el Excel y el PDF; cuatro cálculos paralelos
     divergen a la primera columna nueva. */
  const entradaCapacidad = useMemo<EntradaCapacidad>(
    () => ({
      patio,
      lotes: lotesTodos,
      corridas: corridas ?? undefined,
      stockLibroM3: (data?.productos ?? []).reduce((a, p) => a + Number(p.stock ?? 0), 0),
      pendienteSinPiezasM3,
      estado,
      patioTruncado,
      /* El stock que muestra ESTA pantalla es el del período elegido —el mismo
         del bloque «Stock de productos transformados» de arriba—. Con el período
         completo el número es otro (medido: 62.39 en Jul–Set contra 71.21 en el
         año), así que se dice de dónde sale: dos cifras de stock distintas en la
         misma pantalla, sin explicar cuál es cuál, es peor que una sola
         acotada. */
      periodoLabel: period.label,
      periodo: { from: period.from, to: period.to },
    }),
    [
      patio,
      lotesTodos,
      corridas,
      data?.productos,
      pendienteSinPiezasM3,
      estado,
      patioTruncado,
      period.label,
      period.from,
      period.to,
    ],
  );

  /** Las opciones de los tres filtros, cada una acotada por la anterior. */
  const opcionesCapacidad = useMemo(
    () => opcionesDeCapacidad(patio, filtrosCapacidad, corridas ?? []),
    [patio, filtrosCapacidad, corridas],
  );

  const balance = useMemo(
    () => armarBalance(entradaCapacidad, filtrosCapacidad),
    [entradaCapacidad, filtrosCapacidad],
  );

  /* Mientras una fuente no llegó, el reporte no se baja: un PDF con «0 piezas
     libres» porque el patio todavía estaba cargando es un papel que miente. */
  const fuentesCargando =
    estado.patio === "cargando" || estado.lotes === "cargando" || estado.corridas === "cargando";

  /** Qué parte del depósito no se puede certificar, y por qué. Foto, sin filtros. */
  const origen = useMemo(() => resumenDeOrigen(corridas ?? [], lotesTodos), [corridas, lotesTodos]);

  /** Los lotes bajo el mismo recorte que la tarjeta (permiso y especie; la guía no aplica). */
  const lotesFiltrados = useMemo(() => {
    const f = filtrosCapacidad;
    if (f.guia) return [];
    return lotes.filter(
      (l) =>
        (!f.permiso || permisosDelLote(l).includes(f.permiso)) &&
        (!f.especie || l.speciesCommon.trim().toUpperCase() === f.especie.toUpperCase()),
    );
  }, [lotes, filtrosCapacidad]);

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
        balance,
        origen,
      });
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    }
  }, [data, concil, period.label, lotesDelReporte, balance, origen]);

  /**
   * El mismo reporte, en Excel.
   *
   * Va en CUATRO hojas de un mismo archivo —materia prima, productos, lotes y
   * capacidad— porque apilar cuatro tablas distintas en una sola hoja obliga a
   * borrar filas antes de poder ordenar o filtrar, que es lo que se hace con
   * un Excel. Y en UN archivo, no cuatro: `exportToExcel` genera un libro por
   * llamada, así que llamarlo cuatro veces baja cuatro archivos sueltos y el
   * navegador bloquea la segunda descarga automática.
   *
   * Las cantidades van como NÚMERO, no como texto: un m³ que llega como cadena
   * no se suma en la planilla, y la razón de exportar a Excel es sumar.
   */
  const descargarExcel = useCallback(async () => {
    if (!data) return;
    setReportError(null);
    try {
      const { exportSheetsToExcel } = await import("@/lib/export-excel");
      const nombre = nombreArchivoSaldos(period.label).replace(/\.csv$/, "");
      await exportSheetsToExcel(
        [
          {
            nombre: "Materia prima",
            filas: data.porEspecie.map((e) => ({
              Especie: e.especie,
              "Nombre científico": e.scientific ?? "",
              CITES: e.cites ? "Sí" : "No",
              "Ingresado (m³)": e.ingresoM3,
              "Sin validar (m³)": e.pendienteM3,
              "Consumido (m³)": e.consumidoM3,
              "Saldo (m³)": e.saldoM3,
            })),
          },
          {
            nombre: "Productos",
            /* Sin columna de unidad a propósito: `productos[]` agrega corridas
               que pueden venir en m³, pt o unidades, y una unidad inventada en
               la cabecera haría sumar peras con manzanas en la planilla. Es la
               misma decisión que ya toma la tabla en pantalla. */
            filas: data.productos.map((p) => ({
              Producto: p.producto,
              Producido: p.producido,
              Despachado: p.despachado,
              Disponible: p.stock,
            })),
          },
          {
            nombre: "Lotes de aserrío",
            filas: lotesDelReporte.map((l) => ({
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
          },
          {
            /* El techo de producción, con la misma advertencia que la pantalla:
               es una cota máxima, no una promesa. Sin la columna «Es» el número
               se lee como stock comprometido. */
            nombre: "Capacidad de la planta",
            filas: [
              ...balance.fuentes.map((f) => ({
                Fuente: f.label,
                "Hoy (m³)": f.m3,
                "Al 56 %": f.convertido ? "sí" : "no (ya es producto)",
                "En producto (m³)": f.enProducto,
                "En producto (pt)": pieTablarDe(f.enProducto),
                Detalle: f.detalle ?? "",
              })),
              {
                Fuente: "CAPACIDAD MÁXIMA",
                "Hoy (m³)": "",
                "Al 56 %": "",
                "En producto (m³)": balance.totalProducto,
                "En producto (pt)": pieTablarDe(balance.totalProducto),
                Detalle: `${textoDeFiltros(filtrosCapacidad)}. Cota máxima, no una promesa.`,
              },
            ],
          },
        ],
        nombre,
      );
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    }
  }, [data, period.label, lotesDelReporte, balance, filtrosCapacidad]);

  const descargarCsv = useCallback(() => {
    if (!data) return;
    const csv = saldosACsv(
      data.porEspecie,
      data.productos,
      period.label,
      lotesDelReporte,
      balance,
      origen,
    );
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoSaldos(period.label);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [data, period.label, lotesDelReporte, balance, origen]);

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
            existenciaFinal: concil?.materiaPrima.map((m) => ({
              especie: m.especie,
              final: m.final,
            })),
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
        <Btn
          variant="dark"
          size="md"
          onClick={() => void handleReport()}
          disabled={!data || fuentesCargando}
          title={fuentesCargando ? "Esperando el patio y los lotes…" : undefined}
        >
          <FileDown className="h-4 w-4" /> Descargar reporte
        </Btn>
        <Btn
          variant="secondary"
          size="md"
          onClick={descargarCsv}
          disabled={!data || fuentesCargando}
          title={fuentesCargando ? "Esperando el patio y los lotes…" : undefined}
        >
          <FileSpreadsheet className="h-4 w-4" /> CSV
        </Btn>
        <Btn
          variant="secondary"
          size="md"
          onClick={() => void descargarExcel()}
          disabled={!data || fuentesCargando}
          title={fuentesCargando ? "Esperando el patio y los lotes…" : undefined}
        >
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
          {/* Todo lo que está mal, junto y con nombre propio. Va primero y va
              FUERA de las pestañas: es lo único de esta pantalla que obliga a
              hacer algo hoy, y un aviso escondido detrás de una pestaña es un
              aviso que nadie ve. */}
          <ExcepcionesSaldo excepciones={excepciones} onIr={onIr} />

          {/* Diez bloques en una sola tirada obligaban a scrollear por lo que
              no se está mirando. Agrupados por la pregunta que contesta cada
              uno: cómo está hoy · qué puede salir · cómo se movió · qué firma
              el libro. */}
          <div
            role="tablist"
            aria-label="Secciones de Saldos"
            className="flex flex-wrap gap-1 rounded-xl bg-[var(--surface-sunken)] p-1"
            /* Flechas, Home y End mueven entre pestañas y el foco las sigue; Tab
               entra y sale del grupo de una (tabIndex roving), como en
               AdminTabBar. Cuatro botones todos tabulables no son un tablist. */
          >
            {SECCIONES.map((s) => (
              <button
                key={s.id}
                id={`saldos-tab-${s.id}`}
                type="button"
                role="tab"
                aria-selected={seccion === s.id}
                aria-controls={`saldos-panel-${s.id}`}
                tabIndex={seccion === s.id ? 0 : -1}
                onClick={() => setSeccion(s.id)}
                onKeyDown={(e) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                  e.preventDefault();
                  const i = SECCION_IDS.indexOf(seccion);
                  const destino =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? SECCION_IDS.length - 1
                        : (i + (e.key === "ArrowRight" ? 1 : -1) + SECCION_IDS.length) %
                          SECCION_IDS.length;
                  setSeccion(SECCION_IDS[destino]);
                  (
                    e.currentTarget.parentElement?.querySelector(
                      `#saldos-tab-${SECCION_IDS[destino]}`,
                    ) as HTMLElement | null
                  )?.focus();
                }}
                className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                  seccion === s.id
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`saldos-panel-${seccion}`}
            aria-labelledby={`saldos-tab-${seccion}`}
            className="space-y-6"
          >
            {seccion === "estado" && (
              <>
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
                  madera tengo y de qué. Va arriba de los derivados porque el
                  saldo se mira antes que la rotación. */}
                <DisponiblePorTipo
                  especies={data.porEspecie}
                  productos={data.productos}
                  onKardex={setKardexEspecie}
                />

                {/* Gemelo del patio: qué parte de esa madera lleva demasiado
                  tiempo parada (self-fetch). */}
                <CtpPatioAging onValorizar={onIr ? () => onIr("rentabilidad") : undefined} />
              </>
            )}

            {seccion === "capacidad" && (
              <>
                {/* El techo: cuánto producto puede salir de las cuatro fuentes. */}
                <BalanceDeCapacidad
                  balance={balance}
                  filtros={filtrosCapacidad}
                  opciones={opcionesCapacidad}
                  onFiltros={setFiltrosCapacidad}
                  onDetalle={setDetalleFuente}
                />

                {/* Lo que de ese techo NO puede salir con papeles. Va pegado al
                  balance: el número de arriba es «cuánto», éste es «cuánto de
                  eso se puede certificar». */}
                <OrigenIncompleto
                  resumen={origen}
                  onAbrirCorrida={(c) =>
                    setCorridaAbierta({ kind: "corrida", id: c.id, fecha: c.fecha })
                  }
                  onDeclararApertura={(c, deshacer) =>
                    setAperturaDe({ id: c.id, lote: c.lote, deshacer })
                  }
                />

                {/* De dónde sale una parte de ese techo, lote por lote. */}
                {/* El mismo recorte que la tarjeta de arriba: la pestaña entera habla
                  de un solo título. La guía no acota lotes (juntan varias) y se
                  dice, en vez de esconder la tabla. */}
                <LotesConSaldo
                  lotes={lotesFiltrados}
                  seleccion={lotesElegidos}
                  onSeleccion={setLotesElegidos}
                  vacioMotivo={
                    lotes.length === 0
                      ? undefined
                      : filtrosCapacidad.guia
                        ? "Un lote junta piezas de varias guías: no se puede acotar a una sola. Quitá el filtro de guía para verlos."
                        : `Ningún lote de ${[filtrosCapacidad.permiso && `permiso ${filtrosCapacidad.permiso}`, filtrosCapacidad.especie && `especie ${filtrosCapacidad.especie}`].filter(Boolean).join(" y ")}.`
                  }
                />
              </>
            )}

            {seccion === "movimiento" && (
              <>
                {/* ¿Sube o baja? La foto del saldo no lo dice, y es con lo que se
                  decide comprar madera. */}
                {curva && <CurvaDeSaldo curva={curva} periodoLabel={ctpPeriodShortLabel(period)} />}

                {/* Cómo se llegó al saldo, de qué especie está hecho y en qué
                  estado está el volumen de cada una. */}
                <CtpSaldosGraficos
                  materiaPrima={mp}
                  porEspecie={data.porEspecie}
                  apertura={apertura}
                  aperturaPendiente={loading}
                />
              </>
            )}

            {seccion === "libro" && (
              <>
                {/* Conciliación: apertura (del cierre anterior) + movimientos =
                  final (ADR-139 rollforward). Es la cuenta que firma el libro. */}
                {concil && <TablaConciliacion concil={concil} onKardex={setKardexEspecie} />}

                <TablaProductos productos={data.productos} onDespachar={onDespachar} />
              </>
            )}
          </div>
        </>
      )}
      {loading && !data && <PanelSkeleton kpis={4} />}

      {aperturaDe && (
        <DeclararAperturaModal
          corridaId={aperturaDe.id}
          lote={aperturaDe.lote}
          deshacer={aperturaDe.deshacer}
          onClose={() => setAperturaDe(null)}
          onListo={() => {
            setAperturaDe(null);
            void cargarCorridas();
          }}
        />
      )}

      {corridaAbierta && (
        <CtpNodeDetailLoader
          target={corridaAbierta}
          onClose={() => {
            setCorridaAbierta(null);
            /* Lo que se ató en la ficha cambia el diagnóstico: se vuelve a
               pedir la foto en vez de adivinar qué cambió. */
            void cargarCorridas();
          }}
        />
      )}

      {detalleFuente && (
        <DetalleDeFuente
          fuente={detalleFuente}
          entrada={entradaCapacidad}
          filtros={filtrosCapacidad}
          periodoLabel={period.label}
          onClose={() => setDetalleFuente(null)}
        />
      )}

      {kardexEspecie && (
        <CtpKardexModal
          especie={kardexEspecie}
          period={period}
          onClose={() => setKardexEspecie(null)}
        />
      )}
    </div>
  );
}
