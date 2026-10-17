import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { LiquidacionCuentaDB, LiquidacionYaAnuladaError, NoEsLaUltimaError } from "@/lib/db/liquidacion-cuenta.db";
import { anularLiquidacionSchema } from "@/lib/cuentas/liquidacion";

/**
 * /api/adelantos/cuentas/liquidaciones/[id] (ADR-413)
 * GET `{ liquidacion }` · PATCH `{ action: "anular", motivo, devolucionCaja }` → `{ liquidacion }`
 */

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* Lecturas en su propio bucket: abrir el modal gasta 2 (partidas + historial) y anular 2 más.
     Con MODERATE (20 cada 5 min) revisar 10 cuentas seguidas daba 429 sin haber escrito nada. */
  const rl = await applyRateLimit(req, "GENEROUS", "adelantos-liquidacion-lectura");
  if (rl) return rl;
  const { id } = await params;
  try {
    const liquidacion = await LiquidacionCuentaDB.obtener(auth.tenantId, id);
    if (!liquidacion) return NextResponse.json({ error: "not_found", message: "Esa liquidación no existe." }, { status: 404 });
    return NextResponse.json({ liquidacion }, { headers: noStore });
  } catch (e) {
    logger.error("[adelantos/cuentas/liquidaciones/id] GET error", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const rl = await applyRateLimit(req, "MODERATE", "adelantos-liquidacion");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* `requireAdmin` deja pasar a `manager` por el bypass de gestión: anular una
     liquidación es sólo de admin y dueño (ADR-413). */
  if (auth.role !== "admin" && auth.role !== "owner") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo el administrador o el dueño pueden anular una liquidación." },
      { status: 403 },
    );
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = anularLiquidacionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }
  try {
    const liquidacion = await LiquidacionCuentaDB.anular(
      auth.tenantId,
      id,
      { motivo: parsed.data.motivo, devolucionCaja: parsed.data.devolucionCaja },
      auth.username ?? "unknown",
    );
    if (!liquidacion) return NextResponse.json({ error: "not_found", message: "Esa liquidación no existe." }, { status: 404 });
    return NextResponse.json({ liquidacion }, { headers: noStore });
  } catch (e) {
    if (e instanceof NoEsLaUltimaError) {
      return NextResponse.json({ error: "no_es_la_ultima", message: e.message }, { status: 409 });
    }
    if (e instanceof LiquidacionYaAnuladaError) {
      return NextResponse.json({ error: "ya_anulada", message: e.message }, { status: 409 });
    }
    logger.error("[adelantos/cuentas/liquidaciones/id] PATCH error", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
