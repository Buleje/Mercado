import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/referrals/stores
 * Retorna las tiendas que mi tenant ha referido.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Tiendas referidas por este tenant (referredBy = mi slug)
    const referred = await prisma.tenant.findMany({
      where: { referredBy: auth.tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        active: true,
        trialEndsAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Mi propio tenant para ver mi código de referido
    const me = await prisma.tenant.findFirst({
      where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
      select: { referralCode: true, slug: true, name: true },
    });

    return NextResponse.json({
      referralCode: me?.referralCode ?? null,
      referred: referred.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        plan: t.plan,
        active: t.active,
        registeredAt: t.createdAt,
        trialEndsAt: t.trialEndsAt,
        // La recompensa aplicada es siempre +30 días de trial
        reward: "30 dias de trial extra",
        status: t.active ? "activo" : "inactivo",
      })),
      stats: {
        total: referred.length,
        activos: referred.filter((t) => t.active).length,
        recompensasGanadas: referred.length, // 1 recompensa por referido activo registrado
      },
    });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

/**
 * POST /api/referrals/stores
 * Genera (o regenera) el código de referido para mi tienda.
 * Formato: BLJ-{tenantSlug}-{random4}
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Verificar si ya tiene código
    const me = await prisma.tenant.findFirst({
      where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
      select: { referralCode: true },
    });

    if (me?.referralCode) {
      // Ya tiene código — devolver el existente sin generar uno nuevo
      return NextResponse.json({ referralCode: me.referralCode, created: false });
    }

    // Generar código único: BLJ-{slug truncado a 8 chars}-{4 chars random}
    const slugPart = auth.tenantId.replace(/-/g, "").slice(0, 8).toUpperCase();
    const randomPart = randomBytes(3).toString("hex").slice(0, 4).toUpperCase();
    const referralCode = `BLJ-${slugPart}-${randomPart}`;

    // Verificar unicidad (muy improbable colisión, pero por seguridad)
    const existing = await prisma.tenant.findUnique({ where: { referralCode } });
    if (existing) {
      // Si hay colisión (extremadamente raro), agregar un char más
      const fallback = `BLJ-${slugPart}-${randomPart}X`;
      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: { referralCode: fallback },
      });
      return NextResponse.json({ referralCode: fallback, created: true });
    }

    await prisma.tenant.update({
      where: { id: auth.tenantId },
      data: { referralCode },
    });

    logActivity(
      "Generar",
      "Tenant",
      `Codigo de referido generado: ${referralCode}`,
      auth.tenantId,
      auth.username
    ).catch((err) => logger.error("[referrals/stores] logActivity failed", { error: String(err) }));

    return NextResponse.json({ referralCode, created: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
