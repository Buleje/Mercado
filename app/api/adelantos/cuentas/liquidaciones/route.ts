import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import {
  CuentaForestalDeshabilitadaError,
  LiquidacionCuentaDB,
  PersonaNoEncontradaError,
  PlanCambioError,
  PlanInvalidoError,
  SinVinculoError,
} from "@/lib/db/liquidacion-cuenta.db";
import { liquidacionInputSchema } from "@/lib/cuentas/liquidacion";

/**
 * /api/adelantos/cuentas/liquidaciones (ADR-413)
 * GET `?beneficiario=&parte=&anuladas=1` → `{ liquidaciones }`
 * POST liquidar → 201 `{ liquidacion, caja }` · 200 `{ liquidacion, repetida: true }`
 * Sólo admin y dueño (decisión por defecto de Brandon).
 */

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* Lecturas en su propio bucket: abrir el modal gasta 2 (partidas + historial) y anular 2 más.
     Con MODERATE (20 cada 5 min) revisar 10 cuentas seguidas daba 429 sin haber escrito nada. */
  const rl = await applyRateLimit(req, "GENEROUS", "adelantos-liquidacion-lectura");
  if (rl) return rl;
  const sp = req.nextUrl.searchParams;
  const beneficiarioId = sp.get("beneficiario")?.trim() || undefined;
  const parteId = sp.get("parte")?.trim() || undefined;
  if (!beneficiarioId && !parteId) {
    return NextResponse.json({ error: "persona_requerida", message: "Elige a la persona." }, { status: 400 });
  }
  try {
    const liquidaciones = await LiquidacionCuentaDB.listar(auth.tenantId, { beneficiarioId, parteId }, { incluirAnuladas: sp.get("anuladas") === "1" });
    return NextResponse.json({ liquidaciones }, { headers: noStore });
  } catch (e) {
    logger.error("[adelantos/cuentas/liquidaciones] GET error", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const rl = await applyRateLimit(req, "MODERATE", "adelantos-liquidacion");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* `requireAdmin` deja pasar a `manager` por el bypass de gestión: liquidar es
     sólo de admin y dueño (ADR-413, decisión por defecto de Brandon). */
  if (auth.role !== "admin" && auth.role !== "owner") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo el administrador o el dueño pueden liquidar una cuenta." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = liquidacionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Los datos de la liquidación no son válidos.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422, headers: noStore },
    );
  }
  try {
    const r = await LiquidacionCuentaDB.crear(auth.tenantId, parsed.data, auth.username ?? "unknown");
    if (r.repetida) return NextResponse.json({ liquidacion: r.liquidacion, repetida: true }, { status: 200, headers: noStore });
    return NextResponse.json({ liquidacion: r.liquidacion, caja: r.caja }, { status: 201, headers: noStore });
  } catch (e) {
    if (e instanceof PlanCambioError) {
      return NextResponse.json({ error: "plan_cambio", message: e.message, partidas: e.partidas, huella: e.huella }, { status: 409, headers: noStore });
    }
    if (e instanceof PlanInvalidoError) {
      return NextResponse.json({ error: "plan_invalido", message: e.message, errores: e.errores }, { status: 422, headers: noStore });
    }
    if (e instanceof SinVinculoError) {
      return NextResponse.json({ error: "sin_vinculo", message: e.message }, { status: 409, headers: noStore });
    }
    if (e instanceof PersonaNoEncontradaError) {
      return NextResponse.json({ error: "persona_no_encontrada", message: e.message }, { status: 404, headers: noStore });
    }
    if (e instanceof CuentaForestalDeshabilitadaError) {
      return NextResponse.json({ error: "specialization_disabled", message: e.message }, { status: 403, headers: noStore });
    }
    logger.error("[adelantos/cuentas/liquidaciones] POST error", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
