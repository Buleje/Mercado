import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import type { AdminTemplate } from "@/lib/admin-template";

/**
 * GET  /api/platform/admin-template
 *   Lee la plantilla global del Panel Admin (visibilidad por módulo, plan
 *   mínimo, label custom, estilo de sidebar). Pública: admins de cualquier
 *   tenant la leen para hidratar su sidebar. No contiene PII ni secretos.
 *   El path /api/platform/* evita el guard admin-only que cubre /api/admin/*.
 *
 * PUT  /api/platform/admin-template
 *   Sobreescribe la plantilla completa. Requiere sesión de superadmin
 *   (cookie buleje-platform-sess). Persistencia vía PlatformSetting global
 *   con key="admin-template".
 */

const ADMIN_PLAN = z.enum(["basico", "pro", "enterprise", "max"]);
const SIDEBAR_STYLE = z.enum(["buleje", "ejecutivo", "sereno", "vibrante", "personalizado"]);
const STORAGE_KEY = "admin-template";
const SCHEMA_VERSION = 2;

const EMPTY_TEMPLATE: AdminTemplate = {
  overrides: {},
  order: [],
  defaultSidebarStyle: "buleje",
  version: SCHEMA_VERSION,
};

const ModuleOverrideSchema = z.object({
  visible: z.boolean().optional(),
  plan: ADMIN_PLAN.optional(),
  label: z.string().max(60).optional(),
}).strict();

const TemplateSchema = z.object({
  overrides: z.record(z.string().min(1).max(80), ModuleOverrideSchema),
  order: z.array(z.string().min(1).max(80)).max(200),
  defaultSidebarStyle: SIDEBAR_STYLE.optional(),
  version: z.number().int().nonnegative().optional(),
}).strict();

export async function GET() {
  const raw = await PlatformSettingsDB.get<AdminTemplate>(STORAGE_KEY);
  const tpl: AdminTemplate = raw ? {
    overrides: raw.overrides ?? {},
    order: raw.order ?? [],
    defaultSidebarStyle: raw.defaultSidebarStyle ?? "buleje",
    version: raw.version ?? SCHEMA_VERSION,
  } : EMPTY_TEMPLATE;
  return NextResponse.json({ template: tpl });
}

export async function PUT(req: NextRequest) {
  const rl = applyRateLimit(req, "STRICT", "superadmin-admin-template");
  if (rl) return rl;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }

  const parsed = TemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Plantilla inválida", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const next: AdminTemplate = {
    overrides: parsed.data.overrides,
    order: parsed.data.order,
    defaultSidebarStyle: parsed.data.defaultSidebarStyle ?? "buleje",
    version: SCHEMA_VERSION,
  };

  await PlatformSettingsDB.set(STORAGE_KEY, next, auth.username);

  return NextResponse.json({ ok: true, template: next, savedBy: auth.username, savedAt: new Date().toISOString() });
}
