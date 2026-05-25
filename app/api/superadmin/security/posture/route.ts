import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── GET /api/superadmin/security/posture ─────────────────────────────────────
//
// KPIs unificados del Security Center. Un solo round-trip alimenta los 4
// stat-cards del Overview + el chart de logins (7d) + los checks de postura.
//
// Por qué endpoint dedicado: antes el frontend componía mocks por su cuenta.
// Centralizamos en backend para que la lógica viva una sola vez y los
// datos sean siempre coherentes con el audit log real.

const SECURITY_ACTIONS = [
  "login_success",
  "login_failed",
  "login_locked",
  "login_honeypot",
  "2fa_failed",
  "2fa_challenge",
  "logout",
] as const;

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const since8h = new Date(now - 8 * 60 * 60 * 1000);

    // Filtramos por entity="superadmin" porque el endpoint /api/superadmin/auth
    // graba con entity="superadmin" pero tenantId default ("main"). Más robusto
    // que filtrar por tenantId — captura todos los eventos de seguridad
    // independiente del tenant donde quedaron registrados.
    const [recentEvents, totpStatus, weekEvents] = await Promise.all([
      prisma.activityLog.findMany({
        where: {
          entity: "superadmin",
          action: { in: [...SECURITY_ACTIONS] },
          createdAt: { gte: since24h },
        },
        orderBy: { createdAt: "desc" },
        select: { action: true, detail: true, ipAddress: true, createdAt: true, user: true },
        take: 500,
      }),
      prisma.superadminUser.findMany({
        select: { username: true, totpEnabledAt: true, lastLoginAt: true },
      }),
      prisma.activityLog.findMany({
        where: {
          entity: "superadmin",
          action: { in: ["login_success", "login_failed"] },
          createdAt: { gte: since7d },
        },
        select: { action: true, createdAt: true },
      }),
    ]);

    // Login fallidos 24h
    const loginsFailed24h = recentEvents.filter(
      (e) => e.action === "login_failed" || e.action === "login_locked",
    ).length;

    // IPs bloqueadas: las que tienen >= 5 fails en las últimas 24h (regla actual del lockout).
    const failByIp = new Map<string, number>();
    for (const e of recentEvents) {
      if (e.action !== "login_failed" && e.action !== "login_locked") continue;
      // Extraer IP del detail o ipAddress (compatibilidad con ambos)
      const ip = e.ipAddress ?? e.detail.match(/IP\s+([\d.]+|[\da-f:]+)/i)?.[1];
      if (!ip || ip === "unknown") continue;
      failByIp.set(ip, (failByIp.get(ip) ?? 0) + 1);
    }
    const ipsBlocked = Array.from(failByIp.values()).filter((c) => c >= 5).length;

    // Sesiones "activas" estimadas: login_success en las últimas 8h sin logout posterior
    // por el mismo usuario. Es una aproximación honesta — los JWT son stateless,
    // por lo que esto es lo más cercano a "activo" que podemos saber sin tabla.
    const recentLoginsByUser = new Map<string, Date>();
    const recentLogoutsByUser = new Map<string, Date>();
    for (const e of recentEvents) {
      if (e.createdAt < since8h) continue;
      if (e.action === "login_success") {
        const cur = recentLoginsByUser.get(e.user);
        if (!cur || e.createdAt > cur) recentLoginsByUser.set(e.user, e.createdAt);
      } else if (e.action === "logout") {
        const cur = recentLogoutsByUser.get(e.user);
        if (!cur || e.createdAt > cur) recentLogoutsByUser.set(e.user, e.createdAt);
      }
    }
    let activeSessions = 0;
    for (const [user, loginAt] of recentLoginsByUser.entries()) {
      const logoutAt = recentLogoutsByUser.get(user);
      if (!logoutAt || loginAt > logoutAt) activeSessions += 1;
    }

    // TOTP coverage entre superadmins (schema no tiene flag active — todos cuentan).
    const activeAdmins = totpStatus;
    const totpEnrolled = activeAdmins.filter((s) => s.totpEnabledAt !== null).length;

    // Series de 7 días para chart (failed vs succeeded por día)
    const daySeries: Array<{ day: string; failed: number; succeeded: number; iso: string }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const end = start + 24 * 60 * 60 * 1000;
      let failed = 0;
      let succeeded = 0;
      for (const e of weekEvents) {
        const t = e.createdAt.getTime();
        if (t < start || t >= end) continue;
        if (e.action === "login_success") succeeded += 1;
        else if (e.action === "login_failed") failed += 1;
      }
      daySeries.push({
        day: d.toLocaleDateString("es-PE", { weekday: "short", timeZone: "America/Lima" }),
        failed,
        succeeded,
        iso: d.toISOString(),
      });
    }

    return NextResponse.json({
      data: {
        // KPIs hero
        vulnerabilities: {
          // Honest stub: sin escáner conectado. El frontend muestra estado "no conectado".
          count: 0,
          connected: false,
          scannerName: null,
        },
        loginsFailed24h,
        ipsBlocked,
        activeSessions,
        // Postura
        totpCoverage: {
          enrolled: totpEnrolled,
          total: activeAdmins.length,
          admins: activeAdmins.map((a) => ({
            username: a.username,
            totpEnabled: a.totpEnabledAt !== null,
            lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
          })),
        },
        // Chart 7d
        loginSeries7d: daySeries,
        // Meta
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
