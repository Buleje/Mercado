import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { AssetsDB } from "@/lib/db/assets.db";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * GET   /api/admin/assets/receivables  → alquileres pendientes de cobro
 * PATCH /api/admin/assets/receivables  → marca un ingreso como pagado/pendiente
 *   body: { incomeId: string, paid: boolean }
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const data = await AssetsDB.listReceivables(auth.tenantId);
    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[assets] receivables list failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

const PayBody = z.object({ incomeId: z.string().min(1).max(60), paid: z.boolean() });

export async function PATCH(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = PayBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  try {
    const ok = await AssetsDB.setIncomePaid(auth.tenantId, parsed.data.incomeId, parsed.data.paid);
    if (!ok) return NextResponse.json({ error: "Cobro no encontrado" }, { status: 404 });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    logger.error("[assets] set paid failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
