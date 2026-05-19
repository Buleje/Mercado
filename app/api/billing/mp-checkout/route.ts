import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { createMercadoPagoPreference } from "@/lib/mercadopago";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import type { PlanId } from "@/lib/plans";
import { applyRateLimit } from "@/lib/rate-limit";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/mp-checkout
//
// Crea una preferencia de Mercado Pago Checkout Pro para actualizar el plan
// de un tenant. Devuelve { init_point } — URL de redirección a la pasarela.
//
// Compatible con métodos de pago locales peruanos: Yape, PagoEfectivo,
// BCP, Interbank, Scotiabank, Plin y tarjetas nacionales.
// ─────────────────────────────────────────────────────────────────────────────

const BodySchema = z.object({
  plan: z.enum(["pro", "business", "enterprise"]),
});

export async function POST(req: NextRequest) {
  // Audit 2026-05-19: endpoint mueve dinero (MP Preferences) — STRICT.
  const _rl = await applyRateLimit(req, "STRICT", "billing-mp-checkout"); if (_rl) return _rl;
  // ── Auth ─────────────────────────────────────────────────
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  // ── Body ─────────────────────────────────────────────────
  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { rawBody = {}; }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Plan inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { plan } = parsed.data;

  // ── Tenant ───────────────────────────────────────────────
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      ownerEmail: true,
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  // Verificar que no esté ya en el plan solicitado
  if (tenant.plan === plan) {
    return NextResponse.json({ error: "Ya estás en este plan" }, { status: 409 });
  }

  // ── Crear preferencia MP ─────────────────────────────────
  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${tenant.slug}.${process.env.ROOT_DOMAIN ?? "localhost:3000"}`;

  let result: Awaited<ReturnType<typeof createMercadoPagoPreference>>;
  try {
    result = await createMercadoPagoPreference({
      plan: plan as PlanId,
      tenantSlug: tenant.slug,
      payerEmail: tenant.ownerEmail ?? "",
      payerName: tenant.name,
      successUrl: `${origin}/admin?tab=plan&mp_status=approved&plan=${plan}`,
      failureUrl: `${origin}/admin?tab=plan&mp_status=failure`,
      pendingUrl: `${origin}/admin?tab=plan&mp_status=pending`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[MP Checkout] Error creando preferencia", { tenantId, plan, err: msg });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "billing",
      tenantId,
      tags: { operation: "mp-checkout-create-preference" },
      extra: { plan },
    });
    return NextResponse.json(
      { error: "Error al crear el pago con Mercado Pago. Inténtalo de nuevo." },
      { status: 502 },
    );
  }

  // ── Persistir plan pendiente para resolución confiable en webhook ──
  await prisma.mpPendingPlan.create({
    data: {
      tenantSlug: tenant.slug,
      plan,
      preferenceId: result.id,
      externalRef: tenant.slug,
    },
  }).catch((err) => {
    logger.error("[MP Checkout] Error guardando MpPendingPlan", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "billing",
      tenantId,
      tags: { operation: "mp-checkout-save-pending-plan" },
      extra: { plan, preferenceId: result.id },
    });
  });

  logger.info("[MP Checkout] Preferencia creada", {
    tenantId,
    plan,
    preferenceId: result.id,
  });

  return NextResponse.json({
    init_point: result.init_point,
    preference_id: result.id,
  });
}
