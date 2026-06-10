import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { resolveTenantSlugToId } from "@/lib/resolve-tenant";
import { assertCsrf } from "@/lib/auth/csrf";
import {
  tenantOverrideKey,
  TENANT_OVERRIDE_SCHEMA_VERSION,
  type TenantModuleOverrides,
} from "@/lib/tenant-module-overrides";

/**
 * GET    /api/superadmin/tenants/[slug]/module-overrides
 *   Lee el override de módulos de UN tenant (vacío si hereda la plantilla).
 *
 * PUT    /api/superadmin/tenants/[slug]/module-overrides
 *   Guarda módulos forzados para el tenant (visible on/off por tabId).
 *   Mandar `overrides: {}` equivale a DELETE (vuelve a heredar la plantilla).
 *
 * DELETE /api/superadmin/tenants/[slug]/module-overrides
 *   Elimina el override → el tenant vuelve a la plantilla global + su plan.
 *
 * Todas requieren sesión superadmin (cookie buleje-platform-sess).
 * El plan del tenant SIGUE siendo el techo: forzar visible un módulo que su
 * plan no desbloquea NO lo muestra (el plan-gate corre antes en el sidebar).
 */

const OverridesSchema = z.object({
  overrides: z.record(
    z.string().min(1).max(80),
    z.object({ visible: z.boolean() }).strict(),
  ),
}).strict();

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

async function storageKeyForSlug(slug: string): Promise<string | null> {
  if (!SLUG_RE.test(slug)) return null;
  const tenantId = await resolveTenantSlugToId(slug);
  return tenantOverrideKey(tenantId);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  const key = await storageKeyForSlug(slug);
  if (!key) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });

  const stored = await PlatformSettingsDB.get<TenantModuleOverrides>(key);
  return NextResponse.json({
    overrides: stored?.overrides ?? {},
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const rl = applyRateLimit(req, "STRICT", "superadmin-tenant-module-overrides");
  if (rl) return rl;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  const key = await storageKeyForSlug(slug);
  if (!key) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }

  const parsed = OverridesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Overrides inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (Object.keys(parsed.data.overrides).length > 200) {
    return NextResponse.json({ error: "Demasiados overrides" }, { status: 400 });
  }

  // Sin overrides → heredar plantilla (borra el registro, no guarda basura).
  if (Object.keys(parsed.data.overrides).length === 0) {
    await PlatformSettingsDB.delete(key);
    return NextResponse.json({ ok: true, overrides: {}, inherits: true });
  }

  const next: TenantModuleOverrides = {
    overrides: parsed.data.overrides,
    version: TENANT_OVERRIDE_SCHEMA_VERSION,
  };
  await PlatformSettingsDB.set(key, next, auth.username);

  return NextResponse.json({
    ok: true,
    overrides: next.overrides,
    savedBy: auth.username,
    savedAt: new Date().toISOString(),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const rl = applyRateLimit(req, "STRICT", "superadmin-tenant-module-overrides");
  if (rl) return rl;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  const key = await storageKeyForSlug(slug);
  if (!key) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });

  await PlatformSettingsDB.delete(key);
  return NextResponse.json({ ok: true, inherits: true });
}
