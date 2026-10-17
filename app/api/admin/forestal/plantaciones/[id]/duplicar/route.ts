import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestPlantacionesDB } from "@/lib/db/forest-plantaciones.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/** POST /api/admin/forestal/plantaciones/[id]/duplicar — copia titular, predio,
 *  bloques, vértices y especies a un borrador nuevo (§16 del módulo). Sin
 *  documentos adjuntos ni código SERFOR: son propios de CADA presentación. */
export const POST = withApiHandler("forestal-plantacion-duplicar", async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:forestal:tramites");
  if (!ok) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo Trámites y Oficios no está habilitado para esta tienda." },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  try {
    const plantacion = await ForestPlantacionesDB.duplicar(auth.tenantId, id, auth.username ?? "unknown");
    return NextResponse.json({ plantacion }, { status: 201 });
  } catch (err) {
    logger.error("[plantaciones.DUPLICAR] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
