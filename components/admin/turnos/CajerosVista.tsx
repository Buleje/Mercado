"use client";

/**
 * Sección «Cajeros»: el ranking y las ventas por cajero del período elegido. Misma estadística que antes (`statsPorCajero` de tipos.ts).
 *
 * Hasta el 10-10 arriba iban tarjetas «Equipo» con turnos, ventas, por hora y
 * diferencia de cada cajero: las mismas cifras del ranking, que además trae el
 * ticket promedio. Quedó la tabla.
 *
 * Desde el 11-10, abajo: descuentos y productos quitados del ticket del mes
 * por cajero (`ControlCajerosMes`), con el detalle en el «⋯» de cada fila.
 */
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { BarChart3, Trophy, User } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { TurnosPorCajero } from "./TurnosPorCajero";
import { ControlCajerosMes } from "./ControlCajerosMes";
import { ETIQUETA_ALCANCE, nombreCajero, statsPorCajero, turnosDelAlcance, type AlcanceCajeros, type Cajero, type Turno } from "./tipos";

const TurnosChart = dynamic(() => import("../TurnosChart"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-[var(--surface-sunken)] rounded-xl" />,
});

const TITULO_BLOQUE = "flex items-center gap-2 px-4 py-3 text-sm font-bold text-[var(--text-primary)] border-b border-[var(--rule-soft)]";
const BLOQUE = "bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden";
const SELECT = "h-12 px-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-normal text-[var(--text-primary)]";

/**
 * M20 (17-10): el ranking era de TODO el historial y el gráfico de al lado, del
 * mes; ahora los dos responden al mismo período, elegido y recordado, y cada
 * título lo dice. Los descuentos y quitados de abajo siguen siendo del mes
 * (su título lo dice).
 */
export function CajerosVista({ historial, cajeros }: { historial: Turno[]; cajeros: Cajero[] }) {
  const [alcance, setAlcance] = useLocalStorage<AlcanceCajeros>("turnos:cajeros-alcance", "mes");
  const delAlcance = useMemo(() => turnosDelAlcance(historial, alcance), [historial, alcance]);
  const stats = useMemo(() => statsPorCajero(delAlcance, cajeros), [delAlcance, cajeros]);
  const etiqueta = ETIQUETA_ALCANCE[alcance].toLowerCase();

  if (historial.length === 0) {
    return (
      <div className="grid gap-3">
        <div className={`${BLOQUE} py-10 px-4 text-center`}>
          <User className="h-6 w-6 mx-auto mb-2 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">Cierra al menos un turno para ver el ranking de tu equipo.</p>
        </div>
        <ControlCajerosMes cajeros={cajeros} />
      </div>
    );
  }
  const porNombre = new Map<string, number>();
  for (const t of delAlcance) {
    const n = nombreCajero(t, cajeros);
    porNombre.set(n, (porNombre.get(n) ?? 0) + t.ventasTotal);
  }
  const chartData = [...porNombre].map(([name, ventas]) => ({ name, ventas: Math.round(ventas) })).filter((d) => d.ventas > 0).sort((a, b) => b.ventas - a.ventas);

  return (
    <div className="grid gap-3 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] 2xl:items-start">
      <section className={BLOQUE}>
        <div className={`${TITULO_BLOQUE} flex-wrap py-2`}>
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Trophy className="h-4 w-4 text-[var(--data-warning-500)]" aria-hidden />Ranking por ventas por hora · {etiqueta}
          </CardTitle>
          <select aria-label="Período del ranking y del gráfico" value={alcance} onChange={(e) => setAlcance(e.target.value as AlcanceCajeros)} className={`${SELECT} ml-auto`} data-qa="cajeros-alcance">
            {(Object.keys(ETIQUETA_ALCANCE) as AlcanceCajeros[]).map((a) => <option key={a} value={a}>{ETIQUETA_ALCANCE[a]}</option>)}
          </select>
        </div>
        {stats.length > 0 ? (
          <TurnosPorCajero stats={stats} />
        ) : (
          <p className="p-6 text-center text-sm text-[var(--text-secondary)]">{ETIQUETA_ALCANCE[alcance]} todavía no hay turnos.</p>
        )}
      </section>

      <section className={BLOQUE}>
        <CardTitle className={TITULO_BLOQUE}><BarChart3 className="h-4 w-4 text-primary" aria-hidden />Ventas por cajero · {etiqueta}</CardTitle>
        {chartData.length > 0 ? (
          <div className="p-4"><TurnosChart chartData={chartData} /></div>
        ) : (
          <p className="p-6 text-center text-sm text-[var(--text-secondary)]">{ETIQUETA_ALCANCE[alcance]} todavía no hay turnos cerrados con ventas.</p>
        )}
      </section>

      <ControlCajerosMes cajeros={cajeros} />
    </div>
  );
}
