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
