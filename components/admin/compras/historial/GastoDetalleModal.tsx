"use client";

/**
 * GastoDetalleModal — la ficha de un movimiento.
 *
 * El historial junta plata de cinco módulos distintos y esta ficha decía saber
 * de dos: preguntaba `source === "expense" ? "Gasto operativo" : "Compra a
 * proveedor"`, así que la ficha de un adelanto al personal afirmaba, en el
 * renglón «Origen», ser una compra a proveedor — y llamaba «Proveedor» a la
 * persona que se llevó la plata.
 *
 * Además era una lista plana de ocho datos del mismo tamaño: el monto —lo único
 * que se viene a mirar— empataba con la categoría, y nada explicaba por qué ese
 * movimiento no aparece en «Total gastado» aunque la caja lo haya pagado.
 */

import AdminModal from "@/components/admin/shared/AdminModal";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { ArrowUpRight, Copy, Info, Pencil, Undo2 } from "@buleje/design-system/icons";
import { FREQUENCY_LABELS, PAYMENT_METHOD_LABELS, formatPaymentDay } from "@/lib/expense-meta";
import HistorialDeCambios from "./HistorialDeCambios";
import { SOURCE_META } from "./fuentes";
import {
  CLASE_MOTIVO, ESTADO_PAGO_LABELS, ORIGEN_LABELS,
  fmt, formatDate, type EstadoPago, type HistorialItem,
} from "./shared";

const ESTADO_VARIANTE: Record<EstadoPago, "success" | "warning" | "error" | "neutral"> = {
  pagado: "success",
  parcial: "warning",
  pendiente: "error",
  sin_registro: "neutral",
};

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-0.5 break-words text-base text-[var(--text-primary)]">{valor}</dd>
    </div>
  );
}

/** Un aviso de contexto: no es un error, es algo que hay que saber leyendo la ficha. */
function Nota({
  icono: Icono, children, tono = "neutro",
}: {
  icono: typeof Info;
  children: React.ReactNode;
  tono?: "neutro" | "aviso";
}) {
  return (
    <div
      className={
        tono === "aviso"
          ? "flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2.5"
          : "flex items-start gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5"
      }
    >
      <Icono
        className={
          tono === "aviso"
            ? "mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]"
            : "mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]"
        }
        aria-hidden
      />
      <p className="text-sm text-[var(--text-primary)]">{children}</p>
    </div>
  );
}

export default function GastoDetalleModal({
  item, onEditar, onClose,
}: {
  item: HistorialItem | null;
  /** Sólo se ofrece para gastos operativos: el resto vive en otro módulo. */
  onEditar: (item: HistorialItem) => void;
  onClose: () => void;
}) {
  if (!item) return null;

  const meta = item.meta ?? {};
  const fuente = SOURCE_META[item.source];
  const porPagar = Math.round((item.amount - item.montoPagado) * 100) / 100;
  const diaPago = formatPaymentDay(meta);
  const motivoFueraDelTotal = CLASE_MOTIVO[item.clase];
  // El estado de pago sólo informa donde puede haber deuda. En un gasto
  // operativo o un adelanto siempre dice «Pagado»: es ruido que compite con el
  // monto.
  const muestraEstado = item.estadoPago !== "pagado"
    || item.source === "purchase" || item.source === "flete";
  const pctPagado = item.amount > 0
    ? Math.min(Math.round((item.montoPagado / item.amount) * 100), 100)
    : 0;

  return (
    <AdminModal
      open={Boolean(item)}
      onClose={onClose}
      variant="wide"
      icon={fuente.icon}
      title={item.description || "Movimiento sin descripción"}
      description={`${ORIGEN_LABELS[item.source]} · ${formatDate(item.fecha)}`}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3">
          {/* Un gasto operativo se corrige acá porque acá es donde vive. Una
              compra, un flete o un adelanto son un reflejo de otro módulo:
              editarlos por este lado dejaría los dos lados en desacuerdo. */}
          {item.source === "expense" && (
            <button
              type="button"
              onClick={() => onEditar(item)}
              className="mr-auto inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Corregir
            </button>
          )}
          {fuente.destino && (
            <a
              href={fuente.destino.href}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-primary/40 hover:text-primary"
            >
              {fuente.destino.label}
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary/90"
          >
            Cerrar
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        {/* El monto es lo que se viene a ver: va solo, grande y con su estado
            al lado, en vez de empatado con la categoría en una lista plana. */}
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3.5">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {item.clase === "gasto" ? "Monto del gasto" : "Salió de la caja"}
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">
                {fmt(item.amount)}
              </p>
            </div>
            {muestraEstado && (
              <StatusBadge
                variant={ESTADO_VARIANTE[item.estadoPago]}
                label={ESTADO_PAGO_LABELS[item.estadoPago]}
              />
            )}
          </div>

          {/* Un «pago parcial» sin decir cuánto obliga a restar de memoria. */}
          {item.estadoPago === "parcial" && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
                <div
                  className="h-full rounded-full bg-[var(--data-warning-500)]"
                  style={{ width: `${pctPagado}%` }}
                />
              </div>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                Pagado <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(item.montoPagado)}</span>
                {" "}de {fmt(item.amount)} · queda{" "}
                <span className="font-bold tabular-nums text-[var(--data-warning-ink)]">{fmt(porPagar)}</span>
              </p>
            </div>
          )}

          {item.estadoPago === "pendiente" && (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Recibido y sin cancelar: queda por pagar{" "}
              <span className="font-bold tabular-nums text-[var(--data-warning-ink)]">{fmt(porPagar)}</span>.
            </p>
          )}
        </div>

        {/* Por qué este movimiento no está en «Total gastado». */}
        {motivoFueraDelTotal && <Nota icono={Info}>{motivoFueraDelTotal}</Nota>}

        {/* Lo que el adelanto todavía no devolvió. Antes viajaba pegado al
            código dentro de la descripción, sin siquiera el signo de soles. */}
        {item.saldoPendiente != null && item.saldoPendiente > 0 && (
          <Nota icono={Undo2} tono="aviso">
            <span className="font-bold">Queda por devolver {fmt(item.saldoPendiente)}</span>
            {item.supplierName ? <> — {item.supplierName} todavía no devolvió esa parte.</> : "."}
          </Nota>
        )}

        {item.duplicaDe && (
          <Nota icono={Copy}>
            La misma salida ya está listada como{" "}
            <span className="font-bold">{item.duplicaDe}</span>. Es un solo movimiento de plata
            con dos rastros — no lo cuentes dos veces.
          </Nota>
        )}

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Dato label="Fecha" valor={formatDate(item.fecha)} />
          <Dato label="Origen" valor={ORIGEN_LABELS[item.source]} />
          <Dato label="Categoría" valor={item.category} />
          {/* Un adelanto no tiene proveedor: tiene beneficiario. */}
          {item.supplierName && <Dato label={fuente.contraparte} valor={item.supplierName} />}
          {item.descuento != null && <Dato label="Descuento de la orden" valor={fmt(item.descuento)} />}
          {meta.frequency && <Dato label="Frecuencia" valor={FREQUENCY_LABELS[meta.frequency]} />}
          {diaPago && <Dato label="Día de pago" valor={diaPago} />}
          {meta.paymentMethod && <Dato label="Método de pago" valor={PAYMENT_METHOD_LABELS[meta.paymentMethod]} />}
          {meta.notes && <Dato label="Notas" valor={meta.notes} />}
        </dl>

        {item.estadoPago === "sin_registro" && (
          <Nota icono={Info}>
            Esta orden no tiene una cuenta por pagar asociada, así que el sistema no sabe si ya se
            pagó. No es lo mismo que estar pendiente.
          </Nota>
        )}

        {/* Quién tocó este gasto y qué cambió. Sólo para gastos operativos:
            son los únicos que se pueden corregir desde acá. */}
        {item.source === "expense" && <HistorialDeCambios refId={item.refId} />}
      </div>
    </AdminModal>
  );
}
