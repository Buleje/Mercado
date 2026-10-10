import { NextResponse, type NextRequest } from "next/server";
import { ReturnsDB, InventoryMovementsDB, CustomersDB } from "@/lib/jsondb";
import { SalesDB } from "@/lib/db/sales.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { withDbRetry } from "@/lib/db-retry";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { logger } from "@/lib/logger";
import {
  resolveAuthoritativeReturn,
  ReturnValidationError,
  type SourceLineItem,
} from "@/lib/returns/authoritative-total";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const returns = await ReturnsDB.getAll(auth.tenantId);
  return NextResponse.json(returns);
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "returns"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  // Round 11 M004: audit log de Customer credit + Return + Inventory updates.
  return runWithAuditContext(req, auth.username, () => createReturn(req, auth));
}

async function createReturn(
  req: NextRequest,
  auth: { tenantId: string; username: string },
): Promise<NextResponse> {
  const body = await req.json();
  const { saleId, orderId, reason, items, photoUrl, customerPhone, applyCredit } = body;
  if (!items?.length) return NextResponse.json({ error: "items requeridos" }, { status: 400 });

  // ── Anti-fraude (regla #6 / danger-zone): el total y los precios se derivan
  //    del comprobante ORIGINAL (venta u orden), nunca de los precios que manda
  //    el cliente. Sin un comprobante de referencia no se puede validar. ──────
  if (!saleId && !orderId) {
    return NextResponse.json({ error: "saleId u orderId requerido" }, { status: 400 });
  }

  let sourceItems: SourceLineItem[];
  if (saleId) {
    const sale = await withDbRetry(() => SalesDB.getById(auth.tenantId, String(saleId)));
    if (!sale) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    sourceItems = sale.items.map((i) => ({
      productId: i.productId, name: i.name, price: i.price, quantity: i.quantity, unit: i.unit,
    }));
  } else {
    const order = await withDbRetry(() => OrdersDB.getById(auth.tenantId, String(orderId)));
    if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    // En DbOrder el item guarda el productId en el campo `id`.
    sourceItems = order.items.map((i) => ({
      productId: i.id, name: i.name, price: i.price, quantity: i.quantity, unit: i.unit,
    }));
  }

  let resolved: { items: ReturnType<typeof resolveAuthoritativeReturn>["items"]; total: number };
  try {
    resolved = resolveAuthoritativeReturn(sourceItems, items);
  } catch (err) {
    if (err instanceof ReturnValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  // Items con precio autoritativo + total computado en backend.
  const validatedItems = resolved.items;
  const total = resolved.total;

  let creditApplied = false;
  if (applyCredit && customerPhone && total > 0) {
    try {
      await CustomersDB.updateCreditBalance(auth.tenantId, customerPhone, total);
      creditApplied = true;
    } catch (err) {
      logger.warn("[returns] credit update failed", {
        err: err instanceof Error ? err.message : String(err),
        customerPhone: customerPhone.slice(-6),
      });
    }
  }

  const ret = await ReturnsDB.add({
    saleId, orderId,
    reason: reason ?? "",
    photoUrl: photoUrl ?? undefined,
    customerPhone: customerPhone ?? undefined,
    creditApplied,
    items: validatedItems,
    tenantId: auth.tenantId,
  });

  for (const item of validatedItems) {
    if (item.productId && item.quantity > 0) {
      await InventoryMovementsDB.record({
        productId: item.productId,
        type: "devolucion",
        quantity: item.quantity,
        reference: ret.id,
        notes: `Devolución: ${reason ?? "Sin motivo"}`,
        tenantId: auth.tenantId,
      });
    }
  }

  return NextResponse.json({ ...ret, creditApplied }, { status: 201 });
}
