import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { MarcasRevisadasDB } from "@/lib/db/rrhh-marcas-revisadas.db";
import { RRHH_GESTION } from "@/lib/rrhh/roles";

/**
 * /api/rrhh/asistencia/revisadas — «Marcas para revisar» (`lib/rrhh/marcas-para-revisar.ts`).
 *   GET  → { ids } las marcas ya aprobadas
 *   POST { ids } → aprueba esas marcas (≤ 100; las ajenas o borradas se ignoran)
 * Dueño, administrador y encargado: los que corrigen asistencia de cualquier día.
 */

const SIN_CACHE = { "Cache-Control": "private, no-store" };
const aprobarSchema = z.object({ ids: z.array(z.string().min(1).max(60)).min(1).max(100) });

export const GET = withApiHandler("rrhh-revisadas-get", async (req: NextRequest) => {
  const rl = applyRateLimit(req, "GENEROUS", "rrhh-revisadas");
  if (rl) return rl;
  const auth = await requireAdmin(req, [...RRHH_GESTION]);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ ids: await MarcasRevisadasDB.ids(auth.tenantId) }, { headers: SIN_CACHE });
});

export const POST = withApiHandler("rrhh-revisadas-post", async (req: NextRequest) => {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "rrhh-revisadas");
  if (rl) return rl;
  const auth = await requireAdmin(req, [...RRHH_GESTION]);
  if (auth instanceof NextResponse) return auth;
  const body = aprobarSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "validation_error" }, { status: 422 });

  const ids = await MarcasRevisadasDB.aprobar(auth.tenantId, body.data.ids);
  if (ids.length > 0) {
    logActivity("rrhh_marcas_aprobadas", "Asistencia", `Aprobó ${ids.length} ${ids.length === 1 ? "marca" : "marcas"} para revisar`, undefined, auth.username, undefined, auth.tenantId).catch((err) =>
      logger.warn("[rrhh/revisadas] no se registró la actividad", { tenantId: auth.tenantId, error: String(err) }),
    );
  }
  return NextResponse.json({ ids }, { headers: SIN_CACHE });
});
