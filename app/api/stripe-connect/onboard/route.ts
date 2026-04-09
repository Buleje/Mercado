/**
 * POST /api/stripe-connect/onboard
 * Inicia el onboarding de Stripe Connect Express para la tienda del tenant.
 * Guarda el accountId en ActivityLog (acción "stripe_connect_account") y
 * retorna la URL de onboarding para redirigir al comerciante.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod/v4";
import { createConnectedAccount } from "@/lib/stripe-connect";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  email: z.string().email(),
  businessName: z.string().min(2).max(120),
  country: z.string().length(2).optional(), // ISO 3166-1 alpha-2, ej: "PE"
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();

  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { email, businessName, country } = parsed.data;

    // Verificar si ya existe una cuenta conectada para este tenant
    const existing = await prisma.activityLog.findFirst({
      where: { tenantId: auth.tenantId, action: "stripe_connect_account" },
      orderBy: { createdAt: "desc" },
      select: { entityId: true },
    });

    if (existing?.entityId) {
      return NextResponse.json(
        { error: "Ya existe una cuenta conectada para este tenant", accountId: existing.entityId },
        { status: 409 },
      );
    }

    logger.info("[StripeConnect/onboard] Iniciando onboarding", {
      tenantId: auth.tenantId,
      email,
      traceId,
    });

    const { accountId, onboardingUrl } = await createConnectedAccount({
      tenantId: auth.tenantId,
      email,
      businessName,
      country,
    });

    // Persistir el accountId usando los campos reales del modelo ActivityLog
    await prisma.activityLog.create({
      data: {
        tenantId: auth.tenantId,
        action: "stripe_connect_account",
        entity: "stripe_connect",
        entityId: accountId,
        detail: `${businessName} | ${email} | ${country ?? "PE"}`,
        user: auth.username ?? "admin",
      },
    });

    // Fire-and-forget — audit trail secundario
    logActivity(
      "stripe_connect_onboard",
      "stripe_connect",
      `Cuenta conectada creada para ${businessName}`,
      accountId,
      auth.username ?? "admin",
    ).catch(() => {});

    return NextResponse.json({ accountId, onboardingUrl }, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
