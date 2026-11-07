import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { AdminPreferencesDB } from "@/lib/db/admin-preferences.db";
import { logger } from "@/lib/logger";

/**
 * «Mi orden» de Documentos › Esenciales: el orden en que el negocio quiere ver
 * sus carpetas esenciales. Es del NEGOCIO (como la marca de la carpeta), no de
 * cada persona: lo ordena el dueño o un administrador y todos lo ven igual.
 * Vive en `admin_prefs` (subclave `esencialesOrden`), sin schema.
 *
 * GET → { orden: string[] | null }   (null = nunca se ordenó a mano)
 * PUT → body { orden: string[] }     (ids de carpeta, en orden)
 */

const CLAVE = "esencialesOrden";
const Orden = z.array(z.string().min(1).max(64)).max(200);
const PutSchema = z.object({ orden: Orden });

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const prefs = await AdminPreferencesDB.read(auth.tenantId);
    const parsed = Orden.safeParse(prefs[CLAVE]);
    return NextResponse.json({ orden: parsed.success ? parsed.data : null });
  } catch (e) {
    logger.error("[esenciales-orden] get error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "MODERATE", "admin-esenciales-orden");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    // Los mismos que pueden marcar carpetas como esenciales (`folders/bulk`).
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const body: unknown = await req.json().catch((err: unknown) => {
      logger.warn("[esenciales-orden] cuerpo sin JSON", { err: String(err) });
      return {};
    });
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    await AdminPreferencesDB.write(auth.tenantId, { [CLAVE]: [...new Set(parsed.data.orden)] });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[esenciales-orden] put error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
