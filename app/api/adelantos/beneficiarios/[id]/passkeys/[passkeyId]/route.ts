import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { AdelantoPasskeysDB } from "@/lib/db/adelanto-passkeys.db";

/**
 * DELETE /api/adelantos/beneficiarios/[id]/passkeys/[passkeyId] — ADR-513.
 * Revoca la huella de celular de la persona (celular perdido o cambiado). Sólo
 * admin/dueño (`permisoAdelantos(…, "delete")`). No borra la fila: las firmas
 * ya hechas con esa llave siguen verificables; deja de servir para firmar.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; passkeyId: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-benef"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "delete");
  if (sinPermiso) return sinPermiso;
  try {
    const { id, passkeyId } = await params;
    const r = await AdelantoPasskeysDB.revocar(auth.tenantId, id, passkeyId, auth.username);
    if (r === "no-existe") return NextResponse.json({ error: "Esa huella de celular no existe." }, { status: 404 });
    if (r === "ya-revocada") return NextResponse.json({ error: "Esa huella de celular ya estaba revocada." }, { status: 409 });
    logActivity("Revocar", "adelanto", `Persona ${id}: huella de celular (passkey) revocada`, id, auth.username, undefined, auth.tenantId).catch((err) =>
      logger.error("[adelantos/beneficiarios/passkeys] logActivity failed", { error: String(err) }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[adelantos/beneficiarios/passkeys] DELETE error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
