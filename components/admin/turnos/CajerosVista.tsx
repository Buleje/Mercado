"use client";

/**
 * Sub-vista «Cajeros»: el equipo con sus cifras, el ranking y las ventas del
 * mes por cajero. Misma estadística que «Por cajero» del historial (tipos.ts).
 */
import dynamic from "next/dynamic";
import { CardTitle } from "@buleje/design-system";
import { BarChart3, Trophy, User } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DifCaja, Inicial, TurnosPorCajero } from "./TurnosPorCajero";
import { esMesActual, nombreCajero, type Cajero, type StatCajero, type Turno } from "./tipos";

const TurnosChart = dynamic(() => import("../TurnosChart"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-[var(--surface-sunken)] rounded-xl" />,
});

const TITULO_BLOQUE = "text-sm font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2";

export function CajerosVista({ stats, historial, cajeros }: { stats: StatCajero[]; historial: Turno[]; cajeros: Cajero[] }) {
  if (stats.length === 0) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl py-10 px-4 text-center">
        <User className="h-6 w-6 mx-auto mb-2 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">Cierra al menos un turno para ver el equipo y su ranking.</p>
      </div>
    );
  }
  const mejor = stats[0];
  const maxVph = Math.max(...stats.map((c) => c.ventasPorHora), 1);
  const porNombre = new Map<string, number>();
  for (const t of historial.filter((x) => esMesActual(x.abrioEn))) {
    const n = nombreCajero(t, cajeros);
    porNombre.set(n, (porNombre.get(n) ?? 0) + t.ventasTotal);
  }
  const chartData = [...porNombre].map(([name, ventas]) => ({ name, ventas: Math.round(ventas) })).sort((a, b) => b.ventas - a.ventas);

  return (
    <div className="space-y-5">
      <section>
        <CardTitle className={TITULO_BLOQUE}><User className="h-4 w-4 text-primary" aria-hidden />Equipo</CardTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.map((c) => {
            const top = c.id === mejor.id && stats.length > 1;
            return (
              <div key={c.id} className={cn("bg-[var(--surface-raised)] border rounded-xl p-4", top ? "border-[var(--data-warning-500)] ring-1 ring-[var(--data-warning-500)]" : "border-[var(--rule-base)]")}>
                <div className="flex items-center gap-3 mb-3">
                  <Inicial nombre={c.name} tam="h-10 w-10 text-base" />
                  <p className="min-w-0 flex-1 text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span className="truncate">{c.name}</span>
                    {top && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold uppercase text-[var(--text-primary)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15 px-2 py-0.5 rounded shrink-0">
                        <Trophy className="h-3 w-3" aria-hidden />Top
                      </span>
                    )}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-2 mb-3">
                  {([["Turnos", String(c.turnos)], ["Ventas", formatCurrency(c.ventasTotal)], ["Por hora", `${formatCurrency(c.ventasPorHora)}/h`]] as const).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-[var(--text-tertiary)] font-semibold uppercase tracking-wide">{k}</dt>
                      <dd className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">{v}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-xs text-[var(--text-tertiary)] font-semibold uppercase tracking-wide">Dif. caja</dt>
                    <dd className="text-base"><DifCaja valor={c.difCaja} /></dd>
                  </div>
                </dl>
                <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden" aria-hidden>
                  <div className={cn("h-full rounded-full", top ? "bg-[var(--data-warning-500)]" : "bg-primary")} style={{ width: `${Math.max(5, (c.ventasPorHora / maxVph) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <CardTitle className={TITULO_BLOQUE}><Trophy className="h-4 w-4 text-[var(--data-warning-500)]" aria-hidden />Ranking por ventas por hora</CardTitle>
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
          <TurnosPorCajero stats={stats} />
        </div>
      </section>

      {chartData.length > 0 && (
        <section>
          <CardTitle className={TITULO_BLOQUE}><BarChart3 className="h-4 w-4 text-primary" aria-hidden />Ventas por cajero este mes</CardTitle>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
            <TurnosChart chartData={chartData} />
          </div>
        </section>
      )}
    </div>
  );
}
