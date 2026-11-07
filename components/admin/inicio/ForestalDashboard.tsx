"use client";

import { AlertTriangle, RefreshCw } from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { describeRange, type DateRange } from "./DashboardDateRange";
import EmptyDateRangeState from "./EmptyDateRangeState";
import { BulejeDashboardSkeleton } from "./_shared";
import { ForestalAvisoPapeles } from "./ForestalAvisoPapeles";
import { ForestalCharts } from "./ForestalCharts";
import { ForestalPermisos } from "./ForestalPermisos";
import { CaminoDeLaMadera } from "./forestal/CaminoDeLaMadera";
import { cifrasForestal, consejoForestal } from "./forestal/cifras-forestal";
import { CTP, LOTH } from "./forestal/comun";
import { TarjetaEspecies } from "./forestal/TarjetaEspecies";
import { TarjetaAdelantos, TarjetaGuias } from "./forestal/TarjetaGuias";
import { TarjetaPatio } from "./forestal/TarjetaPatio";
import { hayGraficoForestal } from "./forestal/serie";
import { GrillaTablero, PilaTablero } from "./resumen/TarjetaTablero";
import { TiraDeCifras } from "./resumen/TiraDeCifras";
import { estadoInicioForestal, useForestalInicio } from "./use-forestal-inicio";

interface Props {
  dateRange: DateRange;
  /** El negocio tiene el módulo Adelantos (plan + plantilla): sólo así se pide. */
  conAdelantos: boolean;
  /** Los chips «Prueba con» del estado vacío cambian el rango del Inicio. Sin esto no se pintan. */
  onChangeRange?: (range: DateRange) => void;
}

/**
 * Inicio · Forestal: el aserradero y la plantación en una mirada.
 *
 * 2026-10-31 (Brandon: «algo más novedoso y más completo… más presentable»):
 * el mismo tablero denso del Resumen. Arriba la tira de cifras con su
 * mini-serie y la variación contra el período anterior, y el consejo de lo
 * primero que hay que mirar; debajo, tarjetas: el movimiento por semana, el
 * camino de la madera (entró → sierra → producto → salió), el patio de hoy
 * por especie, las especies del período, las guías, los adelantos y una ficha
 * por permiso con su vigencia y el plazo corrido.
 *
 * Ninguna cifra se calcula acá: todas vienen armadas de
 * `GET /api/admin/inicio/forestal`, que llama a las funciones de cada pantalla
 * del libro. Cada tarjeta lleva (enlace al pie) a la pantalla que muestra el
 * MISMO número para el mismo período.
 *
 * Vacíos (Brandon 09-10, reglas R1-R3 del tablero): sin movimiento en el
 * período ni nada «a hoy» → sólo el paiche con los otros períodos y «Registrar
 * ingreso». Sin movimiento pero con patio o permisos → el paiche reemplaza a
 * las tarjetas del período y la foto de hoy queda debajo. Una cifra sin dato
 * no se dibuja: se nombra en «Sin movimiento en el período».
 */
export default function ForestalDashboard({ dateRange, conAdelantos, onChangeRange }: Props) {
  const { data, cargando, error, reintentar, actualizado } = useForestalInicio(dateRange, conAdelantos);

  if (cargando && !data) return <BulejeDashboardSkeleton />;
  if (error && !data) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" aria-hidden />
        <p className="text-sm font-medium text-[var(--text-primary)]">{error}</p>
        <button type="button" onClick={reintentar} className={button({ variant: "secondary", size: "xl" })}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </button>
      </div>
    );
  }
  if (!data) return null;

  const periodo = describeRange(dateRange);
  const { movimiento, foto } = estadoInicioForestal(data);
  const aviso = <ForestalAvisoPapeles activo={!!data.ctp} onIr={() => irAEnlace(`${CTP}&vista=ingresos`)} />;
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
      <div className="space-y-3" aria-busy={cargando}>
        {aviso}
        <EmptyDateRangeState {...vacio} />
      </div>
    );
  }

  const { cifras, sinMovimiento } = cifrasForestal(data, movimiento);
  const consejo = consejoForestal(data, movimiento);
  const { ctp, loth } = data;
  /* Sin el gráfico (2 columnas) quedan 4 tarjetas de 1: la última fila tendría
     un hueco de 2 al lado de las guías. Ahí los permisos ocupan esas 2. */
  const conGrafico = !!ctp && movimiento && hayGraficoForestal(ctp.serie);

  return (
    <div
      data-inicio-forestal=""
      // `.charts-forestal`: los colores del Libro CTP (entra, sierra, producto,
      // sale y la rampa del patio) para TODO el tablero, en claro y en oscuro.
      className={cn("charts-forestal space-y-3 transition-opacity duration-[var(--dur-base)]", cargando && "opacity-70")}
      aria-busy={cargando}
    >
      {/* Sin movimiento, el paiche ya dice qué es del período y qué es de hoy. */}
      {movimiento && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span>
            Movimiento de <strong className="text-[var(--text-primary)]">{periodo}</strong> · el patio, los permisos y
            los adelantos, a hoy
          </span>
          <InfoTip
            title="De dónde sale cada cifra"
            what="Del Libro CTP: ingresado, producido, despachado y las especies salen del Tablero; el patio, de Volumen disponible; las guías, de Guías emitidas. Del Libro TH: las GTF y Control del permiso. Adelantos: lo que te deben hoy."
            affects="Producido y despachado llevan unidad sólo si todo el período se declaró en una (m³ o pt): la suma no convierte pt a m³. La variación compara con el período anterior del mismo largo. El patio, los permisos y los adelantos son una foto de hoy: no dependen del rango."
            example="Ingresado 56.92 m³ en el mes = la barra «Ingresado» del Tablero del Libro CTP con el mismo rango."
          />
          {error && <span className="text-[var(--data-warning-ink)]">· {error}</span>}
        </p>
      )}

      {aviso}

      {!movimiento && (
        <EmptyDateRangeState
          {...vacio}
          description={`No entró, no se aserró ni salió madera ${periodo}. El patio y los permisos de abajo no dependen del período.`}
        />
      )}

      {(cifras.length > 0 || consejo) && (
        <TiraDeCifras cifras={cifras} sinMovimiento={sinMovimiento} insight={consejo} generatedAt={actualizado} />
      )}

      <GrillaTablero>
        {ctp && movimiento && <ForestalCharts ctp={ctp} className="@2xl:col-span-2" />}
        {ctp && movimiento && <CaminoDeLaMadera ctp={ctp} />}
        {ctp && <TarjetaPatio patio={ctp.patio} />}
        {ctp && movimiento && <TarjetaEspecies ctp={ctp} />}
        <PilaTablero>
          {movimiento && <TarjetaGuias data={data} />}
          <TarjetaAdelantos adelantos={data.adelantos} />
        </PilaTablero>
        {loth && (
          <ForestalPermisos
            permisos={loth.permisos}
            className={conGrafico ? "@2xl:col-span-2 @4xl:col-span-3" : "@2xl:col-span-2"}
          />
        )}
      </GrillaTablero>
    </div>
  );
}
