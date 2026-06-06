import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { AssetsDB } from "@/lib/db/assets.db";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * GET  /api/admin/assets/[id]/movements          → ingresos + gastos del activo
 * POST /api/admin/assets/[id]/movements?kind=income|expense → registra movimiento
 */

const IncomeBody = z.object({
  client:    z.string().max(150).optional().nullable(),
  quantity:  z.number().min(0).max(999999).optional().nullable(),
  unit:      z.string().max(20).optional(),
  rate:      z.number().min(0).max(9999999),
  amount:    z.number().min(0).max(99999999),
  hourStart: z.number().min(0).max(9999999).optional().nullable(),
  hourEnd:   z.number().min(0).max(9999999).optional().nullable(),
  notes:     z.string().max(1000).optional().nullable(),
});

const ExpenseBody = z.object({
  category:  z.enum(["combustible", "mantenimiento", "repuesto", "operador", "peaje", "otro"]).optional(),
  gallons:   z.number().min(0).max(999999).optional().nullable(),
  unitPrice: z.number().min(0).max(999999).optional().nullable(),
  amount:    z.number().min(0).max(99999999),
  notes:     z.string().max(1000).optional().nullable(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    if (!(await AssetsDB.assertOwned(auth.tenantId, id))) {
      return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });
    }
    const data = await AssetsDB.listMovements(auth.tenantId, id);
    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[assets] movements list failed", { err: String(err), id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("kind");

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    // Ownership: el activo debe ser del tenant.
    if (!(await AssetsDB.assertOwned(auth.tenantId, id))) {
      return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });
    }

    if (kind === "income") {
      const parsed = IncomeBody.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
      const row = await AssetsDB.addIncome(auth.tenantId, { assetId: id, ...parsed.data });
      return NextResponse.json({ data: row }, { status: 201 });
    }
    if (kind === "expense") {
      const parsed = ExpenseBody.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
      const row = await AssetsDB.addExpense(auth.tenantId, { assetId: id, ...parsed.data });
      return NextResponse.json({ data: row }, { status: 201 });
    }
    return NextResponse.json({ error: "kind debe ser income o expense" }, { status: 400 });
  } catch (err) {
    logger.error("[assets] movement create failed", { err: String(err), id, kind });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
