import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

// ─── GET /api/superadmin/security/sessions ────────────────────────────────────
//
// Devuelve sesiones de superadmin "activas" derivadas del audit log.
//
// IMPORTANTE: las sesiones del superadmin son JWT stateless (sin tabla en DB).
// "Activa" = login_success en las últimas 8h sin logout posterior por el mismo
// usuario. Es una APROXIMACIÓN honesta — el frontend muestra disclaimer.
//
// Para invalidación per-sesión hace falta una tabla AdminSession (ADR pendiente).
// Por ahora ofrecemos "Forzar logout global" que rota el corte de issuedAt.

const SESSION_WINDOW_MS = 8 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  // P1 fix 2026-05-24: rate-limit defensivo + cache no-store
  const rl = await applyRateLimit(req, "GENEROUS", "superadmin-security-sessions");
  if (rl) return rl;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const since = new Date(Date.now() - SESSION_WINDOW_MS);

  // Filtramos por entity="superadmin" (no tenantId) — captura todos los logins
  // del superadmin sin importar dónde quedaron grabados.
  const events = await prisma.activityLog.findMany({
    where: {
      entity: "superadmin",
      action: { in: ["login_success", "logout"] },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, action: true, user: true, detail: true, ipAddress: true, createdAt: true },
    take: 200,
  });

  // Indexar por usuario el último login y el último logout
  type UserState = {
    lastLogin?: { id: string; at: Date; ip: string | null; detail: string };
    lastLogout?: Date;
  };
  const byUser = new Map<string, UserState>();
  for (const e of events) {
    const state = byUser.get(e.user) ?? {};
    if (e.action === "login_success") {
      if (!state.lastLogin || e.createdAt > state.lastLogin.at) {
        state.lastLogin = {
          id: e.id,
          at: e.createdAt,
          ip: e.ipAddress ?? extractIpFromDetail(e.detail),
          detail: e.detail,
        };
      }
    } else if (e.action === "logout") {
      if (!state.lastLogout || e.createdAt > state.lastLogout) state.lastLogout = e.createdAt;
    }
    byUser.set(e.user, state);
  }

  // Una sesión está "activa" si: tiene login y (no tiene logout O el logout fue antes del login)
  const sessions = Array.from(byUser.entries())
    .filter(([, s]) => s.lastLogin && (!s.lastLogout || s.lastLogin.at > s.lastLogout))
    .map(([user, s]) => ({
      id: s.lastLogin!.id,
      user,
      ip: s.lastLogin!.ip,
      // Parse user-agent del detail (formato: ua="..." en webhooks)
      userAgent: extractUserAgentFromDetail(s.lastLogin!.detail),
      startedAt: s.lastLogin!.at.toISOString(),
      // En sesiones derivadas, lastSeen ≈ startedAt (no podemos saber actividad real)
      lastSeen: s.lastLogin!.at.toISOString(),
      isCurrent: user === auth.username,
    }))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  return NextResponse.json(
    {
      data: {
        sessions,
        windowMs: SESSION_WINDOW_MS,
        // Disclaimer honesto: el frontend lo muestra al usuario para que sepa
        // las limitaciones del enfoque actual.
        note: "Sesiones JWT stateless: lista derivada del audit log. Para invalidación efectiva, usar 'Forzar logout global'.",
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}

function extractIpFromDetail(detail: string): string | null {
  const m = detail.match(/IP\s+([\d.]+|[\da-f:]+)/i);
  return m ? m[1] : null;
}

function extractUserAgentFromDetail(detail: string): string | null {
  const m = detail.match(/ua="([^"]+)"/);
  return m ? m[1] : null;
}
