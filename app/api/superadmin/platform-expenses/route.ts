import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { PlatformExpensesDB, EXPENSE_CATEGORIES } from "@/lib/db/platform-expenses.db";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { logger } from "@/lib/logger";

const BUDGET_KEY = "gastos.monthlyBudgetPen";

/**
 * /api/superadmin/platform-expenses — gastos REALES de plataforma (Buleje SaaS).
 * GET: lista + resumen (run-rate mensual, por categoría). POST: alta. DELETE: baja.
 * Auth: sesión de plataforma (superadmin). Brandon 2026-06-30.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const CATEGORIES = EXPENSE_CATEGORIES as readonly [string, ...string[]];

const CreateSchema = z.object({
  concept: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORIES),
  amount: z.number().positive().max(10_000_000),
  currency: z.enum(["PEN", "USD"]),
  date: z.string().trim().max(40).optional(),
  recurring: z.boolean(),
  period: z.enum(["mensual", "anual", ""]).default(""),
  vendor: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(500).default(""),
});

const DeleteSchema = z.object({ id: z.string().trim().min(1).max(60) });

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const [expenses, summary, budget] = await Promise.all([
      PlatformExpensesDB.list(),
      PlatformExpensesDB.summary(),
      PlatformSettingsDB.get<number>(BUDGET_KEY),
    ]);
    return NextResponse.json(
      { expenses, summary, budgetPen: budget ?? null, generatedAt: new Date().toISOString() },
      { headers: NO_STORE },
    );
  } catch (e) {
    logger.error("[superadmin/platform-expenses] GET", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const d = parsed.data;
    const when = d.date ? new Date(d.date) : undefined;
    const row = await PlatformExpensesDB.create({
      concept: d.concept,
      category: d.category,
      amount: d.amount,
      currency: d.currency,
      date: when && !Number.isNaN(when.getTime()) ? when : undefined,
      recurring: d.recurring,
      period: d.recurring ? d.period : "",
      vendor: d.vendor,
      notes: d.notes,
    });
    return NextResponse.json({ expense: row }, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/platform-expenses] POST", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PUT: fija el presupuesto mensual (tope en PEN) para la alerta de sobregasto.
const BudgetSchema = z.object({ budgetPen: z.number().min(0).max(10_000_000).nullable() });

export async function PUT(req: NextRequest) {
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = BudgetSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  try {
    await PlatformSettingsDB.set(BUDGET_KEY, parsed.data.budgetPen, "superadmin");
    return NextResponse.json({ budgetPen: parsed.data.budgetPen }, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/platform-expenses] PUT", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = DeleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  try {
    await PlatformExpensesDB.remove(parsed.data.id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/platform-expenses] DELETE", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
