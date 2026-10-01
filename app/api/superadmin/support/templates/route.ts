import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { MessageTemplatesDB } from "@/lib/db/message-templates.db";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";
import { logger } from "@/lib/logger";

/**
 * Respuestas guardadas para la bandeja de soporte del superadmin.
 * Reutiliza MessageTemplatesDB scopeado al tenant sintético de plataforma,
 * filtrando por la categoría "soporte" (aislado de otros usos de templates).
 */
const SUPPORT_CATEGORY = "soporte";

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "sa-support-templates:list");
  if (rl) return rl;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const all = await MessageTemplatesDB.list(SUPERADMIN_DOCS_TENANT);
    const templates = all
      .filter((t) => t.category === SUPPORT_CATEGORY)
      .map((t) => ({ id: t.id, name: t.name, body: t.body, starred: t.starred }));
    return NextResponse.json({ templates });
  } catch (e) {
    logger.error("[superadmin/support/templates] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  body: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "sa-support-templates:create");
  if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const t = await MessageTemplatesDB.create(SUPERADMIN_DOCS_TENANT, {
      name: parsed.data.name,
      channel: "email",
      category: SUPPORT_CATEGORY,
      subject: null,
      body: parsed.data.body,
    });
    return NextResponse.json({ template: { id: t.id, name: t.name, body: t.body, starred: t.starred } });
  } catch (e) {
    logger.error("[superadmin/support/templates] POST error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
