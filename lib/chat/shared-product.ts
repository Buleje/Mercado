/**
 * lib/chat/shared-product.ts — "Compartir producto" en el chat (Tanda 2 ·
 * Increment 1, Brandon 2026-06-11).
 *
 * Cuando la tienda comparte un producto en la conversación, se guarda este
 * snapshot CART-READY en `metadataJson.product` del mensaje (sin tocar el enum
 * MessageType ni la base de datos). El comprador lo agrega al carrito directo
 * con estos campos; ambos lados lo renderizan como tarjeta.
 *
 * Es el cimiento del menú "+" de comercio: las demás acciones de la Tanda 2
 * (armar pedido, cobro Yape, sustitución) reusan el mismo patrón de payload.
 */

export interface SharedChatProduct {
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
}

/** Extrae el producto compartido de un metadataJson (o null). */
export function parseSharedProduct(raw: string | null): SharedChatProduct | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as { product?: Record<string, unknown> };
    const p = m.product;
    // El catálogo serializa retailPrice como string (Decimal) → coercionamos.
    const price = Number(p?.price);
    if (!p || typeof p.name !== "string" || !Number.isFinite(price)) return null;
    return {
      storeId: String(p.storeId ?? ""),
      storeName: String(p.storeName ?? ""),
      storeSlug: String(p.storeSlug ?? ""),
      storeProductId: String(p.storeProductId ?? p.productId ?? ""),
      productId: Number(p.productId) || 0,
      name: p.name,
      price,
      image: typeof p.image === "string" ? p.image : null,
      unit: typeof p.unit === "string" ? p.unit : null,
    };
  } catch {
    return null;
  }
}

/** Formato S/ para la tarjeta. */
export function fmtSoles(n: number): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);
}

// ── Cobro Yape/Plin (Tanda 2) ────────────────────────────────────────────────
// SOLICITUD de pago, NO procesamiento. Buleje usa Yape/Plin P2P con confirmación
// MANUAL (no hay gateway). La tarjeta muestra monto + número; el cliente paga en
// su app y marca "Ya pagué". No toca orders/treasury/idempotencia → fuera de la
// zona de peligro de pagos.

export interface ChatPayment {
  amount: number;
  method: "yape" | "plin";
  /** Número/celular a Yapear (lo que el cliente usa para pagar). */
  number: string | null;
  note: string | null;
}

/** Extrae el cobro de un metadataJson (o null). Monto debe ser > 0. */
export function parseChatPayment(raw: string | null): ChatPayment | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as { payment?: Record<string, unknown> };
    const p = m.payment;
    const amount = Number(p?.amount);
    if (!p || !Number.isFinite(amount) || amount <= 0) return null;
    return {
      amount,
      method: p.method === "plin" ? "plin" : "yape",
      number: typeof p.number === "string" && p.number.trim() ? p.number.trim() : null,
      note: typeof p.note === "string" && p.note.trim() ? p.note.trim() : null,
    };
  } catch {
    return null;
  }
}

// ── Sustitución de faltante (Tanda 2) ────────────────────────────────────────
// "No hay X, ¿te mando Y?" → el cliente acepta (agrega Y) o rechaza. Reusa
// SharedChatProduct para el reemplazo (cart-ready).

export interface ChatSubstitution {
  originalName: string;
  replacement: SharedChatProduct;
}

// ── Armar pedido in-chat (Tanda 2) ───────────────────────────────────────────
// La tienda arma un carrito (varios productos + cantidades); el cliente confirma
// y se le agrega TODO al carrito → sigue con el checkout normal. No crea pedido
// directo (eso lo hace el checkout existente).

export interface ChatOrderItem extends SharedChatProduct {
  quantity: number;
}
export interface ChatOrder {
  items: ChatOrderItem[];
  total: number;
}

/** Suma cart-ready de un set de items. */
export function orderTotal(items: ChatOrderItem[]): number {
  return items.reduce((acc, it) => acc + it.price * it.quantity, 0);
}

/** Extrae el pedido armado de un metadataJson (o null). */
export function parseChatOrder(raw: string | null): ChatOrder | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as { order?: { items?: unknown[] } };
    const o = m.order;
    if (!o || !Array.isArray(o.items)) return null;
    const items: ChatOrderItem[] = [];
    for (const it of o.items) {
      const p = parseSharedProduct(JSON.stringify({ product: it }));
      if (!p) continue;
      const quantity = Math.max(1, Math.trunc(Number((it as { quantity?: unknown })?.quantity)) || 1);
      items.push({ ...p, quantity });
    }
    if (items.length === 0) return null;
    return { items, total: orderTotal(items) };
  } catch {
    return null;
  }
}

// ── Pedido de reseña post-entrega (Tanda 4) ──────────────────────────────────
// La tienda pide una reseña cuando el pedido se entregó. El cliente ve una
// tarjeta con estrellas que linkea a la sección de opiniones de la tienda.

export interface ChatReviewRequest {
  storeSlug: string;
  storeName: string | null;
}

/** Extrae el pedido de reseña de un metadataJson (o null). */
export function parseReviewRequest(raw: string | null): ChatReviewRequest | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as { reviewRequest?: Record<string, unknown> };
    const r = m.reviewRequest;
    if (!r || typeof r.storeSlug !== "string" || !r.storeSlug.trim()) return null;
    return {
      storeSlug: r.storeSlug.trim(),
      storeName: typeof r.storeName === "string" && r.storeName.trim() ? r.storeName.trim() : null,
    };
  } catch {
    return null;
  }
}

/** Extrae la sustitución de un metadataJson (o null). */
export function parseSubstitution(raw: string | null): ChatSubstitution | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as { substitution?: { originalName?: unknown; replacement?: unknown } };
    const s = m.substitution;
    if (!s || typeof s.originalName !== "string") return null;
    // Reusa el parser del producto (re-envuelto como { product }).
    const replacement = parseSharedProduct(JSON.stringify({ product: s.replacement }));
    if (!replacement) return null;
    return { originalName: s.originalName, replacement };
  } catch {
    return null;
  }
}
