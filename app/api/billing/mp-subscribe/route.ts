import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { createMPSubscription } from "@/lib/mercadopago";
import { logger } from "@/lib/logger";
import type { PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/mp-subscribe
//
// Crea una suscripción recurrente mensual con Mercado Pago Preapproval.
// El tenant admin llama a este endpoint, recibe init_point y redirige al
// usuario a la pasarela de MP para autorizar el débito automático mensual.
//
// Body: { plan: "pro" | "business" | "enterprise" }
// Respuesta: { init_point: string }
// ─────────────────────────────────────────────────────────────────────────────

const BodySchema = z.object({
  plan: z.enum(["pro", "business", "enterprise"]),
});

export async function POST(req: NextRequest) {
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
      mpSubscriptionId: true,
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  // Verificar que no esté ya en el plan solicitado con suscripción activa
  if (tenant.plan === plan && tenant.mpSubscriptionId) {
    return NextResponse.json(
      { error: "Ya tienes una suscripción activa en este plan" },
      { status: 409 },
    );
  }

  // ── Construir back_url ───────────────────────────────────
  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${tenant.slug}.${process.env.ROOT_DOMAIN ?? "localhost:3000"}`;

  const backUrl = `${origin}/admin?tab=plan&mp_sub_status=success&plan=${plan}`;

  // ── Crear suscripción Preapproval ────────────────────────
  let result: Awaited<ReturnType<typeof createMPSubscription>>;
  try {
    result = await createMPSubscription({
      plan: plan as PlanId,
      tenantSlug: tenant.slug,
      payerEmail: tenant.ownerEmail ?? "",
      backUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[MP Subscribe] Error creando suscripción Preapproval", {
      tenantId,
      plan,
      err: msg,
    });
    return NextResponse.json(
      { error: "Error al crear la suscripción con Mercado Pago. Inténtalo de nuevo." },
      { status: 502 },
    );
  }

  // ── Guardar preapprovalId en Tenant ─────────────────────
  // El plan se actualiza cuando MP confirma el primer pago via webhook.
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { mpSubscriptionId: result.preapprovalId },
  });

  logger.info("[MP Subscribe] Suscripción Preapproval creada", {
    tenantId,
    plan,
    preapprovalId: result.preapprovalId,
  });

  // Log de actividad (fire-and-forget)
  prisma.activityLog
    .create({
      data: {
        action: "subscription_initiated",
        entity: "tenant",
        entityId: tenant.slug,
        detail: `Suscripción MP Preapproval iniciada para plan ${plan} (id: ${result.preapprovalId})`,
        user: "admin",
        tenantId: tenant.slug,
      },
    })
    .catch(() => {});

  return NextResponse.json({
    init_point: result.init_point,
    preapproval_id: result.preapprovalId,
  });
}
