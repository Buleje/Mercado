import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { AdminPreferencesDB } from "@/lib/db/admin-preferences.db";

/**
 * app/api/admin/preferences/route.ts
 *
 * Persiste preferencias de UI del admin (ej: adminMode "easy"|"advanced")
 * en Settings.featureFlagsJson bajo la clave "admin_prefs".
 *
 * GET  /api/admin/preferences  → { adminMode: "easy"|"advanced" }
 * PATCH /api/admin/preferences → body: { adminMode: "easy"|"advanced" }
 *
 * Migrado 2026-05-19 — audit project-wide: prisma.settings directo → AdminPreferencesDB.
 */

const PatchSchema = z.object({
  adminMode: z.enum(["easy", "advanced"]).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const prefs = await AdminPreferencesDB.read(auth.tenantId);
  return NextResponse.json({ adminMode: prefs["adminMode"] ?? "easy" });
}

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-preferences"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (parsed.data.adminMode !== undefined) {
    await AdminPreferencesDB.write(auth.tenantId, { adminMode: parsed.data.adminMode });
  }

  return NextResponse.json({ ok: true });
}
