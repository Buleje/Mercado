import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const CreateSchema = z.object({
  nombre: z.string().min(1).max(200),
  documento: z.string().max(20).optional(),
  telefono: z.string().max(20).optional(),
  notas: z.string().max(500).optional(),
});

// GET /api/adelantos/beneficiarios — personas + saldo consolidado
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const beneficiarios = await AdelantosDB.listBeneficiarios(auth.tenantId);
    return NextResponse.json(beneficiarios, { headers: { "X-Total-Count": String(beneficiarios.length) } });
  } catch (e) {
    logger.error("[adelantos/beneficiarios] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/adelantos/beneficiarios — crear persona
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-benef"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const benef = await AdelantosDB.createBeneficiario(auth.tenantId, parsed.data);
    logActivity("Crear", "adelanto", `Beneficiario ${benef.nombre}`, benef.id, auth.username).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json(benef, { status: 201 });
  } catch (e) {
    logger.error("[adelantos/beneficiarios] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
