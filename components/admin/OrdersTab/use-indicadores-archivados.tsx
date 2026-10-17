"use client";

/**
 * Los indicadores plegables de Archivados (botón «Indicadores» en la fila de
 * filtros, `useKpisPlegables`). Sólo lo que la Lista y el Tablero no tienen
 * (ellos miran lo que está en marcha): cuánto se entregó, el ticket promedio
 * y cuánto se cayó por cancelación, de lo que filtraste por cliente y fechas.
 */
import { Ban, Receipt, ShoppingBag } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CifrasArchivados } from "./cifras-archivados";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function useIndicadoresArchivados(c: CifrasArchivados) {
  const tarjetas = [
    {
      rotulo: "Entregado",
      valor: formatCurrency(c.vendido),
      pie: plural(c.entregados, "pedido entregado", "pedidos entregados"),
      icono: ShoppingBag,
      ayuda: "Lo que suman los pedidos entregados que ves, según tu búsqueda y fechas.",
      rojo: false,
    },
    {
      rotulo: "Ticket promedio",
      valor: c.ticket == null ? "Sin entregas" : formatCurrency(c.ticket),
      pie: "por pedido entregado",
      icono: Receipt,
      ayuda: "Lo entregado dividido entre los pedidos entregados.",
      rojo: false,
    },
    {
      rotulo: "Cancelados",
      valor: c.tasaCancelados == null ? "Sin pedidos" : `${c.tasaCancelados} %`,
      pie: c.cancelados > 0 ? `${plural(c.cancelados, "pedido", "pedidos")} · ${formatCurrency(c.perdido)} sin concretar` : "ninguno cancelado",
      icono: Ban,
      ayuda: "Qué parte de los pedidos que ves se canceló, y cuánto traían entre todos.",
      rojo: c.cancelados > 0,
    },
  ];

  return useKpisPlegables({
    claveMemoria: "pedidos-archivados",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    resumen:
      c.entregados + c.cancelados === 0
        ? "sin pedidos"
        : formatCurrency(c.vendido),
    tarjetas: tarjetas.map(({ rotulo, valor, pie, icono: Icono, ayuda, rojo }) => (
      <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          <InfoTip what={ayuda} />
        </div>
        <p className={cn("text-lg font-extrabold tabular-nums", rojo ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]")}>{valor}</p>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{pie}</p>
      </div>
    )),
  });
}
