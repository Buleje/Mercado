"use client";

import type { ReactNode } from "react";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { StatCard } from "@buleje/design-system";
import {
  AlertTriangle,
  Boxes,
  FileText,
  HandCoins,
  Layers,
  PackageCheck,
  RefreshCw,
  TreePine,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtMonedas } from "@/components/admin/adelantos/shared";
import { formatNumber } from "@/lib/format";
import { porcentaje } from "@/lib/admin/inicio/formato-tablero";
import { valorConDato } from "@/lib/admin/inicio/hay-datos";
import { cantidadDelPeriodo, type InicioForestal } from "@/lib/forestal/inicio-forestal";
import { describeRange, type DateRange } from "./DashboardDateRange";
import EmptyDateRangeState from "./EmptyDateRangeState";
import { BulejeDashboardSkeleton, KPI_GRID_5, KPI_GRID_6 } from "./_shared";
import { ForestalCharts } from "./ForestalCharts";
import { ForestalAvisoPapeles } from "./ForestalAvisoPapeles";
import { ForestalPermisos } from "./ForestalPermisos";
import { estadoInicioForestal, guiasVigentes, useForestalInicio } from "./use-forestal-inicio";

const CTP = "/admin?tab=ctp-libro-operaciones";
const LOTH = "/admin?tab=loth-libro-operaciones";
const m3 = (n: number) => `${formatNumber(n, 2)} m³`;

/** La cifra de una tarjeta sin dato: «—» atenuado; la línea de abajo dice por qué (regla R3). */
const SIN_DATO = (
  <span data-sin-dato="true" aria-label="Sin dato" className="text-[var(--text-tertiary)] opacity-70">
    —
  </span>
);

interface Props {
  dateRange: DateRange;
  /** El negocio tiene el módulo Adelantos (plan + plantilla): sólo así se pide. */
  conAdelantos: boolean;
  /** Los chips «Prueba con» del estado vacío cambian el rango del Inicio. Sin esto no se pintan. */
  onChangeRange?: (range: DateRange) => void;
}

/**
 * Inicio · Forestal (2026-10-08): el aserradero y la plantación en una mirada.
 *
 * Ninguna cifra se calcula acá: todas vienen armadas de
 * `GET /api/admin/inicio/forestal`, que a su vez llama a las funciones de cada
 * pantalla del libro. Cada tarjeta lleva a la pantalla que muestra el MISMO
 * número para el mismo período.
 *
 * Vacíos (Brandon 09-10, reglas R1-R3 del tablero): sin movimiento en el
 * período ni nada «a hoy» → sólo el paiche con los otros períodos y «Registrar
 * ingreso». Sin movimiento pero con patio o permisos → el paiche reemplaza a
 * las cifras del período y la foto de hoy queda debajo. Una cifra en cero sale
 * «—» con su porqué, no «0.00 m³».
 */
export default function ForestalDashboard({ dateRange, conAdelantos, onChangeRange }: Props) {
  const { data, cargando, error, reintentar } = useForestalInicio(dateRange, conAdelantos);

  if (cargando && !data) return <BulejeDashboardSkeleton />;
  if (error && !data) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" aria-hidden />
        <p className="text-sm font-medium text-[var(--text-primary)]">{error}</p>
        <button
          type="button"
          onClick={reintentar}
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </button>
      </div>
    );
  }
  if (!data) return null;

  const ir = (href: string) => irAEnlace(href);
  const periodo = describeRange(dateRange);
  const { movimiento, foto } = estadoInicioForestal(data);
  const aviso = <ForestalAvisoPapeles activo={!!data.ctp} onIr={() => ir(`${CTP}&vista=ingresos`)} />;
  const vacio = {
    dateRange,
    onChangeRange,
    metric: data.ctp ? "movimiento en el libro" : "guías en el Libro TH",
    action: data.ctp
      ? { label: "Registrar ingreso", href: `${CTP}&vista=ingresos` }
      : { label: "Anotar una guía", href: `${LOTH}&vista=gtf` },
  };

  // R1: nada en el período y nada a hoy → sólo el paiche.
  if (!movimiento && !foto) {
    return (
      <div className="space-y-4" aria-busy={cargando}>
        {aviso}
        <EmptyDateRangeState {...vacio} />
      </div>
    );
  }

  const deHoy = tarjetasDeHoy(data, ir);
  const tarjetas = movimiento ? [...tarjetasDelPeriodo(data, periodo, ir), ...deHoy] : deHoy;
  return (
    <div className="space-y-6" aria-busy={cargando}>
      {/* Sin movimiento, el paiche ya dice qué es del período y qué es de hoy. */}
      {movimiento && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span>
            Movimiento de <strong className="text-[var(--text-primary)]">{periodo}</strong> · el patio y los permisos, a hoy
          </span>
          <InfoTip
            title="De dónde sale cada cifra"
            what="Del Libro CTP: ingresado, producido y despachado salen del Tablero; el patio, de Volumen disponible; las guías, de Guías emitidas. Del Libro TH: las GTF y Control del permiso. Adelantos: lo que te deben hoy."
            affects="Cada tarjeta abre la pantalla que muestra el mismo número. Producido y despachado llevan unidad sólo si todo el período se declaró en una (m³ o pt); si mezcla, van sin unidad, como en el Tablero: la suma no convierte pt a m³. El patio, los permisos y los adelantos son una foto de hoy: no dependen del rango."
            example="Ingresado 56.92 m³ en el mes = la barra «Ingresado» del Tablero del Libro CTP con el mismo rango."
          />
          {error && <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">· {error}</span>}
        </p>
      )}

      {aviso}

      {!movimiento && (
        <EmptyDateRangeState
          {...vacio}
          description={`No entró, no se aserró ni salió madera ${periodo}. El patio y los permisos de abajo no dependen del período.`}
        />
      )}

      {tarjetas.length > 0 && (
        <div className={tarjetas.length >= 6 ? KPI_GRID_6 : tarjetas.length >= 3 ? KPI_GRID_5 : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
          {tarjetas}
        </div>
      )}

      {data.ctp && <ForestalCharts ctp={data.ctp} />}
      {data.loth && <ForestalPermisos permisos={data.loth.permisos} onIr={() => ir(`${LOTH}&vista=tablero`)} />}
    </div>
  );
}

/**
 * Lo que pasó en el período, en el orden en que viaja la madera. Sólo se pinta
 * si hubo algún movimiento: entonces una cifra en cero es la noticia de esa
 * tarjeta («no salió producto este mes») y va como «—» con su porqué.
 */
function tarjetasDelPeriodo(data: InicioForestal, periodo: string, ir: (href: string) => void): ReactNode[] {
  const { ctp, loth } = data;
  const out: ReactNode[] = [];
  if (ctp) {
    const hayProd = valorConDato(ctp.producido);
    const subProducido = hayProd
      ? [
          ctp.rendimiento > 0 ? `rinde ${porcentaje(ctp.rendimiento, 1)}` : null,
          `de ${m3(ctp.consumoM3)} de troza`,
          ctp.unidadProducido == null ? "varias unidades" : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : valorConDato(ctp.consumoM3)
        ? `${m3(ctp.consumoM3)} de troza a la sierra, sin producción declarada`
        : `sin corridas ${periodo}`;
    out.push(
      <StatCard
        key="ingreso"
        label="Ingresado al CTP"
        value={valorConDato(ctp.ingresoM3) ? m3(ctp.ingresoM3) : SIN_DATO}
        subValue={valorConDato(ctp.ingresoM3) ? "guías validadas · ver Tablero" : `no entró madera ${periodo}`}
        icon={TreePine}
        onClick={() => ir(`${CTP}&vista=tablero`)}
      />,
      <StatCard
        key="producido"
        label="Producido"
        value={hayProd ? cantidadDelPeriodo(ctp.producido, ctp.unidadProducido) : SIN_DATO}
        subValue={subProducido}
        // Sin `emphasis="success"`: ese verde sale del color del negocio dentro de
        // /admin y era un tercer color para lo mismo que el gráfico pinta turquesa.
        icon={Layers}
        onClick={() => ir(`${CTP}&vista=produccion`)}
      />,
      <StatCard
        key="despachado"
        label="Despachado"
        value={valorConDato(ctp.despachado) ? cantidadDelPeriodo(ctp.despachado, ctp.unidadDespachado) : SIN_DATO}
        subValue={
          !valorConDato(ctp.despachado)
            ? `no salió producto ${periodo}`
            : ctp.unidadDespachado == null
              ? "salida de producto · varias unidades"
              : "salida de producto del CTP"
        }
        icon={PackageCheck}
        onClick={() => ir(`${CTP}&vista=despacho`)}
      />,
    );
  }
  if (ctp || loth) {
    const g = guiasVigentes(data);
    const vigentes = g.ctp + g.th;
    const partes = [ctp ? `CTP ${g.ctp}` : null, loth ? `TH ${g.th}` : null].filter(Boolean).join(" · ");
    const anuladas = g.anuladas > 0 ? ` · ${g.anuladas} anulada${g.anuladas === 1 ? "" : "s"} aparte` : "";
    out.push(
      <StatCard
        key="guias"
        label="Guías emitidas"
        value={vigentes > 0 ? formatNumber(vigentes) : SIN_DATO}
        subValue={vigentes > 0 ? `${partes}${anuladas}` : `ninguna ${periodo}${anuladas}`}
        icon={FileText}
        onClick={() => ir(ctp ? `${CTP}&vista=guias` : `${LOTH}&vista=gtf`)}
      />,
    );
  }
  return out;
}

/** La foto de hoy: no depende del rango, así que se ve aunque el período esté vacío. */
function tarjetasDeHoy(data: InicioForestal, ir: (href: string) => void): ReactNode[] {
  const { ctp, adelantos } = data;
  const out: ReactNode[] = [];
  if (ctp) {
    const { patio } = ctp;
    const conTrozas = !!patio && (valorConDato(patio.trozas) || valorConDato(patio.m3));
    out.push(
      <StatCard
        key="patio"
        label="En el patio hoy"
        value={!patio ? SIN_DATO : conTrozas ? m3(patio.m3) : "Vacío"}
        subValue={
          !patio
            ? "no se pudo leer el patio"
            : conTrozas
              ? `${formatNumber(patio.trozas)} trozas · ≈ ${formatNumber(patio.pt)} pt${patio.truncado ? " · lectura parcial" : ""}`
              : "no queda troza por aserrar"
        }
        icon={Boxes}
        emphasis={patio ? "neutral" : "warning"}
        onClick={() => ir(`${CTP}&vista=disponibles`)}
      />,
    );
  }
  const conSaldo = (adelantos ?? []).filter((a) => valorConDato(a.saldoPendiente));
  if (conSaldo.length > 0) {
    const porMoneda = Object.fromEntries(conSaldo.map((a) => [a.moneda, a.saldoPendiente]));
    const abiertos = conSaldo.reduce((a, m) => a + m.abiertos, 0);
    out.push(
      <StatCard
        key="adelantos"
        label="Adelantos por cobrar"
        value={fmtMonedas(porMoneda)}
        subValue={`${abiertos} abierto${abiertos === 1 ? "" : "s"} · saldo de hoy`}
        icon={HandCoins}
        onClick={() => ir("/admin?tab=adelantos")}
      />,
    );
  }
  return out;
}
