"use client";

/**
 * Los cuatro números del mes (turnos, horas, ventas por hora y el mejor por
 * hora) con el patrón de indicadores del panel (`useKpisPlegables`): el botón
 * va en la fila del título y, plegado, lleva el titular adentro.
 *
 * Reemplaza a la barra «Este mes» (una fila entera para el botón). Mismas
 * cuentas que antes, de los turnos cerrados del mes.
 */
import { Clock, DollarSign, Timer, Trophy } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { duracionHoras, esMesActual, statsPorCajero, type Cajero, type Turno } from "./tipos";

export function useIndicadoresTurnos(historial: Turno[], cajeros: Cajero[]) {
  const delMes = historial.filter((t) => esMesActual(t.abrioEn));
  const horas = delMes.reduce((s, t) => s + duracionHoras(t), 0);
  const ventas = delMes.reduce((s, t) => s + t.ventasTotal, 0);
  const porHora = horas > 0 ? ventas / horas : 0;
  const mejor = statsPorCajero(delMes, cajeros).find((c) => c.ventasPorHora > 0) ?? null;

  const tarjetas = [
    { icono: Clock, rotulo: "Turnos del mes", valor: String(delMes.length) },
    { icono: Timer, rotulo: "Horas trabajadas", valor: `${horas.toFixed(1)} h` },
    { icono: DollarSign, rotulo: "Ventas por hora", valor: formatCurrency(porHora) },
    {
      icono: Trophy,
      rotulo: "Mejor por hora",
      valor: mejor ? mejor.name : "—",
      extra: mejor ? `${formatCurrency(mejor.ventasPorHora)}/h` : undefined,
      ayuda: "Quien más vendió por hora trabajada este mes, no quien más vendió en total.",
    },
  ];

  return useKpisPlegables({
    claveMemoria: "turnos-mes",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    resumen: `${delMes.length} ${delMes.length === 1 ? "turno" : "turnos"} · ${formatCurrency(porHora)}/h`,
    tarjetas: tarjetas.map(({ icono: Icono, rotulo, valor, extra, ayuda }) => (
      <div key={rotulo} className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          {ayuda && <InfoTip what={ayuda} />}
        </div>
        <p className="truncate text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</p>
        {extra && <p className="text-sm tabular-nums text-[var(--text-secondary)]">{extra}</p>}
      </div>
    )),
  });
}
