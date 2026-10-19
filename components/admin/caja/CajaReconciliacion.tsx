"use client";

/**
 * Caja › Historial › Por día: la tendencia de las diferencias, el flujo de
 * EFECTIVO de los últimos 7 días y, por cada día, lo vendido contra el cuadre
 * de sus cajas cerradas (esperado, contado, diferencia). Salió de
 * CashRegisterTab; el 19-10 absorbió «Cierres del día» (venía de Mi Plata y
 * leía un resumen con esperado 0 y contado vacío siempre): la fila del día
 * abre su ficha con fiados, stock bajo y notas.
 *
 * La tabla del día se arma en el servidor (`/api/cash-registers/por-dia`);
 * la tendencia y el flujo de la semana siguen con las cajas ya cargadas.
 */
import { useState, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { CalendarClock, ChevronDown, Download, RefreshCw } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { usePermisoDe } from "@/hooks/use-vistas-permitidas";
import { abrirCierreDiario } from "@/lib/admin/abrir-cierre-diario";
import { exportToExcel } from "@/lib/export-excel";
import { diaLocal, ultimosDiasLocales } from "@/lib/fechas/dia-local";
import { saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import type { DiaDeCaja } from "@/lib/caja/cierres-por-dia";
import { formatWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PartesCabeceraCuadres } from "../CashAuditTab";
import { cierreDeDia, type CierreDelDia } from "../cierres/cierres";
import FichaCierre from "../cierres/FichaCierre";
import { CajaPorDiaTabla } from "./CajaPorDiaTabla";
import { CajaTendencia } from "./CajaTendencia";
import { ORIGEN_VENTAS_DEL_DIA } from "./secciones";
import { fmt, type CashRegister } from "./tipos";
import { useCajaPorDia } from "./use-caja-por-dia";

interface Props {
  cerradas: CashRegister[];
  tolerancia: number;
  /** La cabecera de Caja (título, secciones, «Más»): con ella no va la fila propia. */
  cabecera?: (partes: PartesCabeceraCuadres) => ReactNode;
  /** Los atributos del `tabpanel` de la barra de secciones de Caja. */
  panel?: Record<string, string>;
}

/** Una fila por día para Excel: lo mismo que se ve, sin cuentas nuevas. */
function filaExcel(d: DiaDeCaja, veVentas: boolean): Record<string, unknown> {
  const c = d.cuadre;
  const contadas = c.cajas - c.sinConteo;
  return {
    Fecha: d.dia,
    ...(veVentas && { Vendido: d.ventas.total, Ventas: d.ventas.cantidad, "Ticket promedio": d.ventas.ticket }),
    Cajas: c.cajas,
    "Sin conteo": c.sinConteo,
    Esperado: contadas > 0 ? c.esperado : "",
    Contado: contadas > 0 ? c.contado : "Sin contar",
    Diferencia: contadas > 0 ? c.diferencia : "",
    Faltante: c.faltante,
    Sobrante: c.sobrante,
    ...(veVentas && {
      "Fiados cobrados": d.resumen?.fiadosCobrados ?? "",
      "Fiados nuevos": d.resumen?.fiadosNuevos ?? "",
      Notas: d.resumen?.notas ?? "",
    }),
  };
}

export function CajaReconciliacion({ cerradas, tolerancia, cabecera, panel }: Props) {
  const veVentas = usePermisoDe(ORIGEN_VENTAS_DEL_DIA);
  const { data, cargando, error, recargar, masDias } = useCajaPorDia();
  const [ficha, setFicha] = useState<CierreDelDia | null>(null);

  /* Flujo de EFECTIVO de 7 días: día local (no UTC), sin sumar el fondo de
     apertura como ingreso y sin las ventas de Yape/tarjeta (no pasan por el cajón). */
  const semana = ultimosDiasLocales(7).map((date) => {
    let income = 0;
    let expenses = 0;
    for (const reg of cerradas.filter((r) => diaLocal(r.closedAt ?? r.openedAt) === date)) {
      const s = saldoEsperadoDeCaja(0, reg.movements);
      income += s.ventasEfectivo + s.ingresos;
      expenses += s.egresos;
    }
    return { date, income, expenses, net: income - expenses };
  });
  const entra = semana.reduce((s, d) => s + d.income, 0);
  const sale = semana.reduce((s, d) => s + d.expenses, 0);
  const maxBar = Math.max(...semana.map((d) => Math.max(d.income, d.expenses)), 1);

  const exportar = () => {
    if (!data?.dias.length) return;
    exportToExcel(data.dias.map((d) => filaExcel(d, veVentas)), `caja-por-dia-desde-${data.desde}`, "Caja por día");
  };
  const acciones: MenuAccion[] = [
    { id: "excel", label: "Bajar a Excel", hint: `${data?.dias.length ?? 0} días`, icon: Download, disabled: !data?.dias.length, onSelect: exportar },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: recargar },
  ];
  const cuantos = data && <span className="whitespace-nowrap text-sm text-[var(--text-secondary)]">desde {data.desde.split("-").reverse().join("/")}</span>;
  /* «Cerrar el día» (el resumen a mano con notas) venía con los cierres de Mi Plata. */
  const cerrarElDia = veVentas && (
    <button type="button" onClick={abrirCierreDiario} className={button({ variant: "primary", className: "rounded-xl px-4" })}>
      <CalendarClock className="h-4 w-4" aria-hidden /> Cerrar el día
    </button>
  );

  return (
    <div className="space-y-4">
      {cabecera ? (
        cabecera({ titulo: null, indicadores: <>{cuantos}{cerrarElDia}</>, acciones })
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Caja por día</CardTitle>
          {cuantos}
          <span className="ml-auto">{cerrarElDia}</span>
        </div>
      )}
      <div {...panel} className="space-y-4">
        {cargando && !data ? (
          <TableSkeleton rows={6} cols={5} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" />
        ) : error && !data ? (
          <p role="alert" className="flex items-center gap-2 py-6 text-sm text-[var(--data-error-ink)]">
            No se pudo armar la caja por día.
            <button type="button" onClick={recargar} className={button({ variant: "secondary", className: "rounded-xl" })}>Reintentar</button>
          </p>
        ) : data ? (
          <CajaPorDiaTabla
            dias={data.dias}
            totales={data.totales}
            tolerancia={tolerancia}
            veVentas={veVentas}
            onVer={veVentas ? (d) => setFicha(cierreDeDia(d)) : undefined}
            cargando={cargando}
          />
        ) : null}
        {data && masDias && (
          <button type="button" onClick={masDias} disabled={cargando} className={button({ variant: "ghost", className: "w-full rounded-xl" })}>
            <ChevronDown className="h-4 w-4" aria-hidden /> Ver más días
          </button>
        )}
        <CajaTendencia cerradas={cerradas} />
      <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Flujo de efectivo de la semana</CardTitle>
          <InfoTip what="Sólo lo que entra y sale del cajón: ventas en efectivo + ingresos contra retiros. El fondo de apertura no cuenta como ingreso." />
          <span className="ml-auto flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" aria-hidden />Ingresos</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--data-error-500)]" aria-hidden />Egresos</span>
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-3">
          {semana.map((d) => (
            <div key={d.date} className="flex flex-col items-center min-w-0">
              <div className="w-full h-20 flex items-end justify-center gap-0.5 mb-1">
                <div className="w-2.5 bg-primary rounded-t transition-all" style={{ height: `${(d.income / maxBar) * 80}px` }} title={`Ingresos: ${fmt(d.income)}`} />
                <div className="w-2.5 bg-[var(--data-error-500)] rounded-t transition-all" style={{ height: `${(d.expenses / maxBar) * 80}px` }} title={`Egresos: ${fmt(d.expenses)}`} />
              </div>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">{formatWeekday(d.date + "T12:00:00")}</p>
              <p className={cn("hidden sm:block text-sm font-bold tabular-nums", d.net >= 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{fmt(d.net)}</p>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-[var(--rule-soft)] flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
          <span className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">Ingresos: {fmt(entra)}</span>
          <span className="text-[var(--data-error-500)]">Egresos: {fmt(sale)}</span>
          <span className={entra - sale >= 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"}>Neto: {fmt(entra - sale)}</span>
        </div>
      </section>

      </div>
      {ficha && <FichaCierre cierre={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}
