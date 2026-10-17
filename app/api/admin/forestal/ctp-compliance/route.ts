import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestCtpComplianceDB } from "@/lib/db/forest-ctp-compliance.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/ctp-compliance — la historia del score del Libro CTP
 * (ADR-384). GET (la serie) · POST (guarda el punto de hoy).
 *
 * El POST NO calcula el score: lo recibe. El panel lo compone en el cliente
 * juntando cinco agregados, y recalcularlo acá crearía un segundo score que va
 * a divergir del que ve el operador (ver la cabecera de la DB class).
 *
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'.
 */

/** La `key` de un `CtpPeriod` — se guarda para no comparar peras con manzanas. */
const PERIODOS = ["mes-actual", "mes-anterior", "trimestre", "anio", "todo", "custom"] as const;

const cuenta = z.coerce.number().int().min(0).max(1_000_000);

const snapshotSchema = z.object({
  periodo: z.enum(PERIODOS),
  score: z.coerce.number().int().min(0).max(100),
  fueraPlazo: cuenta,
  pendientes: cuenta,
  especiesEnNegativo: cuenta,
  stockNegativo: cuenta,
  despachosSinTraza: cuenta,
  /* Las informativas pueden faltar (el panel las calcula best-effort: si la
     Ficha no carga, el core sigue). Ausente ⇒ 0, que es lo que el panel mostró. */
  citesCount: cuenta.optional().default(0),
  citesSinPermiso: cuenta.optional().default(0),
  rendimientoAlto: cuenta.optional().default(0),
  documentosVencidos: cuenta.optional().default(0),
  documentosPorVencer: cuenta.optional().default(0),
  totalIngresos: cuenta.optional().default(0),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-ctp-compliance-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const params = req.nextUrl.searchParams;
  const parsed = z
    .object({
      periodo: z.enum(PERIODOS).optional().default("mes-actual"),
      dias: z.coerce.number().int().min(1).max(730).optional().default(90),
    })
    .safeParse({ periodo: params.get("periodo") ?? undefined, dias: params.get("dias") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }

  try {
    const serie = await ForestCtpComplianceDB.serie(auth.tenantId, parsed.data.periodo, parsed.data.dias);
    return NextResponse.json({ serie });
  } catch (err) {
    logger.error("[ctp-compliance.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-ctp-compliance-post", async (req: NextRequest) => {
  /* `almacenero` incluido a propósito: el que abre el libro y ve el score es
     quien produce el dato. Restringirlo a admin dejaría la serie con huecos
     justo los días de más movimiento. */
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = snapshotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }

  try {
    const snapshot = await ForestCtpComplianceDB.registrarHoy(
      auth.tenantId,
      parsed.data,
      auth.username ?? "unknown",
    );
    return NextResponse.json({ snapshot });
  } catch (err) {
    logger.error("[ctp-compliance.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
