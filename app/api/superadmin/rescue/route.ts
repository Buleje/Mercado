import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { getRescueQueue, extendTenantTrial } from "@/lib/db/rescue.db";
import { logger } from "@/lib/logger";

/**
 * /api/superadmin/rescue — Cola de rescate (Brandon 2026-06-19, idea #3). GET:
 * negocios en riesgo rankeados + KPIs. POST { action:"extend-trial", slug, days }.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const BodySchema = z.object({ action: z.literal("extend-trial"), slug: z.string().min(1), days: z.number().int().min(1).max(90) });

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const data = await getRescueQueue();
    return NextResponse.json({ ...data, generatedAt: new Date().toISOString() }, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/rescue] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  try {
    const r = await extendTenantTrial(parsed.data.slug, parsed.data.days);
    return NextResponse.json(r, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/rescue] POST", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
