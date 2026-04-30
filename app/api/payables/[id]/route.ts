import { NextRequest, NextResponse } from "next/server";
import { PayablesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const supplierId = searchParams.get("supplierId");
    if (supplierId) return NextResponse.json(await PayablesDB.getBySupplierId(auth.tenantId, supplierId));
    return NextResponse.json(await PayablesDB.getAll(auth.tenantId));
  } catch (e) {
    logger.error("[payables/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  if (!body.supplierId || !body.amount) {
    return NextResponse.json({ error: "supplierId and amount required" }, { status: 400 });
  }
  const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const payable = await PayablesDB.add(auth.tenantId, {
    id,
    supplierId: body.supplierId,
    supplierName: body.supplierName || "",
    purchaseOrderId: body.purchaseOrderId || undefined,
    description: body.description || "",
    amount: Number(body.amount),
    paidAmount: 0,
    status: "pendiente",
    dueDate: body.dueDate || new Date().toISOString(),
    payments: [],
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json(payable, { status: 201 });
}
