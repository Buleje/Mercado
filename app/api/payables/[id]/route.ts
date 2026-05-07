import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PayablesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";


const PayablePatchSchema = z.object({
  amount: z.number().positive().optional(),
  dueDate: z.string().datetime().optional(),
  description: z.string().max(500).optional(),
  supplierName: z.string().max(200).optional(),
  status: z.enum(["pendiente", "parcial", "pagado"]).optional(),
}).partial();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const payable = await PayablesDB.getById(auth.tenantId, id);
    if (!payable) {
      return NextResponse.json({ error: "Payable no encontrado" }, { status: 404 });
    }
    return NextResponse.json(payable);
  } catch (e) {
    logger.error("[payables/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "payables-X");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = PayablePatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    const updated = await PayablesDB.update(auth.tenantId, id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Payable no encontrado" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[payables/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "payables-X");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const existing = await PayablesDB.getById(auth.tenantId, id);
    if (!existing) {
      return NextResponse.json({ error: "Payable no encontrado" }, { status: 404 });
    }
    await PayablesDB.delete(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[payables/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
