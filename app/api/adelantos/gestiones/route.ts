import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * La bitácora de cobranza (333): qué se hizo con cada deudor y qué prometió.
 *
 * Se lee entera de una vez —la pantalla la indexa por persona— porque una
 * consulta por fila sería N+1 sobre una lista que se abre todos los días.
 */
const CreateSchema = z.object({
  beneficiarioId: z.string().min(1).max(40),
  tipo: z.enum(["RECORDATORIO", "PROMESA", "NO_CONTESTA", "REFINANCIAR", "VISITA", "PAGO", "OTRO"]),
  nota: z.string().max(600).optional(),
  fechaPrometida: z.string().max(40).nullable().optional(),
  montoPrometido: z.number().positive().max(9_999_999).nullable().optional(),
});

// GET /api/adelantos/gestiones — las últimas gestiones del tenant
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    /* 180 días: más atrás la gestión ya no cambia lo que se hace hoy, y traerlo
       todo engorda una respuesta que se pide en cada carga de la pestaña. */
    const desde = new Date(Date.now() - 180 * 86_400_000);
    const gestiones = await AdelantosDB.listGestiones(auth.tenantId, { desde });
    return NextResponse.json(gestiones, { headers: { "X-Total-Count": String(gestiones.length) } });
  } catch (e) {
    logger.error("[adelantos/gestiones] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/adelantos/gestiones — anotar una gestión
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-gestion"); if (_rl) return _rl;
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
    const g = await AdelantosDB.createGestion(auth.tenantId, { ...parsed.data, usuario: auth.username });
    if (!g) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    return NextResponse.json(g, { status: 201 });
  } catch (e) {
    logger.error("[adelantos/gestiones] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
