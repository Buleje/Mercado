/**
 * cart-sharing.ts
 * Serializa / deserializa el carrito del marketplace a/desde un token URL-safe.
 *
 * Formato: base64url( JSON.stringify(ShareableCartItem[]) )
 * Se usa URL param: /marketplace?cart=<token>
 */

import { z } from "zod";
import type { CartItem } from "@/hooks/use-marketplace-cart";

// ---------- tipos públicos ----------

export interface ShareableCartItem {
  p: number;   // productId
  s: string;   // storeSlug
  q: number;   // quantity
}

// ---------- Zod schema ----------

const ShareableCartItemSchema = z.object({
  p: z.number().int().positive(),
  s: z.string().min(1).max(200),
  q: z.number().int().positive().max(9999),
});

const ShareableCartSchema = z.array(ShareableCartItemSchema);

// ---------- helpers base64url ----------

/** Convierte string a base64url (sin +, /, =) */
function toBase64Url(str: string): string {
  if (typeof window !== "undefined") {
    // Browser
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  // Node.js (SSR / tests)
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decodifica base64url a string */
function fromBase64Url(encoded: string): string {
  // Restaurar padding y caracteres estándar
  const base64 = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  if (typeof window !== "undefined") {
    // Browser
    try {
      return decodeURIComponent(escape(atob(padded)));
    } catch {
      return "";
    }
  }
  // Node.js
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

// ---------- API pública ----------

/**
 * Serializa los items del carrito a un token URL-safe.
 * Solo incluye los campos mínimos (productId, storeSlug, quantity)
 * para mantener la URL corta.
 */
export function serializeCart(items: CartItem[]): string {
  const payload: ShareableCartItem[] = items.map((item) => ({
    p: item.productId,
    s: item.storeSlug,
    q: item.quantity,
  }));
  return toBase64Url(JSON.stringify(payload));
}

/**
 * Deserializa un token URL de vuelta a items compartibles.
 * Retorna [] ante cualquier error (base64 inválido, JSON roto, campos inválidos).
 * Nunca lanza excepción — seguro para input no confiable.
 */
export function deserializeCart(encoded: string): ShareableCartItem[] {
  if (!encoded || typeof encoded !== "string") return [];

  try {
    const json = fromBase64Url(encoded);
    if (!json) return [];

    const parsed: unknown = JSON.parse(json);
    const result = ShareableCartSchema.safeParse(parsed);
    if (!result.success) return [];

    return result.data;
  } catch {
    return [];
  }
}
