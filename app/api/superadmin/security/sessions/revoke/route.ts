import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { revokeAllSessions } from "@/lib/superadmin-revocation";
import { logActivityQueued } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

// ─── POST /api/superadmin/security/sessions/revoke ────────────────────────────
//
// Por la naturaleza JWT stateless de las sesiones del superadmin, no podemos
// invalidar tokens individuales sin una tabla AdminSession (ADR pendiente).
//
// Lo que SÍ podemos hacer: setear un timestamp mínimo de emisión. Todo token
// emitido antes de ese instante será rechazado por `getPlatformSession` en
// su siguiente request. Esto incluye al usuario que disparó la acción.
//
// Body opcional: { all: true } — único modo soportado por ahora.

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  let body: { all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // body vacío equivale a { all: true }
  }

  if (body.all !== true) {
    return NextResponse.json(
      {
        error: "Invalidación per-sesión no soportada (sesiones JWT stateless). Enviá { all: true } para forzar logout global.",
      },
      { status: 400 },
    );
  }

  const cutoffMs = revokeAllSessions();

  // Audit log — esto SÍ tiene que quedar registrado por compliance.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  logActivityQueued(
    "sessions_revoked_all",
    "superadmin",
    `Force logout global iniciado por ${auth.username}. Cutoff: ${new Date(cutoffMs).toISOString()}. IP: ${ip}`,
    undefined,
    auth.username,
    undefined,
    "superadmin",
  ).catch((err) => logger.error("[security/sessions/revoke] activity log failed", { error: String(err) }));

  return NextResponse.json({
    data: {
      ok: true,
      cutoff: new Date(cutoffMs).toISOString(),
      note: "Todas las sesiones (incluyendo la tuya) serán invalidadas en su próximo request.",
    },
  });
}
