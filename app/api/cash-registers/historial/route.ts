import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { CashAuditTrailDB } from "@/lib/db/cash-audit-trail.db";
import { logger } from "@/lib/logger";

/** Cajas por pedido: la pantalla de Cuadrar caja pide las suyas de una vez. */
const MAX_CAJAS = 200;
const MAX_LARGO_ID = 50;

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(800).optional(),
  registerId: z.string().min(1).max(MAX_LARGO_ID).optional(),
  /** Ids separados por coma (cuid = 25 caracteres: 200 caben holgados). */
  registerIds: z
    .string()
    .max(MAX_CAJAS * (MAX_LARGO_ID + 1))
    .optional()
    .transform((s) => (s ? Array.from(new Set(s.split(",").map((x) => x.trim()).filter(Boolean))) : undefined))
    .pipe(z.array(z.string().max(MAX_LARGO_ID, "Id de caja demasiado largo.")).max(MAX_CAJAS, `Hasta ${MAX_CAJAS} cajas por pedido.`).optional()),
  /** `caja` = sólo aperturas y cierres, sin los ingresos/egresos manuales. */
  entity: z.literal("caja").optional(),
});

/**
 * GET /api/cash-registers/historial — quién tocó la caja.
 *
 * Devuelve el rastro de auditoría de aperturas, cierres e ingresos/egresos
 * manuales del tenant. Sólo lectura: un registro de auditoría que la aplicación
 * pudiera editar no sirve como auditoría.
 *
 * Query: `?limit=50&registerId=<id>` o `?entity=caja&registerIds=<id>,<id>,…`
 * (hasta 200 cajas; sin `limit`, 4 filas por caja). Siempre con el tenant del
 * JWT: un id de caja de otro negocio no trae nada.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "cash-historial");
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    limit: searchParams.get("limit") || undefined,
    registerId: searchParams.get("registerId") || undefined,
    registerIds: searchParams.get("registerIds") || undefined,
    entity: searchParams.get("entity") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    const { limit, registerId, registerIds, entity } = parsed.data;
    const entries = await CashAuditTrailDB.list(auth.tenantId, {
      limit,
      registerId,
      registerIds,
      soloCaja: entity === "caja",
    });
    return NextResponse.json({ entries });
  } catch (e) {
    logger.error("[cash-historial] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
