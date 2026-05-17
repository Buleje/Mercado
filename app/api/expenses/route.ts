import { NextRequest, NextResponse } from "next/server";
import { ExpensesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const recurring = searchParams.get("recurring");
    const category = searchParams.get("category");

    // Audit 2026-05-17 (feature compras): ?recurring=true devuelve el catálogo
    // de gastos recurrentes que se muestran como cards en el Punto de Compra.
    if (from && to) {
      return NextResponse.json(await ExpensesDB.getByDateRange(auth.tenantId, new Date(from), new Date(to)));
    }
    const filters: { recurring?: boolean; category?: string } = {};
    if (recurring === "true") filters.recurring = true;
    else if (recurring === "false") filters.recurring = false;
    if (category) filters.category = category;
    return NextResponse.json(await ExpensesDB.getAll(auth.tenantId, filters));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "expenses"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    if (!body.category || !body.amount) {
      return NextResponse.json({ error: "category and amount required" }, { status: 400 });
    }
    const expense = await ExpensesDB.add(auth.tenantId, {
      category: body.category,
      description: body.description ?? "",
      amount: Number(body.amount),
      date: body.date ?? new Date().toISOString(),
      recurring: body.recurring ?? false,
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
