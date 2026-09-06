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

import { AlertCircle, Boxes, Clock, CalendarClock, MapPin, TreePine } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { CtpKpisPlegables, type WoodEntryStats } from "./ctp-shared";

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
  /**
   * Ingresos vigentes sin código de origen — el agujero que deja la pestaña
   * EUDR inerte. El dato (`stats.sinOrigenCount`) y su filtro existían desde
   * siempre, pero el filtro vivía escondido en el panel y no había cifra: nadie
   * mira un problema que no está en ningún número.
   */
  sinOrigenOn: boolean;
  onSinOrigen: () => void;
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
  sinOrigenOn,
  onSinOrigen,
}: CtpIngresosKpisProps) {
  // Una tarjeta activa se ve hundida: si no, el operador no sabe que la tabla
  // de abajo está recortada por haber hecho click acá arriba.
  const activa = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]";
  const vol = stats ? Number(stats.totalVolumeM3) : 0;

  return (
    /* Todas detrás del botón «Indicadores» (Brandon, 2026-09-03). El carrusel
       mobile que tenían acá dejó de hacer falta: escondidas no empujan la lista,
       y abiertas usan la misma grilla que el resto del libro. */
    <CtpKpisPlegables
      claveMemoria="ingresos"
      resumen={
        stats
          ? `${nf(stats.totalCount)} ingreso${stats.totalCount === 1 ? "" : "s"} · ${vol.toFixed(2)} m³` +
            /* Las piezas sólo si el papel las declara: un «0 piezas» acá al
               lado de las 78 trozas cargadas del archivo se lee como un error
               de la pantalla, y son dos cosas distintas (lo que dice la guía vs.
               la lista de trozas del detalle). */
            (stats.totalPieces > 0 ? ` · ${nf(stats.totalPieces)} piezas` : "") +
            (stats.byStatus.pendiente > 0 ? ` · ${nf(stats.byStatus.pendiente)} por validar` : "") +
            (stats.lateCount > 0 ? ` · ${nf(stats.lateCount)} fuera de plazo` : "")
          : "Leyendo el período…"
      }
      tarjetas={[
        <StatCard
          key="ingresos"
          density="compact"
          label="Ingresos del período"
          value={stats ? nf(stats.totalCount) : "—"}
          subValue={stats ? `${nf(stats.totalPieces)} piezas` : undefined}
          icon={Boxes}
          emphasis="neutral"
        />,
        <StatCard
          key="volumen"
          density="compact"
          label="Volumen del período"
          value={stats ? `${vol.toFixed(2)} m³` : "—"}
          /* El pie tablar al lado del m³, como en el resto del libro: es la
             unidad con la que el aserradero piensa lo que entró. */
          subValue={stats ? `${nf(pieTablarDe(vol))} pt · ${stats.speciesCount} especies · ver desglose` : undefined}
          icon={TreePine}
          emphasis="success"
          onClick={onVolumen}
          className={dashboardOn ? activa : undefined}
        />,
        <StatCard
          key="pendientes"
          density="compact"
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
        />,
        <StatCard
          key="plazo"
          density="compact"
          label="Fuera de plazo"
          value={stats ? nf(stats.lateCount) : "—"}
          subValue={
            stats?.lateCount ? (lateOn ? "Filtrando por estos" : "Registro tardío · ver") : "Todos a tiempo"
          }
          icon={CalendarClock}
          emphasis={stats?.lateCount ? "warning" : "neutral"}
          onClick={stats?.lateCount ? onLate : undefined}
          className={lateOn ? activa : undefined}
        />,
        <StatCard
          key="sin-origen"
          density="compact"
          label="Sin código de origen"
          value={stats ? nf(stats.sinOrigenCount) : "—"}
          subValue={
            stats?.sinOrigenCount
              ? sinOrigenOn
                ? "Filtrando por estos"
                : "sin parcela: EUDR queda inerte · ver"
              : "todos declaran su origen"
          }
          icon={MapPin}
          emphasis={stats?.sinOrigenCount ? "warning" : "success"}
          onClick={stats?.sinOrigenCount ? onSinOrigen : undefined}
          className={sinOrigenOn ? activa : undefined}
        />,
        <StatCard
          key="cites"
          density="compact"
          label="Especies CITES"
          value={stats ? nf(stats.citesCount) : "—"}
          subValue={stats ? `${Number(stats.citesVolumeM3).toFixed(2)} m³ protegidos` : undefined}
          icon={AlertCircle}
          emphasis={stats?.citesCount ? "error" : "neutral"}
          onClick={stats?.citesCount ? onCites : undefined}
          className={citesOn ? activa : undefined}
        />,
      ]}
    />
  );
}
