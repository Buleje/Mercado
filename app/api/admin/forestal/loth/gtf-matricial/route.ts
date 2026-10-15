import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfMatricialDB } from "@/lib/db/forest-gtf-matricial.db";
import { hojaSchema } from "@/lib/forestal/gtf-matricial-disposicion";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/gtf-matricial — dónde cae cada valor de la GTF y de
 * su lista en el talonario preimpreso de la matricial («Imprimir en talonario»).
 *
 * GET — la disposición del tenant (guía + lista), completa con la de fábrica.
 * PUT — guarda UNA hoja: `{ formato: "guia" | "lista", hoja }`.
 *
 * Quien imprime las guías (almacenero) también acomoda su talonario: es la
 * medida de un papel, no un dato del libro.
 */

const ROLES: readonly AdminRole[] = ["admin", "almacenero", "owner"];

const putSchema = z.object({
  formato: z.enum(["guia", "lista"]),
  hoja: hojaSchema,
});

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-gtf-matricial-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    return NextResponse.json({ disposicion: await ForestGtfMatricialDB.get(auth.tenantId) });
  } catch (err) {
    logger.error("[loth.gtf-matricial.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-loth-gtf-matricial-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: "Alguna medida está fuera de rango.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  try {
    const disposicion = await ForestGtfMatricialDB.guardar(
      auth.tenantId,
      parsed.data.formato,
      parsed.data.hoja,
      auth.username ?? "unknown",
    );
    return NextResponse.json({ disposicion });
  } catch (err) {
    logger.error("[loth.gtf-matricial.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
