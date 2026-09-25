import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FiadoGestionDB } from "@/lib/db/fiado-gestion.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * La bitácora de cobranza de Fiados (port de /api/adelantos/gestiones):
 * qué se hizo con cada cliente y qué prometió.
 */
const CreateSchema = z.object({
  customerId: z.string().min(1).max(40),
  tipo: z.enum(["RECORDATORIO", "PROMESA", "NO_CONTESTA", "REFINANCIAR", "VISITA", "PAGO", "OTRO"]),
  nota: z.string().max(600).optional(),
  fechaPrometida: z.string().max(40).nullable().optional(),
  montoPrometido: z.number().positive().max(9_999_999).nullable().optional(),
});

// GET /api/fiados/gestiones — las últimas gestiones del tenant
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    // 180 días: más atrás la gestión ya no cambia lo que se hace hoy.
    const desde = new Date(Date.now() - 180 * 86_400_000);
    const gestiones = await FiadoGestionDB.listGestiones(auth.tenantId, { desde });
    return NextResponse.json(gestiones, { headers: { "X-Total-Count": String(gestiones.length) } });
  } catch (e) {
    logger.error("[fiados/gestiones] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/fiados/gestiones — anotar una gestión
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "fiados-gestion"); if (_rl) return _rl;
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
    /* El autor sale de la sesión, no del body: quién gestionó no es algo que el
       cliente pueda declarar. */
    const g = await FiadoGestionDB.createGestion(auth.tenantId, { ...parsed.data, usuario: auth.username });
    if (!g) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json(g, { status: 201 });
  } catch (e) {
    logger.error("[fiados/gestiones] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
