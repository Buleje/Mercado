import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { getEventDeadLetters, getEventDlqStats, resolveEventDeadLetter, retryEventDeadLetter } from "@/lib/db/dlq.db";
import { logger } from "@/lib/logger";

/**
 * /api/superadmin/dlq/events — DLQ de eventos accionable (Brandon 2026-06-19).
 *  GET  → eventos sin resolver + stats de triage (por handler / eventType).
 *  POST → { action: "resolve" | "retry", id }. resolve marca resolvedAt; retry
 *         re-emite el evento (el handler corre de nuevo) y resuelve si tiene éxito.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const BodySchema = z.object({ action: z.enum(["resolve", "retry"]), id: z.string().min(1) });

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const [events, stats] = await Promise.all([getEventDeadLetters(), getEventDlqStats()]);
    return NextResponse.json({ events, stats, generatedAt: new Date().toISOString() }, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/dlq/events] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  const { action, id } = parsed.data;

  try {
    if (action === "resolve") {
      const ok = await resolveEventDeadLetter(id);
      return NextResponse.json({ ok, action }, { headers: NO_STORE });
    }
    const r = await retryEventDeadLetter(id);
    return NextResponse.json({ ...r, action }, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/dlq/events] POST", { action, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
