"use client";

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
import { cantidadDelPeriodo, type InicioForestal } from "@/lib/forestal/inicio-forestal";
import { describeRange, type DateRange } from "./DashboardDateRange";
import { BulejeDashboardSkeleton, KPI_GRID_5, KPI_GRID_6 } from "./_shared";
import { ForestalCharts } from "./ForestalCharts";
import { ForestalAvisoPapeles } from "./ForestalAvisoPapeles";
import { ForestalPermisos } from "./ForestalPermisos";
import { useForestalInicio } from "./use-forestal-inicio";

const CTP = "/admin?tab=ctp-libro-operaciones";
const LOTH = "/admin?tab=loth-libro-operaciones";
const m3 = (n: number) => `${formatNumber(n, 2)} m³`;

interface Props {
  dateRange: DateRange;
  /** El negocio tiene el módulo Adelantos (plan + plantilla): sólo así se pide. */
  conAdelantos: boolean;
}

/**
 * Inicio · Forestal (2026-10-08): el aserradero y la plantación en una mirada.
 *
 * Ninguna cifra se calcula acá: todas vienen armadas de
 * `GET /api/admin/inicio/forestal`, que a su vez llama a las funciones de cada
 * pantalla del libro. Cada tarjeta lleva a la pantalla que muestra el MISMO
 * número para el mismo período.
 */
export default function ForestalDashboard({ dateRange, conAdelantos }: Props) {
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

  const tarjetas = tarjetasForestales(data, (href) => irAEnlace(href));
  return (
    <div className="space-y-6" aria-busy={cargando}>
      <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span>
          Movimiento de <strong className="text-[var(--text-primary)]">{describeRange(dateRange)}</strong> · el patio y los
          permisos, a hoy
        </span>
        <InfoTip
          title="De dónde sale cada cifra"
          what="Del Libro CTP: ingresado, producido y despachado salen del Tablero; el patio, de Volumen disponible; las guías, de Guías emitidas. Del Libro TH: las GTF y Control del permiso. Adelantos: lo que te deben hoy."
          affects="Cada tarjeta abre la pantalla que muestra el mismo número. Producido y despachado llevan unidad sólo si todo el período se declaró en una (m³ o pt); si mezcla, van sin unidad, como en el Tablero: la suma no convierte pt a m³. El patio, los permisos y los adelantos son una foto de hoy: no dependen del rango."
          example="Ingresado 56.92 m³ en el mes = la barra «Ingresado» del Tablero del Libro CTP con el mismo rango."
        />
        {error && <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">· {error}</span>}
      </p>

      <ForestalAvisoPapeles activo={!!data.ctp} onIr={() => irAEnlace(`${CTP}&vista=ingresos`)} />

      <div className={tarjetas.length >= 6 ? KPI_GRID_6 : KPI_GRID_5}>{tarjetas}</div>

      {data.ctp && <ForestalCharts ctp={data.ctp} />}
      {data.loth && <ForestalPermisos permisos={data.loth.permisos} onIr={() => irAEnlace(`${LOTH}&vista=tablero`)} />}
    </div>
  );
}

/** Las tarjetas que aplican a este negocio, en el orden en que viaja la madera. */
function tarjetasForestales(data: InicioForestal, ir: (href: string) => void) {
  const { ctp, loth, adelantos } = data;
  const out = [];
  if (ctp) {
    out.push(
      <StatCard
        key="ingreso"
        label="Ingresado al CTP"
        value={m3(ctp.ingresoM3)}
        subValue="guías validadas · ver Tablero"
        icon={TreePine}
        onClick={() => ir(`${CTP}&vista=tablero`)}
      />,
      <StatCard
        key="producido"
        label="Producido"
        value={cantidadDelPeriodo(ctp.producido, ctp.unidadProducido)}
        subValue={`de ${m3(ctp.consumoM3)} de troza${ctp.rendimiento > 0 ? ` · ${formatNumber(ctp.rendimiento, 1)} %` : ""}${ctp.unidadProducido == null ? " · varias unidades" : ""}`}
        icon={Layers}
        emphasis={ctp.producido > 0 ? "success" : "neutral"}
        onClick={() => ir(`${CTP}&vista=produccion`)}
      />,
      <StatCard
        key="despachado"
        label="Despachado"
        value={cantidadDelPeriodo(ctp.despachado, ctp.unidadDespachado)}
        subValue={ctp.unidadDespachado == null ? "salida de producto · varias unidades" : "salida de producto del CTP"}
        icon={PackageCheck}
        onClick={() => ir(`${CTP}&vista=despacho`)}
      />,
      <StatCard
        key="patio"
        label="En el patio hoy"
        value={ctp.patio ? m3(ctp.patio.m3) : "—"}
        subValue={
          ctp.patio
            ? `${formatNumber(ctp.patio.trozas)} trozas · ≈ ${formatNumber(ctp.patio.pt)} pt${ctp.patio.truncado ? " · lectura parcial" : ""}`
            : "no se pudo leer el patio"
        }
        icon={Boxes}
        emphasis={ctp.patio ? "neutral" : "warning"}
        onClick={() => ir(`${CTP}&vista=disponibles`)}
      />,
    );
  }
  if (ctp || loth) {
    const vigCtp = ctp ? ctp.guias.total - ctp.guias.anuladas : 0;
    const vigTh = loth ? loth.guias.emitidas : 0;
    const anuladas = (ctp?.guias.anuladas ?? 0) + (loth?.guias.anuladas ?? 0);
    const partes = [ctp ? `CTP ${vigCtp}` : null, loth ? `TH ${vigTh}` : null].filter(Boolean).join(" · ");
    out.push(
      <StatCard
        key="guias"
        label="Guías emitidas"
        value={formatNumber(vigCtp + vigTh)}
        subValue={`${partes}${anuladas > 0 ? ` · ${anuladas} anulada${anuladas === 1 ? "" : "s"} aparte` : ""}`}
        icon={FileText}
        onClick={() => ir(ctp ? `${CTP}&vista=guias` : `${LOTH}&vista=gtf`)}
      />,
    );
  }
  if (adelantos && adelantos.length > 0) {
    const porMoneda = Object.fromEntries(adelantos.map((a) => [a.moneda, a.saldoPendiente]));
    const abiertos = adelantos.reduce((a, m) => a + m.abiertos, 0);
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
