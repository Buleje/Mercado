import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { getClientErrors, getClientErrorStats, resolveClientError } from "@/lib/db/client-errors.db";
import { logger } from "@/lib/logger";

/**
 * /api/superadmin/tenant-errors — errores en vivo del panel admin de los
 * negocios (Brandon 2026-06-19). GET: lista + stats. POST { action:"resolve", id }.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const BodySchema = z.object({ action: z.literal("resolve"), id: z.string().min(1) });

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const [errors, stats] = await Promise.all([getClientErrors(120), getClientErrorStats()]);
    return NextResponse.json({ errors, stats, generatedAt: new Date().toISOString() }, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/tenant-errors] GET", { err: e instanceof Error ? e.message : String(e) });
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
    const ok = await resolveClientError(parsed.data.id, auth.username);
    return NextResponse.json({ ok }, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/tenant-errors] POST", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
