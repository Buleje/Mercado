"use client";

/**
 * Los registros de la ficha del repartidor (17-10, P24/P42): sus entregas con
 * el pedido enlazado (atrasos y fallos a la vista) y sus retiros. Sólo lectura.
 */
import { CardTitle, DataTable } from "@buleje/design-system";
import { CLASE_CHIP } from "@/components/admin/rrhh/rrhh-form";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { ChipEstadoRetiro } from "@/components/admin/repartidores/retiros-estado";
import { ESTADO_ASIGNACION } from "./TablaAsignaciones";
import { ESTADOS_NO_ENTREGADA, MINUTOS_ENTREGA_LENTA } from "@/lib/delivery/ficha-repartidor";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EntregaFicha, RetiroFicha } from "./use-ficha-repartidor";

/** Una entrega es incidencia si no se entregó o si tardó más de lo normal. */
export function esIncidencia(e: EntregaFicha): boolean {
  return (ESTADOS_NO_ENTREGADA as readonly string[]).includes(e.status) || (e.minutos != null && e.minutos > MINUTOS_ENTREGA_LENTA);
}

export function TablaEntregasFicha({ entregas, total }: { entregas: EntregaFicha[]; total: number }) {
  if (entregas.length === 0) {
    return <p className="text-sm text-[var(--text-tertiary)]">Nada que mostrar en este período.</p>;
  }
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <DataTable className="w-full">
          <thead>
            <tr>
              <th>Asignado</th>
              <th>Pedido</th>
              <th className="text-center">Estado</th>
              <th className="text-right">Tiempo</th>
              <th className="text-right">Ganó</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {entregas.map((e) => {
              const est = ESTADO_ASIGNACION[e.status] ?? { label: e.status, className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
              const tardo = e.minutos != null && e.minutos > MINUTOS_ENTREGA_LENTA;
              const gano = e.status === "delivered" ? e.fee + e.propina : 0;
              return (
                <tr key={e.id} data-qa="ficha-entrega">
                  <td className="whitespace-nowrap tabular-nums">{formatDateTimeShort(e.createdAt)}</td>
                  <td>
                    <EnlacePanel cosa="pedido" id={e.orderId} className="font-mono font-bold">
                      #{e.orderId.slice(-8)}
                    </EnlacePanel>
                    {e.cliente && <span className="block text-sm text-[var(--text-secondary)]">{e.cliente}</span>}
                  </td>
                  <td className="text-center">
                    <span className={cn(CLASE_CHIP, est.className)}>{est.label}</span>
                  </td>
                  <td className="text-right tabular-nums">
                    {e.minutos == null ? (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    ) : (
                      <span className={cn(tardo && "font-bold text-[var(--data-warning-700)]")}>
                        {e.minutos} min{tardo && " · tardó"}
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {e.status === "delivered" ? (
                      <>
                        <span className="font-semibold">{formatCurrency(gano)}</span>
                        {e.propina > 0 && (
                          <span className="block text-sm text-[var(--text-tertiary)]">incluye {formatCurrency(e.propina)} de propina</span>
                        )}
                      </>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="max-w-xs text-sm text-[var(--text-secondary)]">{e.notes?.trim() || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
      {total > entregas.length && (
        <p className="text-sm text-[var(--text-tertiary)]">
          Se muestran las {entregas.length} más recientes de {total}: las cifras de arriba cuentan todas.
        </p>
      )}
    </div>
  );
}

export function TablaRetirosFicha({ retiros }: { retiros: RetiroFicha[] }) {
  return (
    <section className="space-y-2" aria-labelledby="ficha-retiros" id="ficha-retiros-lista">
      <CardTitle id="ficha-retiros">Retiros que pidió en el período</CardTitle>
      {retiros.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">No pidió retiros en este período.</p>
      ) : (
        <div className="overflow-x-auto">
          <DataTable className="w-full">
            <thead>
              <tr>
                <th>Pidió</th>
                <th className="text-center">Estado</th>
                <th className="text-right">Monto</th>
                <th>Resuelto</th>
              </tr>
            </thead>
            <tbody>
              {retiros.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap tabular-nums">{formatDateTimeShort(r.createdAt)}</td>
                  <td className="text-center">
                    <ChipEstadoRetiro status={r.status} />
                  </td>
                  <td className="text-right font-semibold tabular-nums">{formatCurrency(r.amount)}</td>
                  <td className="whitespace-nowrap tabular-nums">{r.resolvedAt ? formatDateTimeShort(r.resolvedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </section>
  );
}
