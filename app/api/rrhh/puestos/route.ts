import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { PuestosDB, NombreDePuestoDuplicadoError } from "@/lib/db/rrhh-puestos.db";
import { aPuestoDTO } from "@/lib/rrhh/dto";
import { RRHH_GESTION, RRHH_MARCAR, nivelDeRol } from "@/lib/rrhh/roles";
import { puestoSchema } from "@/lib/rrhh/schemas";

/** GET /api/rrhh/puestos — catálogo; la tarifa sugerida sólo sale en nivel completo. */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-lectura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_MARCAR]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const rows = await PuestosDB.listar(auth.tenantId);
    const puestos = rows.map((r) => aPuestoDTO(r, nivel, r.personas));
    return NextResponse.json({ puestos }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[rrhh/puestos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** POST /api/rrhh/puestos — crear; la tarifa sugerida es sólo de nivel completo. */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_GESTION]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }
  const parsed = puestoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }
  if (parsed.data.tarifaSugerida !== undefined && nivel !== "completo") {
    return NextResponse.json({ error: "tarifa_requiere_admin" }, { status: 403 });
  }

  try {
    const row = await PuestosDB.crear(auth.tenantId, parsed.data, auth.username);
    return NextResponse.json({ puesto: aPuestoDTO(row, nivel, row.personas) }, { status: 201 });
  } catch (e) {
    if (e instanceof NombreDePuestoDuplicadoError) {
      return NextResponse.json({ error: "nombre_duplicado", ...e.existente }, { status: 409 });
    }
    logger.error("[rrhh/puestos] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
