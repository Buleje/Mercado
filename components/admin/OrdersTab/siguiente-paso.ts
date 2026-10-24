/**
 * Qué toca hacer con un pedido, quién lo lleva y cómo está su plata — en UN
 * lugar para la tarjeta del tablero, la Lista y el detalle (PDF 17-10, P03/M49:
 * «conectar cada pedido con su siguiente acción, responsable y dinero»).
 *
 * Antes la tarjeta tenía su tabla (`Confirmar` · `Preparando` · …) y el
 * detalle otra con otros rótulos y otros consejos; el repartidor se leía de
 * `deliveryDriver`, un campo que el servidor nunca guardó (la columna es
 * `riderName`), y la plata era un chip «Con deuda» sin el monto.
 *
 * Sin React y sin `window`: se prueba sola (`__tests__/pedidos-siguiente-paso.test.ts`).
 * No calcula plata: el monto es el `total` que mandó el servidor.
 * No decide transiciones: sólo nombra la que ya permite `lib/order-status.ts`.
 */
import { formatCurrency } from "@/lib/format";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";

/** El botón que lleva el pedido a su paso siguiente. */
export interface SiguientePaso {
  /** Estado al que lo pasa. */
  a: OrderStatus;
  /** Rótulo corto (la tarjeta del tablero mide ~230 px a 1280). */
  corto: string;
  /** Rótulo del detalle. */
  largo: string;
  /** El consejo del paso (va en el ⓘ). */
  ayuda: string;
  /** Pendiente con Yape: confirmar es verificar el pago, no sólo cambiar el estado. */
  verificaYape: boolean;
}

export type TonoCobro = "ok" | "aviso" | "peligro" | "neutro";

/** Color del texto de la plata (tokens del DS) en la Lista, el detalle y Archivados. */
export const TINTA_COBRO: Record<TonoCobro, string> = {
  ok: "text-[var(--data-success-ink)]",
  aviso: "text-[var(--data-warning-ink)]",
  peligro: "text-[var(--data-error-ink)]",
  neutro: "text-[var(--text-secondary)]",
};

/** Cómo está la plata del pedido, en palabras del mostrador. */
export interface Cobro {
  texto: string;
  tono: TonoCobro;
}

type ConRepartidor = DbOrder & { deliveryDriver?: string };

/**
 * Quién lleva el pedido. `riderName` es la columna; `deliveryDriver` es el
 * nombre que el panel mandaba antes y el servidor descartaba (se lee por si
 * algún pedido viejo lo trae en memoria).
 */
export function responsableDe(o: DbOrder): string | null {
  const nombre = (o.riderName ?? (o as ConRepartidor).deliveryDriver ?? "").trim();
  return nombre || null;
}

const EN_MARCHA: ReadonlySet<OrderStatus> = new Set([
  "pendiente",
  "confirmado",
  "preparando",
  "en_camino",
]);

/** Pedido en efectivo que todavía se cobra (el checkout lo marca `deuda: true`). */
export function seCobraAlEntregar(o: DbOrder): boolean {
  return o.paymentMethod === "efectivo" && o.deuda === true;
}

export function siguientePaso(o: DbOrder): SiguientePaso | null {
  const repartidor = responsableDe(o);
  const cobrar = seCobraAlEntregar(o)
    ? ` Cobra ${formatCurrency(Number(o.total))} al entregar.`
    : "";
  switch (o.status) {
    case "pendiente":
      return o.paymentMethod === "yape"
        ? {
            a: "confirmado",
            corto: "Confirmar Yape",
            largo: "Confirmar Yape",
            ayuda: `Mira el comprobante en «Pago»${o.yapeOperationNumber ? ` (Nº Op. ${o.yapeOperationNumber})` : ""} antes de confirmar.`,
            verificaYape: true,
          }
        : {
            a: "confirmado",
            corto: "Confirmar",
            largo: "Confirmar pedido",
            ayuda: "Confírmalo cuando esté listo para preparar.",
            verificaYape: false,
          };
    case "confirmado":
      return {
        a: "preparando",
        corto: "Preparar",
        largo: "Empezar preparación",
        ayuda: "Márcalo cuando empieces a armar el pedido.",
        verificaYape: false,
      };
    case "preparando":
      return {
        a: "en_camino",
        corto: "En camino",
        largo: "Marcar en camino",
        ayuda: repartidor
          ? `Lo lleva ${repartidor}: márcalo cuando salga.${cobrar}`
          : `Asigna un repartidor en «Despacho» y márcalo cuando salga.${cobrar}`,
        verificaYape: false,
      };
    case "en_camino":
      return {
        a: "entregado",
        corto: "Entregado",
        largo: "Marcar entregado",
        ayuda: `Confírmalo cuando el cliente lo reciba.${cobrar}`,
        verificaYape: false,
      };
    default:
      return null;
  }
}

/** La plata del pedido: qué falta cobrar o verificar, o que ya está. */
export function cobroDe(o: DbOrder): Cobro {
  const monto = formatCurrency(Number(o.total));
  const enMarcha = EN_MARCHA.has(o.status);
  if (o.status === "cancelado") return { texto: "Sin cobro", tono: "neutro" };
  switch (o.paymentMethod) {
    case "yape":
    case "plin":
    case "transfer": {
      const medio =
        o.paymentMethod === "yape" ? "Yape" : o.paymentMethod === "plin" ? "Plin" : "Transferencia";
      return o.status === "pendiente"
        ? { texto: `${medio} por verificar`, tono: "aviso" }
        : { texto: `${medio} confirmado`, tono: "ok" };
    }
    case "efectivo":
      if (o.deuda === true) {
        return enMarcha
          ? { texto: `Cobrar ${monto} al entregar`, tono: "aviso" }
          : { texto: `Debe ${monto}`, tono: "peligro" };
      }
      if (o.deuda === false) return { texto: "Efectivo cobrado", tono: "ok" };
      return { texto: enMarcha ? "Efectivo al entregar" : "Efectivo", tono: "neutro" };
    case "fiado":
      return { texto: `Fiado: ${monto} a su cuenta`, tono: "aviso" };
    default:
      return { texto: "Sin medio de pago", tono: "neutro" };
  }
}

/**
 * Lo que impide moverlo sin llamar a nadie: sin teléfono no se coordina, sin
 * dirección no se reparte y «en camino» sin repartidor no tiene quién lo lleve.
 * Sólo de pedidos en marcha.
 */
export function loQueFalta(o: DbOrder): string[] {
  if (!EN_MARCHA.has(o.status)) return [];
  const falta: string[] = [];
  if (!o.customer.phone?.trim()) falta.push("teléfono");
  if (!o.customer.location?.trim()) falta.push("dirección");
  if (o.status === "en_camino" && !responsableDe(o)) falta.push("repartidor");
  return falta;
}
