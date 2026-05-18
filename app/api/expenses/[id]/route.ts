import { NextResponse, type NextRequest } from "next/server";
import { ExpensesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET legacy — devuelve summary de TODOS los gastos del tenant.
 * Nota: el route es `[id]` pero el handler ignora el id por historia legacy.
 * Se mantiene para no romper consumidores existentes; mover summary a /api/expenses/summary
 * en un futuro refactor (ADR-recomendable).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const summary = await ExpensesDB.getSummary(auth.tenantId);
    return NextResponse.json(summary);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

/**
 * DELETE /api/expenses/:id — elimina un gasto (template recurrente o ejecutado).
 * RBAC: admin. Rate-limit MODERATE. ExpensesDB.delete usa deleteMany con
 * filtro de tenantId — multi-tenant safe.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "expenses");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  try {
    const { id } = await ctx.params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await ExpensesDB.delete(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
