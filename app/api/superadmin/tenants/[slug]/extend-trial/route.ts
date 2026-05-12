import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { invalidateByPrefix } from "@/lib/cache";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

const BodySchema = z.object({
  // Días a sumar al trialEndsAt actual (o desde hoy si no hay trial activo).
  // Negativos permiten acortar el trial.
  days: z.coerce.number().int().min(-365).max(365),
});

/**
 * POST /api/superadmin/tenants/[slug]/extend-trial
 * Body: { days: number }
 *
 * Extiende (o reduce) el trialEndsAt del tenant identificado por slug.
 * Si el trial ya venció, se extiende desde now. Si está vigente, se suma
 * al trialEndsAt existente.
 *
 * También setea active=true automáticamente cuando se extiende un trial
 * vencido — equivalente a "habilitar manualmente" desde superadmin.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rateLimited = applyRateLimit(req, "MODERATE", "sa-extend-trial");
  if (rateLimited) return rateLimited;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;

  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body inválido", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { days } = parsed.data;

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: slug }, { slug }] },
    select: { id: true, slug: true, trialEndsAt: true },
  });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

  const now = Date.now();
  const baseTime = tenant.trialEndsAt && tenant.trialEndsAt.getTime() > now
    ? tenant.trialEndsAt.getTime()
    : now;
  const newTrial = new Date(baseTime + days * 86_400_000);

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      trialEndsAt: newTrial,
      // Si extendemos (días positivos) y el trial estaba vencido, reactivar.
      ...(days > 0 ? { active: true } : {}),
    },
  });

  invalidateByPrefix(`marketplace:stores:slug:${tenant.slug}`);
  invalidateByPrefix("marketplace:stores:list");

  logger.info("[extend-trial] applied", {
    superadmin: session.username,
    tenantSlug: tenant.slug,
    days,
    newTrialEndsAt: newTrial.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    tenant: {
      slug: tenant.slug,
      trialEndsAt: newTrial.toISOString(),
    },
  });
}
