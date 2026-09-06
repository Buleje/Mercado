import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security/security-events";
import { logger } from "@/lib/logger";

/**
 * POST /api/internal/security-event
 *
 * Sink interno del WAF. Lo llama fire-and-forget el middleware (proxy.ts, Edge)
 * cuando detecta firmas de ataque. Persiste el evento (ActivityLog) y escala a
 * auto-bloqueo de la IP si reincide.
 *
 * Auth: x-internal-key === INTERNAL_API_KEY | CRON_SECRET (mismo patrón que
 * /api/internal/audit-log). No expuesto a clientes.
 */

const ThreatSchema = z.object({
  type: z.enum(["sqli", "nosqli", "xss", "path_traversal", "command_injection", "code_injection", "ssrf", "scanner", "sensitive_probe"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  evidence: z.string().max(200),
});

const BodySchema = z.object({
  ip: z.string().max(60),
  path: z.string().max(300),
  method: z.string().max(10),
  userAgent: z.string().max(300),
  threats: z.array(ThreatSchema).min(1).max(20),
  maxSeverity: z.enum(["low", "medium", "high", "critical"]),
  blockedInline: z.boolean(),
  requestId: z.string().max(100).optional(),
  tenantId: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "internal-security-event"); if (_rl) return _rl;

  const internalKey = req.headers.get("x-internal-key");
  const expected = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET;
  if (!expected || internalKey !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await recordSecurityEvent(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[security-event] persist failed", { error: String(err) });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
