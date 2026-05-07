/**
 * POST /api/admin/webhook-replay
 *
 * Proxy server-side para que admins (UI /admin/webhook-queue) disparen el
 * replay de eventos pendientes de Stripe SIN exponer CRON_SECRET al cliente.
 *
 * SECURITY 2026-05-07 (audit P0-1 production): antes el cliente leía
 * `process.env.NEXT_PUBLIC_CRON_SECRET` que terminaba en el bundle público
 * — cualquier usuario podía disparar los 55 crons. Ahora el cliente solo
 * envía la cookie admin (httpOnly), y este proxy sirve como gate:
 *  1. Valida sesión admin via requireAdmin (rol owner/admin/manager)
 *  2. Lee CRON_SECRET server-side
 *  3. Llama internamente al endpoint privado /api/billing/webhook-replay
 *  4. Devuelve el resultado al cliente
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "admin-webhook-replay");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("[admin/webhook-replay] CRON_SECRET no configurado");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://${req.headers.get("host") ?? "localhost:3000"}`;

  try {
    const replayRes = await fetch(`${baseUrl}/api/billing/webhook-replay`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const data = await replayRes.json().catch(() => ({}));

    logger.info("[admin/webhook-replay] Replay disparado por admin", {
      tenantId: auth.tenantId,
      username: auth.username,
      status: replayRes.status,
      replayed: data.replayed,
      failed: data.failed,
    });

    return NextResponse.json(data, { status: replayRes.status });
  } catch (err) {
    logger.error("[admin/webhook-replay] Error proxy", {
      error: String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
