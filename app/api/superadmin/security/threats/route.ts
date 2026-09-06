import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { getThreatOverview } from "@/lib/security/security-events";
import { blockIp, unblockIp, DEFAULT_BLOCK_TTL_SEC } from "@/lib/security/ip-blocklist";
import { logger } from "@/lib/logger";

/**
 * GET  /api/superadmin/security/threats  → overview del WAF (tab Amenazas)
 * POST /api/superadmin/security/threats  → bloquear / desbloquear una IP manual
 *
 * Alimenta el tab "Amenazas" del Security Center. Superadmin-only.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const windowDays = Math.min(30, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") || "7")));
    const overview = await getThreatOverview(windowDays);
    return NextResponse.json(overview);
  } catch (err) {
    logger.error("[security/threats] GET error", { error: String(err) });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

const ActionSchema = z.object({
  action: z.enum(["block", "unblock"]),
  ip: z.string().min(3).max(60),
  reason: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { action, ip, reason } = parsed.data;

  try {
    if (action === "block") {
      await blockIp(ip, reason ? `manual: ${reason}` : "manual (superadmin)", DEFAULT_BLOCK_TTL_SEC);
    } else {
      await unblockIp(ip);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[security/threats] POST error", { error: String(err) });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
