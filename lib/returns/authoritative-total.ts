/**
 * lib/returns/authoritative-total.ts — anti-fraude de devoluciones.
 *
 * CLAUDE.md regla #6 / danger-zone: el total de una devolución NUNCA se calcula
 * con los precios que manda el cliente (un cajero malicioso o un request forjado
 * podría inflar el crédito otorgado). Esta función resuelve cada item de la
 * devolución contra los items REALES del comprobante original (venta u orden) y
 * computa el total con esos precios autoritativos, validando además que la
 * cantidad no exceda lo vendido.
 *
 * Es una función pura (sin I/O) para poder testearla aislada.
 */

/** Error de validación de devolución → el caller lo mapea a HTTP 400. */
export class ReturnValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnValidationError";
  }
}

/** Item del comprobante original (venta u orden), ya normalizado. */
export interface SourceLineItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
}

/** Item de devolución tal como llega en el request (precio del cliente = ignorado). */
export interface RequestReturnItem {
  productId?: number | null;
  quantity?: number | null;
}

/** Item de devolución resuelto con precio autoritativo del comprobante. */
export interface ResolvedReturnItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
}

/**
 * Resuelve los items de la devolución contra el comprobante original y devuelve
 * los items con precio autoritativo + el total computado en backend.
 *
 * @throws ReturnValidationError si un item no pertenece al comprobante, la
 *         cantidad es <= 0, o excede la cantidad vendida.
 */
export function resolveAuthoritativeReturn(
  sourceItems: SourceLineItem[],
  requestItems: RequestReturnItem[],
): { items: ResolvedReturnItem[]; total: number } {
  const byProduct = new Map<number, SourceLineItem>();
  for (const s of sourceItems) byProduct.set(s.productId, s);

  const items: ResolvedReturnItem[] = [];
  let total = 0;

  for (const req of requestItems) {
    const pid = req.productId;
    if (pid == null) {
      throw new ReturnValidationError("Cada item de devolución requiere productId");
    }
    const orig = byProduct.get(pid);
    if (!orig) {
      throw new ReturnValidationError(`El producto ${pid} no pertenece al comprobante original`);
    }
    const qty = Number(req.quantity) || 0;
    if (qty <= 0) {
      throw new ReturnValidationError(`Cantidad inválida para "${orig.name}"`);
    }
    if (qty > orig.quantity) {
      throw new ReturnValidationError(
        `Cantidad (${qty}) excede lo vendido (${orig.quantity}) para "${orig.name}"`,
      );
    }
    // Precio AUTORITATIVO del comprobante — nunca el del request.
    total += orig.price * qty;
    items.push({ productId: pid, name: orig.name, price: orig.price, quantity: qty, unit: orig.unit });
  }

  return { items, total };
}
