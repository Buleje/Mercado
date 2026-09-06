import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ExpenseBudgetDB } from "@/lib/db/expense-budget.db";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET  /api/expenses/presupuesto  → techos + comparación con lo gastado
 * PUT  /api/expenses/presupuesto  → fija el techo de una categoría
 *
 * ADR-375: el presupuesto vivía en `localStorage`, así que no existía fuera
 * del navegador donde se había escrito.
 */

const QuerySchema = z.object({
  meses: z.coerce.number().int().min(2).max(24).optional().default(6),
});

const PutSchema = z.object({
  category: z.string().min(1, "la categoría es obligatoria").max(100),
  // 0 = sin techo. Negativo no significa nada acá.
  montoMensual: z.coerce.number().min(0, "el monto no puede ser negativo").max(99_999_999),
});

export async function GET(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "expenses-presupuesto"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({ meses: searchParams.get("meses") ?? undefined });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const [presupuestos, tendencia] = await Promise.all([
      ExpenseBudgetDB.getAll(auth.tenantId),
      ExpenseBudgetDB.getTendencia(auth.tenantId, parsed.data.meses),
    ]);

    return NextResponse.json({ presupuestos, ...tendencia });
  } catch (err) {
    logger.error("[expenses/presupuesto] GET error", {
      err: err instanceof Error ? err.message : String(err),
    });
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function PUT(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "expenses-presupuesto-put"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = PutSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 },
      );
    }

    await ExpenseBudgetDB.set(
      auth.tenantId,
      parsed.data.category,
      parsed.data.montoMensual,
      auth.username ?? undefined,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[expenses/presupuesto] PUT error", {
      err: err instanceof Error ? err.message : String(err),
    });
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
