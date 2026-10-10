/**
 * lib/middleware/threat-detection.ts
 *
 * Capa WAF del middleware (proxy.ts) — Edge runtime. Tres funciones:
 *   1. Rechaza IPs en la blocklist (auto-baneadas por reincidencia).
 *   2. Detecta firmas de ataque (SQLi/XSS/traversal/etc.) con detectThreats.
 *   3. Bloquea inline (403) los ataques de firma crítica + reporta el evento
 *      fire-and-forget al sink interno (que persiste + escala a auto-ban).
 *
 * Fail-open y barato: la detección es regex pura; la blocklist solo se consulta
 * si Upstash está configurado (en dev no agrega latencia). Un fallo nunca debe
 * romper una request legítima.
 */

import { NextResponse, type NextRequest } from "next/server";
import { detectThreats } from "@/lib/security/threat-signatures";
import { isIpBlocked, isBlocklistEnabled, isTrustedIp } from "@/lib/security/ip-blocklist";

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function forbidden(reason: string): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: "forbidden", reason }),
    { status: 403, headers: { "content-type": "application/json", "x-waf": "blocked" } },
  );
}

/** Reporte fire-and-forget al sink interno (no bloquea la respuesta). */
function report(req: NextRequest, pathname: string, ip: string, tenantId: string, requestId: string, detected: ReturnType<typeof detectThreats>): void {
  const internalKey = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET;
  if (!internalKey) return;
  try {
    const url = new URL("/api/internal/security-event", req.url);
    fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": internalKey },
      body: JSON.stringify({
        ip: ip.slice(0, 60),
        path: pathname.slice(0, 300),
        method: req.method,
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
        threats: detected.threats,
        maxSeverity: detected.maxSeverity,
        blockedInline: detected.shouldBlock,
        requestId,
        tenantId,
      }),
    }).catch(() => { /* fire-and-forget: Edge no reintenta */ });
  } catch {
    /* URL inválida u otra — nunca romper la request */
  }
}

/**
 * Corre el WAF sobre la request. Devuelve un 403 (blocklist o firma crítica) o
 * null para dejar pasar. Se invoca en proxy.ts después del rate-limit.
 */
export async function guardThreats(
  req: NextRequest,
  pathname: string,
  tenantId: string,
  requestId: string,
): Promise<NextResponse | null> {
  const ip = clientIp(req);

  // 0. IPs de confianza (dueño/oficina) → nunca bloquear ni analizar. Evita
  //    que un falso positivo deje al dueño afuera de su propio panel.
  if (isTrustedIp(ip)) return null;

  // 1. Blocklist — IPs auto/manual-baneadas (solo si Upstash está activo).
  if (isBlocklistEnabled()) {
    try {
      if (await isIpBlocked(ip)) return forbidden("ip_blocked");
    } catch {
      /* fail-open */
    }
  }

  // 2. Firmas de ataque en path + query + user-agent.
  const detected = detectThreats({
    pathname,
    search: req.nextUrl.search,
    userAgent: req.headers.get("user-agent") ?? "",
  });

  if (detected.threats.length === 0) return null;

  // 3. Registrar (fire-and-forget) y bloquear inline si es crítico.
  report(req, pathname, ip, tenantId, requestId, detected);
  if (detected.shouldBlock) return forbidden("attack_signature");

  return null;
}
