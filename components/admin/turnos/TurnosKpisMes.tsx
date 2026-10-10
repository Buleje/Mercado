"use client";

/**
 * Indicadores del mes, plegables y recordados (patrón de LothSeccionKpis).
 * Plegado sigue diciendo las cifras en una línea: plegar no es esconder.
 */
import { BarChart3, ChevronDown, Clock, DollarSign, Timer, Trophy } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { duracionHoras, esMesActual, statsPorCajero, type Cajero, type Turno } from "./tipos";

export function TurnosKpisMes({ historial, cajeros }: { historial: Turno[]; cajeros: Cajero[] }) {
  const [abierto, setAbierto] = useLocalStorage<boolean>("turnos-kpis-mes-abierto", false);
  const delMes = historial.filter((t) => esMesActual(t.abrioEn));
  const horas = delMes.reduce((s, t) => s + duracionHoras(t), 0);
  const ventas = delMes.reduce((s, t) => s + t.ventasTotal, 0);
  const porHora = horas > 0 ? ventas / horas : 0;
  const mejor = statsPorCajero(delMes, cajeros).find((c) => c.ventasPorHora > 0) ?? null;

  const kpis = [
    { icono: Clock, rotulo: "Turnos del mes", valor: String(delMes.length) },
    { icono: Timer, rotulo: "Horas trabajadas", valor: `${horas.toFixed(1)} h` },
    { icono: DollarSign, rotulo: "Ventas por hora", valor: formatCurrency(porHora) },
    { icono: Trophy, rotulo: "Mejor por hora", valor: mejor ? mejor.name : "—", extra: mejor ? `${formatCurrency(mejor.ventasPorHora)}/h` : undefined },
  ];

  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex items-center gap-2 min-w-0 flex-1 text-left min-h-9"
        >
          <BarChart3 className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <span className="text-sm font-bold text-[var(--text-primary)] shrink-0">Este mes</span>
          {!abierto && (
            <span className="text-sm text-[var(--text-secondary)] truncate tabular-nums">
              {delMes.length} turnos · {horas.toFixed(1)} h · {formatCurrency(porHora)}/h{mejor ? ` · mejor: ${mejor.name}` : ""}
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 ml-auto text-[var(--text-tertiary)] transition-transform shrink-0", abierto && "rotate-180")} aria-hidden />
        </button>
        <InfoTip
          title="Indicadores del mes"
          what="Salen de los turnos cerrados de este mes: cuántos, horas entre apertura y cierre, ventas entre horas."
          affects="«Mejor por hora» es quien más vendió por hora trabajada, no quien más vendió en total."
        />
      </div>
      {abierto && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 px-3 pb-3">
          {kpis.map((k) => (
            <div key={k.rotulo} className="rounded-lg bg-[var(--surface-sunken)] p-3 min-w-0">
              <p className="flex items-center gap-1.5 text-xs uppercase font-bold text-[var(--text-tertiary)]">
                <k.icono className="h-3.5 w-3.5" aria-hidden />{k.rotulo}
              </p>
              <p className="mt-1 text-xl font-extrabold text-[var(--text-primary)] tabular-nums truncate">{k.valor}</p>
              {k.extra && <p className="text-xs text-[var(--text-tertiary)] tabular-nums">{k.extra}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
