import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { AdminPreferencesDB } from "@/lib/db/admin-preferences.db";
import { logger } from "@/lib/logger";

/**
 * Acceso rápido del Archivo (Drive), POR USUARIO.
 *
 * `admin_prefs` es por tienda; para no tocar el schema cada persona guarda su
 * lista en una subclave propia (`driveFijados:<usuario>`). La mezcla de
 * `AdminPreferencesDB.write` es por subclave y atómica, así que dos personas
 * guardando a la vez no se pisan.
 *
 * GET → { fijados: Fijado[] | null }   (null = nunca guardó nada: el cliente migra lo suyo)
 * PUT → body { fijados: Fijado[] }
 */

const ROLES = ["admin", "cajero", "almacenero", "manager"] as const;
const clave = (username: string) => `driveFijados:${username}`;

const FijadoSchema = z.object({
  tipo: z.enum(["carpeta", "archivo"]),
  id: z.string().min(1).max(64),
  nombre: z.string().max(300),
});
const PutSchema = z.object({ fijados: z.array(FijadoSchema).max(100) });

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ROLES);
    if (auth instanceof NextResponse) return auth;
    const prefs = await AdminPreferencesDB.read(auth.tenantId);
    const crudo = prefs[clave(auth.username)];
    const parsed = PutSchema.shape.fijados.safeParse(crudo);
    return NextResponse.json({ fijados: parsed.success ? parsed.data : null });
  } catch (e) {
    logger.error("[fijados-drive] get error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "MODERATE", "admin-fijados-drive");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ROLES);
    if (auth instanceof NextResponse) return auth;

    const body: unknown = await req.json().catch(() => ({}));
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    await AdminPreferencesDB.write(auth.tenantId, { [clave(auth.username)]: parsed.data.fijados });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[fijados-drive] put error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
