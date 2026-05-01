import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/plan/mock-activate
 * Body: { plan: "pro" | "business" | "enterprise" }
 *
 * Mock activator solo en dev — actualiza tenant.plan + setea trialEndsAt
 * a +30d sin pasar por Stripe. Producción retorna 503.
 */
const BodySchema = z.object({
  plan: z.enum(["pro", "business", "enterprise"]),
});

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Mock checkout no disponible en producción" },
      { status: 503 },
    );
  }

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
    select: { id: true, slug: true, plan: true },
  });
  if (!tenant) return NextResponse.json({ error: "Tenant no existe" }, { status: 404 });

  // Trial extendido a +30d para que parezca un sub activo.
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      plan: parsed.data.plan,
      trialEndsAt,
      // Marcamos un id mock para que el guard NO lo trate como "sin plan pagado".
      stripeSubscriptionId: `mock_sub_${Date.now()}`,
      active: true,
    },
  });

  logger.info("[admin/plan/mock-activate]", {
    adminUser: auth.username,
    tenantSlug: tenant.slug,
    oldPlan: tenant.plan,
    newPlan: parsed.data.plan,
  });

  return NextResponse.json({ ok: true, plan: parsed.data.plan });
}
