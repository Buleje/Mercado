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
  monto: z.number().positive().max(9_999_999),
  moneda: z.string().max(3).optional(),
  frecuencia: z.enum(["semanal", "quincenal", "mensual"]),
  diaMes: z.number().int().min(1).max(28).nullable().optional(),
  /** 0-6, domingo a sábado. Faltaba: el campo existía en la tabla y no había
   *  forma de mandarlo, así que un recurrente semanal caía el día en que se
   *  creó y no en el que se quería. */
  diaSemana: z.number().int().min(0).max(6).nullable().optional(),
  notas: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const list = await AdelantosDB.listRecurrentes(auth.tenantId);
    return NextResponse.json(list, { headers: { "X-Total-Count": String(list.length) } });
  } catch (e) {
    logger.error("[adelantos/recurrentes] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-recurrentes"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const rec = await AdelantosDB.createRecurrente(auth.tenantId, parsed.data);
    logActivity("Crear", "adelanto", `Adelanto recurrente ${rec.frecuencia} S/${parsed.data.monto.toFixed(2)}`, rec.id, auth.username).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json(rec, { status: 201 });
  } catch (e) {
    logger.error("[adelantos/recurrentes] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
