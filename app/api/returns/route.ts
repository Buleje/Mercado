import { NextResponse, type NextRequest } from "next/server";
import { ReturnsDB, InventoryMovementsDB, CustomersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { logger } from "@/lib/logger";

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

  const total = items.reduce((s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0);

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
    items,
    tenantId: auth.tenantId,
  });

  for (const item of items) {
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
