/**
 * lib/chat/order-context.ts — Tanda 4 · Contexto del pedido fijado (Brandon
 * 2026-06-11).
 *
 * Cuando un hilo nació de un pedido (thread.orderId), tanto el cliente como la
 * tienda ven una tarjeta FIJA arriba con el estado + items + total del pedido
 * del que están hablando. Estilo Mercado Libre / Rappi: nadie pregunta "¿de
 * qué pedido hablás?".
 *
 * El tipo lo comparten los componentes cliente; `buildOrderContext` corre en el
 * servidor sobre un DbOrder (acepta un shape estructural → sin acoplar al import
 * de orders.db, seguro en bundles de cliente).
 */

/** Shape mínimo que necesita buildOrderContext (DbOrder lo cumple). */
interface OrderLike {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  items: Array<{ name: string; quantity: number }>;
}

export interface ChatOrderContextItem {
  name: string;
  quantity: number;
}

export interface ChatOrderContext {
  id: string;
  /** Código corto para mostrar (#ABC123 — últimos 6 del id). */
  shortCode: string;
  status: string;
  total: number;
  itemCount: number;
  /** Primeros items para el preview (máx 4). */
  items: ChatOrderContextItem[];
  createdAt: string;
}

/** Etiqueta legible + color del estado del pedido. */
export const ORDER_STATUS_META: Record<string, { label: string; chip: string }> = {
  pendiente:   { label: "Pendiente",   chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" },
  confirmado:  { label: "Confirmado",  chip: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
  preparando:  { label: "Preparando",  chip: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
  en_camino:   { label: "En camino",   chip: "bg-primary/15 text-primary" },
  entregado:   { label: "Entregado",   chip: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" },
  cancelado:   { label: "Cancelado",   chip: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" },
};

export function orderStatusMeta(status: string): { label: string; chip: string } {
  return (
    ORDER_STATUS_META[status] ?? {
      label: status,
      chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    }
  );
}

/** Construye el contexto liviano (server) a partir de un DbOrder. */
export function buildOrderContext(order: OrderLike): ChatOrderContext {
  const items = order.items.map((i) => ({ name: i.name, quantity: i.quantity }));
  return {
    id: order.id,
    shortCode: order.id.slice(-6).toUpperCase(),
    status: order.status,
    total: order.total,
    itemCount: items.reduce((a, i) => a + i.quantity, 0),
    items: items.slice(0, 4),
    createdAt: order.createdAt,
  };
}

/** Parsea el contexto del pedido de una respuesta de API (cliente). */
export function parseOrderContext(raw: unknown): ChatOrderContext | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.total !== "number") return null;
  const items = Array.isArray(o.items)
    ? o.items
        .filter((it): it is { name: string; quantity: number } =>
          !!it && typeof (it as ChatOrderContextItem).name === "string")
        .map((it) => ({ name: it.name, quantity: Number(it.quantity) || 1 }))
    : [];
  return {
    id: o.id,
    shortCode: typeof o.shortCode === "string" ? o.shortCode : o.id.slice(-6).toUpperCase(),
    status: typeof o.status === "string" ? o.status : "pendiente",
    total: o.total,
    itemCount: typeof o.itemCount === "number" ? o.itemCount : items.reduce((a, i) => a + i.quantity, 0),
    items: items.slice(0, 4),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
  };
}
