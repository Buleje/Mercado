import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

const RedeemSchema = z.object({
  referralCode: z.string().min(1, "referralCode requerido").max(30).trim(),
  newTenantSlug: z.string().min(1, "newTenantSlug requerido").max(50).trim(),
});

// Días extra de trial que reciben ambas partes
const REWARD_DAYS = 30;

/**
 * POST /api/referrals/stores/redeem
 * Canjea un código de referido al registrarse una nueva tienda.
 * Extiende el trial 30 días para AMBOS: referidor y referido.
 * No requiere auth de admin — se llama durante el onboarding.
 */
export async function POST(req: NextRequest) {
  // Rate limit: máx 10 intentos por IP (prevenir abuso de códigos)
  const limited = applyRateLimit(req, "STRICT", "referrals-redeem");
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = RedeemSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const { referralCode, newTenantSlug } = parsed.data;

  try {
    // Buscar el tenant que generó el código (referidor)
    const referrer = await prisma.tenant.findUnique({
      where: { referralCode },
      select: { slug: true, name: true, trialEndsAt: true },
    });

    if (!referrer) {
      return NextResponse.json(
        { error: "Codigo de referido no valido o no existe" },
        { status: 400 }
      );
    }

    // No se puede usar el propio código
    if (referrer.slug === newTenantSlug) {
      return NextResponse.json(
        { error: "No puedes usar tu propio codigo de referido" },
        { status: 400 }
      );
    }

    // Buscar el nuevo tenant (referido)
    const newTenant = await prisma.tenant.findUnique({
      where: { slug: newTenantSlug },
      select: { slug: true, name: true, trialEndsAt: true, referredBy: true },
    });

    if (!newTenant) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // Verificar que el nuevo tenant no haya canjeado ya un código
    if (newTenant.referredBy) {
      return NextResponse.json(
        { error: "Esta tienda ya canjeo un codigo de referido" },
        { status: 422 }
      );
    }

    const now = new Date();

    // Calcular nuevas fechas de trial (+30 días desde hoy o desde el trial existente)
    const referrerTrialBase = referrer.trialEndsAt && referrer.trialEndsAt > now
      ? referrer.trialEndsAt
      : now;
    const newTenantTrialBase = newTenant.trialEndsAt && newTenant.trialEndsAt > now
      ? newTenant.trialEndsAt
      : now;

    const referrerNewTrial = new Date(referrerTrialBase.getTime() + REWARD_DAYS * 24 * 60 * 60 * 1000);
    const newTenantNewTrial = new Date(newTenantTrialBase.getTime() + REWARD_DAYS * 24 * 60 * 60 * 1000);

    // Aplicar recompensa a ambos en una transacción
    await prisma.$transaction([
      // Referidor: extender trial
      prisma.tenant.update({
        where: { slug: referrer.slug },
        data: { trialEndsAt: referrerNewTrial },
      }),
      // Referido: marcar como referido + extender trial
      prisma.tenant.update({
        where: { slug: newTenantSlug },
        data: {
          referredBy: referrer.slug,
          trialEndsAt: newTenantNewTrial,
        },
      }),
    ]);

    logActivity(
      "Canjear",
      "Tenant",
      `Codigo "${referralCode}" canjeado — referidor: ${referrer.slug}, referido: ${newTenantSlug}`,
      newTenantSlug,
      "system"
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      reward: `${REWARD_DAYS} dias extra de trial`,
      referrer: { slug: referrer.slug, name: referrer.name, newTrialEndsAt: referrerNewTrial },
      referred: { slug: newTenantSlug, name: newTenant.name, newTrialEndsAt: newTenantNewTrial },
    });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
