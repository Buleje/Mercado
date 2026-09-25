import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getLatestDeploy } from "@/lib/slo/vercel-provider";
import { getTopErrors } from "@/lib/slo/sentry-provider";
import { getCheckoutFunnel } from "@/lib/slo/posthog-funnel";

/**
 * GET /api/superadmin/slo/overview
 *
 * Agrega el estado de salud de la plataforma desde fuentes REALES:
 *  - Vercel  → último deploy (VERCEL_TOKEN)
 *  - Sentry  → top errores 24h (SENTRY_AUTH_TOKEN + ORG + PROJECT)
 *  - PostHog → checkout funnel 30d (POSTHOG_PERSONAL_API_KEY + PROJECT_ID)
 *
 * Cada fuente reporta su `status` honesto (live / empty / not_configured /
 * error). Reemplaza el MOCK_DATA que mostraba números inventados. CronHealth
 * lo sigue sirviendo /api/superadmin/cron-health (datos de DB). Endpoint
 * separado del /api/superadmin/slo de error-budgets (deploy gate) — distinto fin.
 */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "superadmin-slo-overview");
  if (rl) return rl;

  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const session = token ? await getPlatformSession(token) : null;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [vercel, sentry, posthog] = await Promise.all([
      getLatestDeploy(),
      getTopErrors(24),
      getCheckoutFunnel(30),
    ]);

    return NextResponse.json({
      deploy: vercel.deploy,
      sentryErrors: sentry.errors,
      checkoutFunnel: posthog.steps,
      sources: {
        vercel: vercel.status,
        sentry: sentry.status,
        posthog: posthog.status,
      },
      loadedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[api/superadmin/slo/overview] aggregation failed", { error: String(err) });
    return NextResponse.json({ error: "Error al cargar SLO" }, { status: 500 });
  }
}
