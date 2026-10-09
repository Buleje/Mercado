"use client";

import { Package, FileText, TrendingUp, PackageCheck, ChevronDown } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { KPICardOC } from "@/components/admin/ordenes-compra/oc-compartido";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Clave de la preferencia «indicadores abiertos» (ley de la vista: plegables y recordados). */
export const CLAVE_KPIS_OC = "oc:indicadores-abiertos";

/**
 * Indicadores de Órdenes de compra, plegables y recordados. Plegados igual dicen sus cifras en una
 * línea: plegar no es esconder el dato. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero.
 */
export default function OcIndicadores({ oc }: { oc: OrdenesCompra }) {
  const { orders, loading, kpis } = oc;
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_KPIS_OC, false);
  if (loading || orders.length === 0) return null;
  const resumen = [
    `${kpis.total} órdenes`,
    `${kpis.counts.pendiente} pendientes`,
    `${kpis.counts.recibido} recibidas`,
    `S/${formatNumber(kpis.totalMes, { max: 0 })} este mes`,
  ].join(" · ");
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} aria-hidden />
        <span>Indicadores</span>
        {!abierto && <span className="font-normal tabular-nums text-[var(--text-tertiary)]">{resumen}</span>}
      </button>
      {abierto && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICardOC
            label="Total"
            value={kpis.total}
            sub="órdenes registradas"
            icon={FileText}
            accent="neutral"
          />
          <KPICardOC
            label="Pendientes"
            value={kpis.counts.pendiente}
            sub={`${kpis.counts.parcial} parcial${kpis.counts.parcial === 1 ? "" : "es"}`}
            icon={Package}
            accent="warning"
          />
          <KPICardOC
            label="Recibidas"
            value={kpis.counts.recibido}
            sub="cerradas con éxito"
            icon={PackageCheck}
            accent="success"
          />
          <KPICardOC
            label="Total este mes"
            value={`S/${formatNumber(kpis.totalMes, { max: 0 })}`}
            sub={`acum. S/${formatNumber(kpis.totalAcumulado, { max: 0 })}`}
            icon={TrendingUp}
            accent="neutral"
          />
        </div>
      )}
    </section>
  );
}

/** Chips por estado: van pegados al buscador y a la lista que filtran. */
export function OcChipsEstado({ oc }: { oc: OrdenesCompra }) {
  const { orders, loading, statusFilter, setStatusFilter, kpis } = oc;
  return (
    <>
      {/* ─── Filter pills por estado ─────────────────────────────────── */}
      {!loading && orders.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { id: "todas",      label: "Todas",      count: kpis.total,             tone: "neutral" as const },
            { id: "pendiente",  label: "Pendientes", count: kpis.counts.pendiente,  tone: "warning" as const },
            { id: "parcial",    label: "Parciales",  count: kpis.counts.parcial,    tone: "warning" as const },
            { id: "recibido",   label: "Recibidas",  count: kpis.counts.recibido,   tone: "success" as const },
            { id: "cancelado",  label: "Canceladas", count: kpis.counts.cancelado,  tone: "danger"  as const },
          ]).map((p) => {
            const active = statusFilter === p.id;
            const toneCls = {
              neutral: "bg-[var(--text-primary)] text-white border-[var(--text-primary)]",
              danger:  "bg-[var(--data-error-500)] text-white border-[var(--data-error-500)]",
              warning: "bg-[var(--data-warning-500)] text-white border-[var(--data-warning-500)]",
              success: "bg-[var(--data-success-500)] text-white border-[var(--data-success-500)]",
            }[p.tone];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setStatusFilter(p.id as typeof statusFilter)}
                className={cn(
                  "inline-flex items-center gap-2 h-11 px-4 rounded-2xl text-sm font-semibold transition-colors border-2",
                  active
                    ? toneCls
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]",
                )}
              >
                {p.label}
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums min-w-[24px] text-center",
                  active ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                )}>
                  {p.count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
