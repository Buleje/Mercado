import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { RRHH_COMPLETO, nivelDeRol } from "@/lib/rrhh/roles";
import { traerDesdeAdelantosSchema } from "@/lib/rrhh/schemas";

/** GET /api/rrhh/colaboradores/desde-adelantos — candidatos sin traer todavía, sólo nivel completo. */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-lectura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (nivel !== "completo") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { candidatos, yaVinculados } = await ColaboradoresDB.candidatosDesdeAdelantos(auth.tenantId);
    return NextResponse.json({ candidatos, yaVinculados }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[rrhh/colaboradores/desde-adelantos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** POST /api/rrhh/colaboradores/desde-adelantos — trae hasta 100 personas de una, cada una independiente. */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (nivel !== "completo") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }
  const parsed = traerDesdeAdelantosSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const resultado = await ColaboradoresDB.traerDesdeAdelantos(auth.tenantId, parsed.data, auth.username);
    return NextResponse.json(resultado);
  } catch (e) {
    logger.error("[rrhh/colaboradores/desde-adelantos] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
