import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ExpensesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * POST /api/expenses/from-template/[id]
 *
 * Audit 2026-05-17 (feature compras): ejecuta un gasto a partir de un
 * template recurring. El template (Expense.recurring=true) queda intacto;
 * el nuevo gasto se registra con recurring=false (transacción real).
 *
 * Click en una card del catálogo "Artículos para Comprar" del Punto de
 * Compra dispara este endpoint. Permite override de amount/description/date.
 */

const Body = z.object({
  amount: z.number().positive().optional(),
  description: z.string().max(500).optional(),
  date: z.string().datetime().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "expenses-from-template"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    // Quién registró el pago sale de la sesión, nunca del body (ADR-374).
    const expense = await ExpensesDB.addFromTemplate(auth.tenantId, id, {
      ...parsed.data,
      ...(auth.username ? { createdBy: auth.username } : {}),
    });
    if (!expense) {
      return NextResponse.json(
        { error: "Template no encontrado o no es recurring en este tenant" },
        { status: 404 },
      );
    }

    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    logger.error("[expenses/from-template] POST error", {
      err: err instanceof Error ? err.message : String(err),
      templateId: id,
    });
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
