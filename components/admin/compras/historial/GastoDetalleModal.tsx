"use client";

/**
 * GastoDetalleModal — la ficha de un movimiento.
 *
 * El historial era de sólo lectura y ni siquiera dejaba ver la fila entera: la
 * descripción se cortaba con `truncate` y el método de pago, la frecuencia o el
 * proveedor vivían escondidos dentro del bloque serializado de la descripción.
 * Acá se abre todo, incluido cuánto queda por pagar.
 */

import AdminModal from "@/components/admin/shared/AdminModal";
import { FREQUENCY_LABELS, PAYMENT_METHOD_LABELS, formatPaymentDay } from "@/lib/expense-meta";
import { ESTADO_PAGO_LABELS, fmt, formatDate, type HistorialItem } from "./shared";

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-0.5 break-words text-base text-[var(--text-primary)]">{valor}</dd>
    </div>
  );
}

export default function GastoDetalleModal({
  item, onClose,
}: {
  item: HistorialItem | null;
  onClose: () => void;
}) {
  if (!item) return null;

  const porPagar = Math.round((item.amount - item.montoPagado) * 100) / 100;
  const meta = item.meta ?? {};
  const diaPago = formatPaymentDay(meta);

  return (
    <AdminModal
      open={Boolean(item)}
      onClose={onClose}
      variant="wide"
      title={item.description || "Movimiento sin descripción"}
    >
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Dato label="Fecha" valor={formatDate(item.fecha)} />
        <Dato label="Origen" valor={item.source === "expense" ? "Gasto operativo" : "Compra a proveedor"} />
        <Dato label="Categoría" valor={item.category} />
        {item.supplierName && <Dato label="Proveedor" valor={item.supplierName} />}
        <Dato label="Monto" valor={fmt(item.amount)} />
        <Dato label="Estado de pago" valor={ESTADO_PAGO_LABELS[item.estadoPago]} />
        {item.estadoPago !== "pagado" && (
          <>
            <Dato label="Pagado" valor={fmt(item.montoPagado)} />
            <Dato label="Queda por pagar" valor={fmt(porPagar)} />
          </>
        )}
        {item.descuento != null && <Dato label="Descuento de la orden" valor={fmt(item.descuento)} />}
        {meta.frequency && <Dato label="Frecuencia" valor={FREQUENCY_LABELS[meta.frequency]} />}
        {diaPago && <Dato label="Día de pago" valor={diaPago} />}
        {meta.paymentMethod && <Dato label="Método de pago" valor={PAYMENT_METHOD_LABELS[meta.paymentMethod]} />}
        {meta.notes && <Dato label="Notas" valor={meta.notes} />}
      </dl>

      {item.estadoPago === "sin_registro" && (
        <p className="mt-4 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          Esta orden no tiene una cuenta por pagar asociada, así que el sistema no sabe si ya se pagó.
          No es lo mismo que estar pendiente.
        </p>
      )}

      {item.source === "purchase" && (
        <div className="mt-5 flex justify-end">
          <a
            href="?tab=compras&vista=ordenes-compra"
            className="inline-flex h-11 items-center rounded-lg border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Ver en Órdenes
          </a>
        </div>
      )}
    </AdminModal>
  );
}
