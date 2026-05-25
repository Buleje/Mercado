import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

// GET /api/superadmin/security — Security events for superadmin dashboard
export async function GET(req: NextRequest) {
  try {
    // P1 fix 2026-05-24: rate-limit defensivo (AuditLogTab + OverviewTab usan
    // este endpoint, ambos pueden disparar auto-refresh)
    const rl = await applyRateLimit(req, "GENEROUS", "superadmin-security-events");
    if (rl) return rl;

    const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_STORE_HEADERS });
    const session = await getPlatformSession(token);
    if (!session) return NextResponse.json({ error: "Sesión inválida" }, { status: 401, headers: NO_STORE_HEADERS });

    const url = new URL(req.url);
    // Brandon 2026-05-21 audit blindaje S6: `Number("0") || "7"` evalúa
    // a 7 porque 0 es falsy en JS → `?days=0` bypass del scope intencionado
    // y devuelve full history hasta el cap de 90. Ahora usamos null-check
    // explícito + Number.isFinite guard + Math.max(1) para forzar mínimo.
    const daysRaw = url.searchParams.get("days");
    const daysParsed = daysRaw === null ? 7 : Number(daysRaw);
    const days = Math.min(Math.max(Number.isFinite(daysParsed) ? daysParsed : 7, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Query security-related activity logs
    const securityActions = [
      "login_success", "login_failed", "login_locked",
      "2fa_failed", "2fa_challenge", "logout",
    ];

    const [events, summary] = await Promise.all([
      // Recent events (max 200)
      prisma.activityLog.findMany({
        where: {
          entity: "superadmin",
          action: { in: securityActions },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          action: true,
          detail: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      // Summary counts
      prisma.activityLog.groupBy({
        by: ["action"],
        where: {
          entity: "superadmin",
          action: { in: securityActions },
          createdAt: { gte: since },
        },
        _count: { action: true },
      }),
    ]);

    // Extract unique IPs from login attempts
    const ipSet = new Set<string>();
    const failedIPs = new Map<string, number>();
    for (const event of events) {
      const ipMatch = event.detail.match(/IP\s+([\d.]+|[\da-f:]+|unknown)/i);
      if (ipMatch) {
        ipSet.add(ipMatch[1]);
        if (event.action === "login_failed" || event.action === "login_locked") {
          failedIPs.set(ipMatch[1], (failedIPs.get(ipMatch[1]) ?? 0) + 1);
        }
      }
    }

    const summaryMap: Record<string, number> = {};
    for (const s of summary) {
      summaryMap[s.action] = s._count.action;
    }

    return NextResponse.json(
      {
        data: {
          events,
          summary: summaryMap,
          uniqueIPs: ipSet.size,
          suspiciousIPs: Array.from(failedIPs.entries())
            .filter(([, count]) => count >= 3)
            .map(([ip, count]) => ({ ip, failedAttempts: count }))
            .sort((a, b) => b.failedAttempts - a.failedAttempts),
          period: { days, since: since.toISOString() },
        },
      },
      { headers: NO_STORE_HEADERS },
    );

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
