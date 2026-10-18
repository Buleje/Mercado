import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { AgendaDB } from "@/lib/db/agenda.db";
import { ActividadCrearSchema, primerMensaje } from "@/lib/agenda/schemas";
import { sincronizarActividad } from "@/lib/agenda/google/sync";
import {
  ROLES_ESCRIBIR_AGENDA,
  ROLES_LEER_AGENDA,
  puedeEscribirAgenda,
  puedeLeerAgenda,
} from "@/lib/admin/agenda-acceso";

/**
 * /api/admin/agenda/actividades (ADR-501 §7)
 *
 * GET  → `{ actividades: ActividadDTO[] }` (cajero/almacenero/analista: sólo las de su rol).
 * POST → 201 `ActividadDTO`. El nombre del objetivo sale de la base, no del body.
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_LEER_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeLeerAgenda(auth.role)) return NextResponse.json({ error: "No tienes acceso a la agenda" }, { status: 403 });
  try {
    const actividades = await AgendaDB.listarActividades(auth.tenantId, auth.role);
    return NextResponse.json({ actividades });
  } catch (err) {
    logger.error("[agenda] listar actividades falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo leer la agenda. Reintenta." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "agenda-actividades");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES_ESCRIBIR_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeEscribirAgenda(auth.role)) {
    return NextResponse.json({ error: "Sólo el dueño o el encargado cambian la agenda" }, { status: 403 });
  }

  const body = await leerJson(req);
  if (body === null) return NextResponse.json({ error: "Manda los datos de la actividad" }, { status: 400 });
  const parsed = ActividadCrearSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: primerMensaje(parsed.error) }, { status: 400 });

  try {
    const r = await AgendaDB.crearActividad(auth.tenantId, parsed.data, auth.username);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    if (r.valor.canales.includes("google")) {
      sincronizarActividad(auth.tenantId, r.valor.id, "guardar").catch((err) =>
        logger.error("[agenda] sync Google al crear falló", { tenantId: auth.tenantId, error: String(err) }),
      );
    }
    return NextResponse.json(r.valor, { status: 201 });
  } catch (err) {
    logger.error("[agenda] crear actividad falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se guardó. Reintenta." }, { status: 503 });
  }
}
