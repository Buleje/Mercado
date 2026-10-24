import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";

/**
 * DELETE /api/adelantos/[id]/enlace-firma/[enlaceId] — revocar un enlace de
 * firma pendiente (ADR-491). Es `write`, no `delete`: no hace desaparecer
 * ninguna deuda ni firma, sólo cierra la puerta del celular.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; enlaceId: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-enlace-firma"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const { id, enlaceId } = await params;
  try {
    const r = await AdelantoFirmasDB.revocarEnlace(auth.tenantId, id, enlaceId);
    if (r === "no-existe") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (r === "ya-cerrado") return NextResponse.json({ error: "Ese enlace ya se usó o ya estaba revocado.", code: "ya_cerrado" }, { status: 409 });
    logActivity("Revocar enlace", "adelanto", `Adelanto ${id}: enlace de firma revocado`, id, auth.username, undefined, auth.tenantId).catch((err) =>
      logger.error("[adelantos/enlace-firma] logActivity failed", { error: String(err) }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[adelantos/enlace-firma] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
