import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * app/api/admin/preferences/route.ts
 *
 * Persiste preferencias de UI del admin (ej: adminMode "easy"|"advanced")
 * en Settings.featureFlagsJson bajo la clave "admin_prefs".
 *
 * GET  /api/admin/preferences        → { adminMode: "easy"|"advanced" }
 * PATCH /api/admin/preferences       → body: { adminMode: "easy"|"advanced" }
 */

const PatchSchema = z.object({
  adminMode: z.enum(["easy", "advanced"]).optional(),
});

async function readPrefs(tenantId: string): Promise<Record<string, unknown>> {
  const row = await prisma.settings.findFirst({
    where: { tenantId },
    select: { featureFlagsJson: true },
  });
  if (!row?.featureFlagsJson) return {};
  try {
    const flags = JSON.parse(row.featureFlagsJson) as Record<string, unknown>;
    const prefs = flags["admin_prefs"];
    return typeof prefs === "object" && prefs !== null
      ? (prefs as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function writePrefs(
  tenantId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const row = await prisma.settings.findFirst({
    where: { tenantId },
    select: { featureFlagsJson: true },
  });
  let flags: Record<string, unknown> = {};
  if (row?.featureFlagsJson) {
    try {
      flags = JSON.parse(row.featureFlagsJson) as Record<string, unknown>;
    } catch { /* ignore corrupt JSON */ }
  }
  const existing = typeof flags["admin_prefs"] === "object" && flags["admin_prefs"] !== null
    ? (flags["admin_prefs"] as Record<string, unknown>)
    : {};
  flags["admin_prefs"] = { ...existing, ...patch };

  await prisma.settings.upsert({
    where: { tenantId },
    create: { tenantId, featureFlagsJson: JSON.stringify(flags) },
    update: { featureFlagsJson: JSON.stringify(flags) },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const prefs = await readPrefs(auth.tenantId);
  return NextResponse.json({ adminMode: prefs["adminMode"] ?? "easy" });
}

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-preferences"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (parsed.data.adminMode !== undefined) {
    await writePrefs(auth.tenantId, { adminMode: parsed.data.adminMode });
  }

  return NextResponse.json({ ok: true });
}
