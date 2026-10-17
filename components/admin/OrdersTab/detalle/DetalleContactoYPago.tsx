/**
 * Contacto y entrega (teléfono, dirección, nota del cliente) y el Pago del
 * detalle del pedido. Salieron de `OrdersDetailPanel.tsx` al partirlo (10-10).
 *
 * Pago ya no repite el medio en un chip: lo dice la cabecera («· Efectivo»).
 * Quedan el comprobante (Yape/Plin/transferencia), el Nº de operación y la
 * deuda con su «Marcar cobrado».
 */
import { CardTitle } from "@buleje/design-system";
import { CalendarClock, Check, ExternalLink, MapPin, MessageCircle, Phone } from "@buleje/design-system/icons";
import { PaymentProofViewer } from "@/components/admin/PaymentProofViewer";
import type { DbOrder } from "@/lib/jsondb";
import { googleMapsUrl } from "@/lib/order-utils";
import { diaRelativo, textoFranja } from "@/lib/pedidos/franja-entrega";
import type { EntregaPrep } from "@/lib/pedidos/preparacion";
import { limaDateKey } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { usePermisosPedidos } from "../permisos-pedidos";

const BOTON =
  button({ variant: "secondary", className: "shrink-0 rounded-xl" });

const EN_MARCHA = new Set(["pendiente", "confirmado", "preparando", "en_camino"]);

/**
 * El día y la franja que eligió el cliente al pagar (17-10, `DeliverySlot`):
 * «Hoy · de 14:00 a 16:00». Si el día ya pasó y el pedido sigue en marcha, lo dice.
 */
function EntregaPedida({ entrega, estado }: { entrega: EntregaPrep; estado: string }) {
  const atrasado = entrega.fecha < limaDateKey(new Date()) && EN_MARCHA.has(estado);
  // Día a mano sin hora ni franja: sólo el día (no «Sin franja»).
  const hora = entrega.nota ?? (entrega.franja ? textoFranja(entrega.franja) : null);
  return (
    <div className="flex items-center gap-2 border-t border-[var(--rule-soft)] px-4 py-2">
      <CalendarClock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
        Lo pidió para{" "}
        <span className="font-semibold text-[var(--text-primary)]">{diaRelativo(entrega.fecha).toLowerCase()}</span>
        {hora && ` · ${hora}`}
        {atrasado && <span className="ml-1.5 font-semibold text-[var(--data-error-ink)]">· atrasado</span>}
      </p>
    </div>
  );
}

export function DetalleContacto({ order, entrega = null }: { order: DbOrder; entrega?: EntregaPrep | null }) {
  const phone = order.customer.phone ?? "";
  const digitos = phone.replace(/\D+/g, "");
  return (
    <section className="space-y-2">
      <CardTitle className="text-sm font-bold">Contacto y entrega</CardTitle>
      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {phone && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] px-4 py-2">
            <Phone
              className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
              strokeWidth={2}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-[var(--text-primary)]">
              {phone}
            </span>
            <a href={`tel:${digitos}`} className={BOTON}>
              <Phone className="h-4 w-4" aria-hidden /> Llamar
            </a>
            <a
              href={`https://wa.me/${digitos}?text=${encodeURIComponent(`Hola ${order.customer.name}, sobre tu pedido #${order.id.slice(-8)}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/10 px-3 text-sm font-semibold text-[var(--data-success-ink)] transition-colors hover:bg-[var(--data-success-500)]/15"
            >
              <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
            </a>
          </div>
        )}
        <div className="flex items-start gap-2 px-4 py-2">
          <MapPin
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
            strokeWidth={2}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {order.customer.location}
            </p>
            {order.customer.reference && (
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                Ref: {order.customer.reference}
              </p>
            )}
          </div>
          <a
            href={googleMapsUrl(order.customer.location)}
            target="_blank"
            rel="noopener noreferrer"
            className={BOTON}
          >
            <ExternalLink className="h-4 w-4" aria-hidden /> Mapa
          </a>
        </div>
        {entrega && <EntregaPedida entrega={entrega} estado={order.status} />}
        {order.notes && (
          <div className="border-t border-[var(--rule-soft)] bg-primary/10 px-4 py-2">
            <p className="text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
              Nota del cliente
            </p>
            <p className="text-sm italic text-[var(--text-primary)]">“{order.notes}”</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function DetallePago({
  order,
  onMarkDeudaPaid,
}: {
  order: DbOrder;
  onMarkDeudaPaid: (id: string) => void;
}) {
  const { mover } = usePermisosPedidos();
  const conComprobante = !!order.paymentMethod && order.paymentMethod !== "efectivo";
  const efectivo = order.paymentMethod === "efectivo";
  const conFila = !!order.yapeOperationNumber || (efectivo && order.deuda !== undefined);
  if (!conComprobante && !conFila) return null;
  return (
    <section className="space-y-2">
      <CardTitle className="text-sm font-bold">Pago</CardTitle>
      {conComprobante && <PaymentProofViewer orderId={order.id} />}
      {conFila && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5">
          {order.yapeOperationNumber && (
            <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
              Nº Op. {order.yapeOperationNumber}
            </span>
          )}
          {efectivo && order.deuda === true && (
            <>
              <span className="inline-flex rounded-full border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-2 py-0.5 text-sm font-bold text-[var(--data-error-ink)]">
                Deuda pendiente
              </span>
              {mover && (
              <button
                type="button"
                onClick={() => onMarkDeudaPaid(order.id)}
                className="ml-auto inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/10 px-3 text-sm font-semibold text-[var(--data-success-ink)] transition-colors hover:bg-[var(--data-success-500)]/15"
              >
                <Check className="h-4 w-4" aria-hidden /> Marcar cobrado
              </button>
              )}
            </>
          )}
          {efectivo && order.deuda === false && (
            <span className="inline-flex rounded-full border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/10 px-2 py-0.5 text-sm font-bold text-[var(--data-success-ink)]">
              Cobrado
            </span>
          )}
        </div>
      )}
    </section>
  );
}
