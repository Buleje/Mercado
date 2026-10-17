import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ReturnsDB, InventoryMovementsDB, CustomersDB } from "@/lib/jsondb";
import { OrdersDB } from "@/lib/db/orders.db";
import { withDbRetry } from "@/lib/db-retry";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { logger } from "@/lib/logger";
import { revalidateTenantTag } from "@/lib/cache";
import { DevolucionError, DevolucionesPosDB } from "@/lib/db/devoluciones-pos.db";
import {
  resolveAuthoritativeReturn,
  ReturnValidationError,
  type SourceLineItem,
} from "@/lib/returns/authoritative-total";

const ReturnSchema = z.object({
  saleId: z.string().trim().min(1).optional(),
  orderId: z.string().trim().min(1).optional(),
  reason: z.string().max(200).optional(),
  photoUrl: z.string().max(2000).optional(),
  customerPhone: z.string().max(30).optional(),
  applyCredit: z.boolean().optional(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().positive(),
  })).min(1).max(50),
});
type ReturnBody = z.infer<typeof ReturnSchema>;
type Auth = { tenantId: string; username: string; role: string };

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

async function createReturn(req: NextRequest, auth: Auth): Promise<NextResponse> {
  const parsed = ReturnSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "items requeridos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  const { saleId, orderId, reason, items, photoUrl, customerPhone, applyCredit } = parsed.data;

  // ── Anti-fraude (regla #6 / danger-zone): el total y los precios se derivan
  //    del comprobante ORIGINAL (venta u orden), nunca de los precios que manda
  //    el cliente. Sin un comprobante de referencia no se puede validar. ──────
  if (!saleId && !orderId) {
    return NextResponse.json({ error: "saleId u orderId requerido" }, { status: 400 });
  }

  // Venta del POS: la MISMA cuenta que `/api/sales/devolucion` (17-10). Antes esta rama
  // devolvía `SaleItem.price × cantidad` sin el descuento de cabecera ni el trueque
  // (venta QA `bc19cbe5`: cobró 0,10 → Return de 24,90), no sumaba lo ya devuelto
  // (la misma unidad N veces), acreditaba al teléfono del cuerpo y salteaba el freno
  // «efectivo sólo admin/dueño».
  if (saleId) return devolverVenta(auth, saleId, { items, reason, applyCredit });

  const order = await withDbRetry(() => OrdersDB.getById(auth.tenantId, String(orderId)));
  if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  // En DbOrder el item guarda el productId en el campo `id`.
  const sourceItems: SourceLineItem[] = order.items.map((i) => ({
    productId: i.id, name: i.name, price: i.price, quantity: i.quantity, unit: i.unit,
  }));

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
    orderId,
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

/**
 * Devolución de una venta por `DevolucionesPosDB.registrar`: candado por venta,
 * unidades y plata ya devueltas leídas dentro de la transacción, tope = `Sale.total`
 * (descuento global y trueque prorrateados) y crédito al cliente DE LA VENTA.
 * Sin `applyCredit` el `Return` queda como efectivo: igual que en el POS, sólo admin/dueño.
 */
async function devolverVenta(
  auth: Auth,
  saleId: string,
  body: Pick<ReturnBody, "items" | "reason" | "applyCredit">,
): Promise<NextResponse> {
  const refundType = body.applyCredit ? "credito" : "efectivo";
  if (refundType === "efectivo" && auth.role !== "admin" && auth.role !== "owner") {
    return NextResponse.json({ error: "Devolver en efectivo requiere autorización del admin" }, { status: 403 });
  }
  if (body.items.some((i) => !Number.isInteger(i.quantity))) {
    return NextResponse.json({ error: "En una venta se devuelven unidades enteras" }, { status: 400 });
  }
  try {
    const r = await DevolucionesPosDB.registrar(auth.tenantId, {
      saleId,
      items: body.items.map((i) => ({ productId: i.productId, qty: i.quantity, motivo: body.reason })),
      refundType,
      usuario: auth.username,
    });
    revalidateTenantTag(auth.tenantId, "products");
    return NextResponse.json(
      {
        saleId,
        total: r.totalRefund,
        brutoSinDescuento: r.brutoSinDescuento,
        creditApplied: refundType === "credito",
        items: r.items,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof DevolucionError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}
