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
import { STATUS_LABELS } from "@/components/admin/OrdersTab/types";
import type { EntregaFicha, RetiroFicha } from "./use-ficha-repartidor";
import Plegable from "@/components/admin/shared/Plegable";

const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });

/** P39: lo que pasó antes de que lo tuviera (no es su recorrido), en una línea. */
function TramosPrevios({ e }: { e: EntregaFicha }) {
  const partes: string[] = [];
  if (e.tramos?.antesDeAsignar != null) partes.push(`asignado ${e.tramos.antesDeAsignar} min después del pedido`);
  if (e.tramos?.esperaRecojo != null) partes.push(`esperó ${e.tramos.esperaRecojo} min para recoger`);
  if (partes.length === 0) return null;
  return (
    <span className="block text-sm font-normal text-[var(--text-tertiary)]" title="No cuenta como su demora: «tardó» mide sólo de recoger a entregar">
      {partes.join(" · ")}
    </span>
  );
}

/** P40: los cambios de estado del pedido con hora y quién, plegados bajo el número, en orden de hora. */
function HistorialPedido({ e }: { e: EntregaFicha }) {
  if (!e.historial?.length) return null;
  const pasos = [
    ...(e.pedidoCreadoAt ? [{ cuando: e.pedidoCreadoAt, que: "Pedido hecho", quien: null, nota: null }] : []),
    { cuando: e.createdAt, que: "Asignado a este repartidor", quien: null, nota: null },
    ...e.historial.map((h) => ({ cuando: h.cuando, que: STATUS_LABELS[h.estado as keyof typeof STATUS_LABELS] ?? h.estado, quien: h.quien, nota: h.nota })),
  ].sort((a, b) => a.cuando.localeCompare(b.cuando));
  return (
    <Plegable clave={`repartidores:historial:${e.id}`} titulo={`Historial (${e.historial.length})`} variante="franja" className="mt-1 text-sm">
      <ol className="space-y-0.5 border-l border-[var(--rule-base)] pl-3">
        {pasos.map((p, i) => (
          <li key={`${p.cuando}-${i}`} className="tabular-nums text-[var(--text-secondary)]">
            {HORA.format(new Date(p.cuando))} · <span className="font-semibold text-[var(--text-primary)]">{p.que}</span>
            {p.quien && ` · ${p.quien === "system" ? "automático" : p.quien}`}
            {p.nota && <span className="block italic">«{p.nota}»</span>}
          </li>
        ))}
      </ol>
    </Plegable>
  );
}

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
                    <HistorialPedido e={e} />
                  </td>
                  <td className="text-center">
                    <span className={cn(CLASE_CHIP, est.className)}>{est.label}</span>
                  </td>
                  <td className="text-right tabular-nums">
                    {e.minutos == null ? (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    ) : (
                      <span className={cn(tardo && "font-bold text-[var(--data-warning-700)]")}>
                        {e.minutos} min de recorrido{tardo && " · tardó"}
                      </span>
                    )}
                    <TramosPrevios e={e} />
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
