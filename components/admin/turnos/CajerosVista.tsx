"use client";

/**
 * Sección «Cajeros»: el ranking de todo el historial y las ventas del mes por
 * cajero. Misma estadística que antes (`statsPorCajero` de tipos.ts).
 *
 * Hasta el 10-10 arriba iban tarjetas «Equipo» con turnos, ventas, por hora y
 * diferencia de cada cajero: las mismas cifras del ranking, que además trae el
 * ticket promedio. Quedó la tabla.
 */
import dynamic from "next/dynamic";
import { CardTitle } from "@buleje/design-system";
import { BarChart3, Trophy, User } from "@buleje/design-system/icons";
import { TurnosPorCajero } from "./TurnosPorCajero";
import { esMesActual, nombreCajero, type Cajero, type StatCajero, type Turno } from "./tipos";

const TurnosChart = dynamic(() => import("../TurnosChart"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-[var(--surface-sunken)] rounded-xl" />,
});

const TITULO_BLOQUE = "flex items-center gap-2 px-4 py-3 text-sm font-bold text-[var(--text-primary)] border-b border-[var(--rule-soft)]";
const BLOQUE = "bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden";

export function CajerosVista({ stats, historial, cajeros }: { stats: StatCajero[]; historial: Turno[]; cajeros: Cajero[] }) {
  if (stats.length === 0) {
    return (
      <div className={`${BLOQUE} py-10 px-4 text-center`}>
        <User className="h-6 w-6 mx-auto mb-2 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">Cierra al menos un turno para ver el ranking de tu equipo.</p>
      </div>
    );
  }
  const porNombre = new Map<string, number>();
  for (const t of historial.filter((x) => esMesActual(x.abrioEn))) {
    const n = nombreCajero(t, cajeros);
    porNombre.set(n, (porNombre.get(n) ?? 0) + t.ventasTotal);
  }
  const chartData = [...porNombre].map(([name, ventas]) => ({ name, ventas: Math.round(ventas) })).sort((a, b) => b.ventas - a.ventas);

  return (
    <div className="grid gap-3 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] 2xl:items-start">
      <section className={BLOQUE}>
        <CardTitle className={TITULO_BLOQUE}><Trophy className="h-4 w-4 text-[var(--data-warning-500)]" aria-hidden />Ranking por ventas por hora</CardTitle>
        <TurnosPorCajero stats={stats} />
      </section>

      <section className={BLOQUE}>
        <CardTitle className={TITULO_BLOQUE}><BarChart3 className="h-4 w-4 text-primary" aria-hidden />Ventas por cajero este mes</CardTitle>
        {chartData.length > 0 ? (
          <div className="p-4"><TurnosChart chartData={chartData} /></div>
        ) : (
          <p className="p-6 text-center text-sm text-[var(--text-secondary)]">Este mes todavía no hay turnos cerrados.</p>
        )}
      </section>
    </div>
  );
}
