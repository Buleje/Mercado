import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { revokeAllSessions } from "@/lib/superadmin-revocation";
import { logActivityQueued } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

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
  // P1 fix 2026-05-24: STRICT en lugar de GENEROUS — esta acción es
  // destructiva (invalida TODAS las sesiones, incluso la del operador).
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-security-sessions-revoke");
  if (_rl) return _rl;

  // P1 fix 2026-05-24: CSRF estricto. Sin esto, una página atacante visitada
  // por un superadmin logueado podía disparar el force-logout global como CSRF.
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();

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
      { status: 400, headers: NO_STORE_HEADERS },
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

  return NextResponse.json(
    {
      data: {
        ok: true,
        cutoff: new Date(cutoffMs).toISOString(),
        note: "Todas las sesiones (incluyendo la tuya) serán invalidadas en su próximo request.",
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}
