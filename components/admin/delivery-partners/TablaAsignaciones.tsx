"use client";

/**
 * La tabla de Reparto › Asignaciones: qué pedido va con qué repartidor.
 * Sacada de `tabs/AsignacionesTab.tsx` el 17-10.
 *
 * 17-10 (P25): el nombre del repartidor y la fecha salían vacíos — la tabla
 * leía `partnerName` y `assignedAt`, que el servidor nunca manda (manda
 * `partner.name` y `createdAt`). Ahora además sale el cliente del pedido.
 */
import { DataTable } from "@buleje/design-system";
import { AlertCircle, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { toNum } from "@/components/admin/delivery-partners/shared";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { limaDateKey } from "@/lib/utils";

export interface AsignacionFila {
  id: string;
  orderId: string;
  partnerId: string;
  status: string;
  fee: number | string;
  createdAt?: string;
  deliveredAt?: string | null;
  partner?: { id: string; name: string; phone?: string | null } | null;
  order?: { id: string; customerName?: string | null; total?: number | string | null } | null;
  /** Formas viejas, por si algún servidor todavía las manda. */
  partnerName?: string;
  assignedAt?: string;
}

export const ESTADO_ASIGNACION: Record<string, { label: string; className: string }> = {
  assigned: { label: "Pendiente", className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
  accepted: { label: "Aceptado", className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
  picked_up: { label: "Recogido", className: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  in_transit: { label: "En camino", className: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  delivered: {
    label: "Entregado",
    className: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  },
  cancelled: { label: "Cancelado", className: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
  failed: { label: "No se pudo entregar", className: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
};

const nombreDe = (a: AsignacionFila) => a.partner?.name?.trim() || a.partnerName?.trim() || "Repartidor sin nombre";

const etiquetaEstado = (a: AsignacionFila) => ESTADO_ASIGNACION[a.status]?.label ?? a.status;
const diaDe = (a: AsignacionFila) => {
  const fecha = a.createdAt ?? a.assignedAt;
  return fecha ? limaDateKey(fecha) || null : null;
};
const ddmm = (v: number | string) => String(v).split("-").reverse().slice(0, 2).join("/");

/** La lista llega entera de `/api/delivery/assignments`: se filtra en el cliente. */
const COLUMNAS: readonly ColumnaFiltro<AsignacionFila>[] = [
  { id: "pedido", label: "Pedido", tipo: "texto", valor: (a) => [a.orderId, a.order?.customerName ?? ""] },
  { id: "repartidor", label: "Repartidor", tipo: "multi", valor: (a) => nombreDe(a) },
  { id: "tarifa", label: "Tarifa", tipo: "rango", numero: (a) => toNum(a.fee), unidad: "S/", paso: 0.01 },
  { id: "estado", label: "Estado", tipo: "multi", valor: etiquetaEstado, soloConVarios: true },
  { id: "asignado", label: "Asignado", tipo: "fecha", numero: diaDe, formatearValor: ddmm },
];

const ORDEN: Record<string, AccesorOrden<AsignacionFila>> = {
  pedido: { valor: (a) => a.orderId.slice(-8), texto: true },
  repartidor: { valor: nombreDe, texto: true },
  tarifa: { valor: (a) => toNum(a.fee) },
  estado: { valor: etiquetaEstado, texto: true },
  asignado: { valor: (a) => a.createdAt ?? a.assignedAt ?? null },
};

export function TablaAsignaciones({ asignaciones, canceladas }: { asignaciones: AsignacionFila[]; canceladas: number }) {
  const f = useFiltrosTabla(asignaciones, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);
  return (
    <>
      <BarraFiltrosTabla vistas="asignaciones" f={f} className="px-4 pt-2" />
      <div className="overflow-x-auto">
        <DataTable className="w-full">
          <thead>
            <tr>
              <ThColumna label="Pedido" ids={["pedido"]} f={f} orden={ord} ordenId="pedido" />
              <ThColumna label="Repartidor" ids={["repartidor"]} f={f} orden={ord} ordenId="repartidor" />
              <ThColumna label="Tarifa" ids={["tarifa"]} f={f} derecha orden={ord} ordenId="tarifa" />
              <ThColumna label="Estado" ids={["estado"]} f={f} orden={ord} ordenId="estado" />
              <ThColumna label="Asignado" ids={["asignado"]} f={f} derecha className="hidden sm:table-cell" orden={ord} ordenId="asignado" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {filas.length === 0 && <SinCoincidenciasFila colSpan={5} />}
            {filas.map((a) => {
              const sc = ESTADO_ASIGNACION[a.status] ?? {
                label: a.status,
                className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
              };
              const nombre = nombreDe(a);
              const cliente = a.order?.customerName?.trim();
              const fecha = a.createdAt ?? a.assignedAt;
              return (
                <tr key={a.id}>
                  <td>
                    <EnlacePanel cosa="pedido" id={a.orderId} className="block font-mono font-extrabold">
                      #{a.orderId.slice(-8)}
                    </EnlacePanel>
                    {cliente && <span className="block text-sm text-[var(--text-secondary)]">{cliente}</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-[var(--accent-ink)] dark:text-[var(--accent)] text-sm font-extrabold shrink-0">
                        {nombre.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-[var(--text-primary)]">{nombre}</span>
                    </div>
                  </td>
                  <td className="text-right">
                    <span className="font-extrabold text-[var(--text-primary)] tabular-nums">{formatCurrency(toNum(a.fee))}</span>
                  </td>
                  <td className="text-center">
                    <span className={cn("inline-flex items-center px-3 py-1 rounded-full text-sm font-bold", sc.className)}>{sc.label}</span>
                  </td>
                  <td className="text-right text-[var(--text-secondary)] hidden sm:table-cell">
                    <span className="inline-flex items-center justify-end gap-1.5 font-bold">
                      <Clock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                      {fecha ? formatDateTimeShort(fecha) : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
      {canceladas > 0 && (
        <div className="px-6 py-3 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]/50">
          <p className="text-sm text-[var(--text-tertiary)] font-bold">
            <AlertCircle className="inline h-4 w-4 mr-1.5 -mt-0.5 text-[var(--data-error-500)]" aria-hidden />
            {canceladas} {canceladas === 1 ? "asignación cancelada" : "asignaciones canceladas"}
          </p>
        </div>
      )}
    </>
  );
}
