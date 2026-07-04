import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { findTenantByIdOrSlug } from "@/lib/tenant";
import { recordRumSamples, type RumSample } from "@/lib/rum-history";
import { logger } from "@/lib/logger";

/**
 * POST /api/analytics/vitals — beacon público de Core Web Vitals RUM.
 *
 * Lo dispara `components/WebVitalsReporter.tsx` UNA vez por page-load
 * (sendBeacon al ocultarse la página) con las métricas finales de la visita.
 * Alimenta el rollup diario per-tenant que muestra el admin en
 * ?tab=rendimiento → "Historial real" (lib/rum-history.ts).
 *
 * Exento de CSRF (sendBeacon no permite headers) — ver lib/csrf.ts; a cambio:
 * rate-limit STRICT + Zod safeParse + validación de tenant existente + solo
 * suma números a un rollup (sin datos sensibles ni estado de usuario).
 */

const MetricSchema = z.object({
  // LCP/INP/TTFB en ms, CLS unitless — 120s como techo anti-basura.
  value: z.number().finite().nonnegative().max(120_000),
  rating: z.enum(["good", "needs-improvement", "poor"]),
});

const BodySchema = z.object({
  tenantSlug: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  metrics: z.object({
    lcp: MetricSchema.optional(),
    cls: MetricSchema.optional(),
    inp: MetricSchema.optional(),
    ttfb: MetricSchema.optional(),
  }),
});

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "analytics-vitals");
  if (rl) return rl;

  // Beacon best-effort: nunca devolver error al cliente — un vital perdido
  // no debe generar retries ni ruido en consola de la tienda.
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: true });

    const { tenantSlug, metrics } = parsed.data;
    const tenant = await findTenantByIdOrSlug(tenantSlug);
    if (!tenant) return NextResponse.json({ ok: true });

    const samples: RumSample[] = [];
    for (const metric of ["lcp", "cls", "inp", "ttfb"] as const) {
      const m = metrics[metric];
      if (m) samples.push({ metric, value: m.value, rating: m.rating });
    }

    recordRumSamples(tenant.id, samples).catch((err) =>
      logger.error("[analytics/vitals] rollup failed", { error: String(err) }),
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
