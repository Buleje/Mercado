"use client";

/**
 * Los cinco números de la flota con el patrón del panel (`useKpisPlegables`):
 * el botón (sólo ícono) va en la fila del hub. Antes eran
 * cinco StatCards siempre abiertas (175 px) antes de la primera máquina.
 */
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { cn } from "@/lib/utils";
import { fmt, type AssetStats } from "./tipos";

interface Tarjeta { rotulo: string; valor: string; detalle: string; clase?: string; onClick?: () => void }

export function useIndicadoresActivos(assets: AssetStats[], onPorCobrar: () => void) {
  const t = assets.reduce(
    (acc, a) => ({ income: acc.income + a.totalIncome, expense: acc.expense + a.totalExpense, profit: acc.profit + a.profit, pending: acc.pending + a.pendingAmount }),
    { income: 0, expense: 0, profit: 0, pending: 0 },
  );
  const tarjetas: Tarjeta[] = [
    { rotulo: "Máquinas", valor: String(assets.length), detalle: `${assets.filter((a) => a.status === "operativo").length} operativas` },
    { rotulo: "Ingresos", valor: fmt(t.income), detalle: "por alquileres" },
    { rotulo: "Gastos", valor: fmt(t.expense), detalle: "combustible y mantenimiento" },
    { rotulo: "Ganancia neta", valor: fmt(t.profit), detalle: "ingresos − gastos", clase: t.profit < 0 ? "text-[var(--data-error-ink)]" : undefined },
    { rotulo: "Por cobrar", valor: fmt(t.pending), detalle: t.pending > 0 ? "ver pendientes" : "todo cobrado", clase: t.pending > 0 ? "text-[var(--data-warning-ink)]" : undefined, onClick: t.pending > 0 ? onPorCobrar : undefined },
  ];

  const kpis = useKpisPlegables({
    claveMemoria: "plata-activos",
    alto: "md",
    anchoFijo: true,
    /* Sólo el ícono: la fila del hub ya lleva las pestañas de Activos, «⋯»,
       «Nuevo activo» y «Opciones»; con el titular partía en dos filas. La
       ganancia de cada máquina está en su tarjeta. */
    soloIcono: true,
    tarjetas: tarjetas.map(({ rotulo, valor, detalle, clase, onClick }) => {
      const cuerpo = (
        <>
          <span className="block text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          <span className={cn("block whitespace-nowrap text-lg font-extrabold tabular-nums text-[var(--text-primary)]", clase)}>{valor}</span>
          <span className="block text-sm text-[var(--text-secondary)]">{detalle}</span>
        </>
      );
      const caja = "block w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-left";
      return onClick ? (
        <button key={rotulo} type="button" onClick={onClick} className={cn(caja, "hover:border-[var(--accent)]")}>{cuerpo}</button>
      ) : (
        <div key={rotulo} className={caja}>{cuerpo}</div>
      );
    }),
  });

  return { ...kpis, totales: t };
}
