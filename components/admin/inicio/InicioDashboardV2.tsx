"use client";

import { useEffect, useRef } from "react";
import type { DateRange } from "./DashboardDateRange";
import { DashboardAlertsList } from "@/components/admin/hoy/TodayHub";
import { useOverview } from "@/components/admin/hoy/use-overview";
import { SkeletonEditorial } from "@/components/ui-system";
import { InicioMultiCharts } from "./InicioMultiCharts";
import EmptyDateRangeState from "./EmptyDateRangeState";
import { RitmoDelPeriodo, type DiaDeVenta } from "./resumen/RitmoDelPeriodo";
import { useResumenMulti } from "./resumen/use-resumen-multi";
import { periodoSinVentas } from "@/lib/admin/vista-inicial-inicio";
import { algunDato, hayDatosEnSerie } from "@/lib/admin/inicio/hay-datos";
import { fechaCorta } from "@/lib/admin/inicio/formato-tablero";

/**
 * Debajo del hero de Inicio › Resumen (`TodayHub`): el ritmo del período junto
 * a las alertas, y los bloques de caja, productos, compras, inventario y
 * clientes (`InicioMultiCharts`).
 *
 * Regla de Brandon (2026-10-09): si en el rango no se movió NADA (ventas,
 * pedidos, clientes, plata que entró o salió, compras) la pestaña muestra sólo
 * el estado vacío del paiche con los otros períodos y «Registrar venta manual».
 * Un bloque sin dato se oculta hasta que llegue uno.
 *
 * Lee `/api/admin/overview` con `useOverview` (el mismo pedido que TodayHub,
 * compartido en caché) en vez de un segundo fetch propio.
 */

interface Props {
  dateRange?: DateRange;
  onChangeRange?: (r: DateRange) => void;
  /** Avisa si el período no trae ventas (el Inicio decide su pestaña por defecto). */
  onSinVentas?: (sinVentas: boolean) => void;
}

const RANGO: Record<string, string> = {
  diario: "hoy",
  semanal: "esta semana",
  mensual: "este mes",
  anual: "este año",
  especifica: "ese día",
  personalizado: "el período",
};

export default function InicioDashboardV2({ dateRange, onChangeRange, onSinVentas }: Props) {
  const { data, loading, error } = useOverview(dateRange);
  const resumen = useResumenMulti(dateRange);

  const onSinVentasRef = useRef(onSinVentas);
  onSinVentasRef.current = onSinVentas;
  const total = data?.hero.totalRange ?? data?.hero.totalToday;
  const pedidos = data?.contextual.ordersInRange ?? data?.contextual.ordersToday;
  useEffect(() => {
    if (total === undefined) return;
    onSinVentasRef.current?.(periodoSinVentas(total, pedidos));
  }, [total, pedidos]);

  if ((loading && !data) || resumen.cargando) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonEditorial height={320} rounded="xl" />
          <SkeletonEditorial height={320} rounded="xl" />
        </div>
        <SkeletonEditorial height={360} rounded="xl" />
      </div>
    );
  }

  // Error de red / servidor ≠ «sin datos»: el dueño tiene que saber si reintentar.
  if (error || !data) {
    return (
      <div role="alert" className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-6 text-center dark:bg-[var(--data-error-500)]/10">
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--data-error-500)]">No se pudo cargar el resumen</p>
        <p className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Revisa tu conexión y vuelve a intentarlo.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-error-500)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { hero, contextual } = data;
  const hayAlgo = algunDato([
    hero.totalRange ?? hero.totalToday,
    contextual.ordersInRange ?? contextual.ordersToday,
    contextual.uniqueCustomers,
    contextual.newCustomers,
    resumen.hayMovimientos,
  ]);
  // Si falló la carga de los bloques no se sabe si hubo compras: no es «vacío».
  if (!hayAlgo && !resumen.fallo && dateRange) {
    return (
      <EmptyDateRangeState
        dateRange={dateRange}
        metric="ventas"
        onChangeRange={onChangeRange}
        action={{ label: "Registrar venta manual", href: "/admin?tab=ventas-caja" }}
      />
    );
  }

  const preset = dateRange?.preset ?? "diario";
  const iso = hero.sparklineIso ?? [];
  const labels = hero.sparklineLabels ?? [];
  const porHoras = labels[0]?.endsWith("h") ?? false;
  const dias: DiaDeVenta[] = hero.sparkline.map((ventas, i) => ({
    day: porHoras ? (labels[i] ?? `${i + 1}`) : fechaCorta(iso[i] ?? labels[i]),
    iso: iso[i] ?? "",
    ventas,
  }));
  const hayRitmo = hayDatosEnSerie(dias, ["ventas"]);

  return (
    <div className="space-y-4">
      <div className={hayRitmo ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : undefined}>
        {hayRitmo && <RitmoDelPeriodo dias={dias} rango={RANGO[preset] ?? "el período"} porHoras={porHoras} horaPico={resumen.horaPico} />}
        <DashboardAlertsList dateRange={dateRange} dosColumnas={!hayRitmo} />
      </div>
      {resumen.fallo ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-4">
          <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">
            No se pudieron cargar caja, compras, inventario y clientes.
          </p>
          <button
            type="button"
            onClick={() => void resumen.reintentar()}
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <InicioMultiCharts dateRange={dateRange} resumen={resumen} />
      )}
    </div>
  );
}
