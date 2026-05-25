import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const CreateSchema = z.object({
  beneficiarioId: z.string().min(1).max(40),
  modalidad: z.enum(["CUENTA_CORRIENTE", "ENTREGAS_PACTADAS"]).optional(),
  montoAdelantado: z.number().positive().max(9999999999),
  moneda: z.string().max(3).optional(),
  fechaAdelanto: z.string().optional(),
  notas: z.string().max(1000).optional(),
  entregasPactadas: z
    .array(
      z.object({
        descripcionEsperada: z.string().min(1).max(300),
        valorEsperado: z.number().positive().max(9999999999),
        fechaEsperada: z.string().optional(),
      }),
    )
    .max(60)
    .optional(),
});

// GET /api/adelantos — lista con filtros
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const adelantos = await AdelantosDB.list(auth.tenantId, {
      status: (searchParams.get("status") as never) ?? undefined,
      beneficiarioId: searchParams.get("beneficiarioId") ?? undefined,
      modalidad: (searchParams.get("modalidad") as never) ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });
    return NextResponse.json(adelantos, { headers: { "X-Total-Count": String(adelantos.length) } });
  } catch (e) {
    logger.error("[adelantos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/adelantos — crear adelanto
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    const adelanto = await AdelantosDB.create(auth.tenantId, parsed.data);
    logActivity(
      "Crear",
      "adelanto",
      `Adelanto S/${parsed.data.montoAdelantado.toFixed(2)} (${parsed.data.modalidad ?? "CUENTA_CORRIENTE"})`,
      adelanto.id,
      auth.username,
    ).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json(adelanto, { status: 201 });
  } catch (e) {
    logger.error("[adelantos] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
