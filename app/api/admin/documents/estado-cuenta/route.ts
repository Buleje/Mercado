import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { CarpetaAjenaError } from "@/lib/db/documents.db";
import { SubidaFallidaError } from "@/lib/db/enlaces-entidad.db";
import { archivarEstadoDeCuenta } from "@/lib/adelantos/estado-cuenta-archivar.server";

const Body = z.object({ terceroId: z.string().trim().min(1).max(100), nombre: z.string().trim().min(1).max(120) });

/**
 * POST /api/admin/documents/estado-cuenta — arma el estado de cuenta de un
 * tercero (el `DbBeneficiario.id` de Adelantos) en PDF y lo archiva en
 * «Terceros/<nombre>» con el tag `tercero:<id>`, visible sólo a admin/owner.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "documents:estado-cuenta");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const { terceroId, nombre } = parsed.data;

    // Ownership por tenantId en el WHERE: un tercero de otro negocio no existe (null).
    const hecho = await archivarEstadoDeCuenta(auth.tenantId, terceroId, {
      nombreRespaldo: nombre,
      rol: auth.role,
      usuario: auth.username,
    });
    if (!hecho) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, documentId: hecho.documentId });
  } catch (e) {
    if (e instanceof CarpetaAjenaError) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    if (e instanceof SubidaFallidaError) return NextResponse.json({ error: "storage_upload_fail" }, { status: 502 });
    logger.error("[documents.estado-cuenta] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "estado_cuenta_failed" }, { status: 500 });
  }
}
