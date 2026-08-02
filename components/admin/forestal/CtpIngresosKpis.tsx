"use client";

/**
 * CtpIngresosKpis — la fila de KPIs de la pestaña Ingresos.
 *
 * Los números no son sólo decoración: cada tarjeta es el filtro que la explica.
 * "Pendientes validar: 4" y después buscar los 4 a mano en la tabla era el
 * camino largo de lo mismo — ahora la tarjeta ES el atajo, y se ve hundida
 * cuando su filtro está puesto.
 *
 * "Fuera de plazo" es nueva: el dato (`stats.lateCount`) se calculaba en DB
 * desde siempre pero sólo aparecía en la tira de pendientes del shell y en el
 * Excel; acá vive al lado de las otras cifras del período y filtra la tabla.
 */

import { m as motion } from "framer-motion";
import { AlertCircle, Boxes, Clock, CalendarClock, TreePine } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { staggerContainer, staggerChild } from "@/components/ui-system/motion";
import type { WoodEntryStats } from "./ctp-shared";

export interface CtpIngresosKpisProps {
  stats: WoodEntryStats | null;
  /** Filtro de estado activo (para marcar "Pendientes" como hundida). */
  statusFilter: string;
  citesOn: boolean;
  lateOn: boolean;
  onStatus: (status: string) => void;
  onCites: () => void;
  onLate: () => void;
  /** La tarjeta de volumen abre/cierra el desglose por especie. */
  onVolumen: () => void;
  dashboardOn: boolean;
}

const nf = (n: number) => n.toLocaleString("es-PE");

export default function CtpIngresosKpis({
  stats,
  statusFilter,
  citesOn,
  lateOn,
  onStatus,
  onCites,
  onLate,
  onVolumen,
  dashboardOn,
}: CtpIngresosKpisProps) {
  // Una tarjeta activa se ve hundida: si no, el operador no sabe que la tabla
  // de abajo está recortada por haber hecho click acá arriba.
  const activa = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]";

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      // Mobile: carrusel de una fila en vez de una grilla de 3 filas. Cinco
      // tarjetas apiladas empujaban el primer ingreso dos scrolls abajo, y en el
      // celular el KPI es de referencia — el dato que se viene a ver es la lista.
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-5"
    >
      <motion.div variants={staggerChild} className="w-[15rem] shrink-0 snap-start sm:w-auto sm:shrink">
        <StatCard
          label="Ingresos del período"
          value={stats ? nf(stats.totalCount) : "—"}
          subValue={stats ? `${nf(stats.totalPieces)} piezas` : undefined}
          icon={Boxes}
          emphasis="neutral"
        />
      </motion.div>
      <motion.div variants={staggerChild} className="w-[15rem] shrink-0 snap-start sm:w-auto sm:shrink">
        <StatCard
          label="Volumen del período"
          value={stats ? `${Number(stats.totalVolumeM3).toFixed(2)} m³` : "—"}
          subValue={stats ? `${stats.speciesCount} especies · ver desglose` : undefined}
          icon={TreePine}
          emphasis="success"
          onClick={onVolumen}
          className={dashboardOn ? activa : undefined}
        />
      </motion.div>
      <motion.div variants={staggerChild} className="w-[15rem] shrink-0 snap-start sm:w-auto sm:shrink">
        <StatCard
          label="Pendientes validar"
          value={stats ? nf(stats.byStatus.pendiente) : "—"}
          subValue={
            stats?.byStatus.pendiente
              ? statusFilter === "pendiente"
                ? "Filtrando por estos"
                : "Ver solo estos"
              : "Todo al día"
          }
          icon={Clock}
          emphasis={stats?.byStatus.pendiente ? "warning" : "neutral"}
          onClick={stats?.byStatus.pendiente ? () => onStatus(statusFilter === "pendiente" ? "" : "pendiente") : undefined}
          className={statusFilter === "pendiente" ? activa : undefined}
        />
      </motion.div>
      <motion.div variants={staggerChild} className="w-[15rem] shrink-0 snap-start sm:w-auto sm:shrink">
        <StatCard
          label="Fuera de plazo"
          value={stats ? nf(stats.lateCount) : "—"}
          subValue={
            stats?.lateCount
              ? lateOn
                ? "Filtrando por estos"
                : "Registro tardío · ver"
              : "Todos a tiempo"
          }
          icon={CalendarClock}
          emphasis={stats?.lateCount ? "warning" : "neutral"}
          onClick={stats?.lateCount ? onLate : undefined}
          className={lateOn ? activa : undefined}
        />
      </motion.div>
      <motion.div variants={staggerChild} className="w-[15rem] shrink-0 snap-start sm:w-auto sm:shrink">
        <StatCard
          label="Especies CITES"
          value={stats ? nf(stats.citesCount) : "—"}
          subValue={stats ? `${Number(stats.citesVolumeM3).toFixed(2)} m³ protegidos` : undefined}
          icon={AlertCircle}
          emphasis={stats?.citesCount ? "error" : "neutral"}
          onClick={stats?.citesCount ? onCites : undefined}
          className={citesOn ? activa : undefined}
        />
      </motion.div>
    </motion.div>
  );
}
