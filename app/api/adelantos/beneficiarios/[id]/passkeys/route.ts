import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { AdelantoPasskeysDB } from "@/lib/db/adelanto-passkeys.db";

/**
 * GET /api/adelantos/beneficiarios/[id]/passkeys — ADR-513. Las huellas de
 * celular (passkeys) registradas por la persona, también las revocadas. Nunca
 * sale la llave pública ni el credentialId: sólo dominio, celular y fechas.
 * Una persona de otro negocio da lista vacía (el WHERE lleva `tenantId`).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-benef"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  try {
    const { id } = await params;
    const passkeys = await AdelantoPasskeysDB.listarDeLaPersona(auth.tenantId, id);
    return NextResponse.json({ passkeys }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[adelantos/beneficiarios/passkeys] GET error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
