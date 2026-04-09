import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { z } from "zod";

// ─── Validación params ────────────────────────────────────────────────────────

const resolveSignalSchema = z.object({
  signalId: z.string().min(1),
  resolvedBy: z.string().min(1).default("manual"),
});

// ─── GET /api/superadmin/churn/[tenantSlug] ───────────────────────────────────

/**
 * Detalle anti-churn de un tenant:
 * - Historial de health scores (últimos 30 días)
 * - Signals activos y resueltos
 * - Intervenciones ejecutadas
 * - Timeline de actividad reciente
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  const { tenantSlug } = await params;

  logger.info("[superadmin/churn] GET tenant detail", { user: auth.username, tenantSlug });

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      ownerEmail: true,
      ownerPhone: true,
      trialEndsAt: true,
      active: true,
      createdAt: true,
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Historial de scores (últimos 30 días), máximo 30 registros
  const scoreHistory = await prisma.tenantHealthScore.findMany({
    where: {
      tenantId: tenant.id,
      calculatedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { calculatedAt: "asc" },
    take: 30,
    select: {
      id: true,
      score: true,
      riskLevel: true,
      loginsLast7d: true,
      loginsLast30d: true,
      ordersLast7d: true,
      ordersLast30d: true,
      featuresUsed: true,
      daysSinceLastOrder: true,
      daysSinceLastLogin: true,
      trialDaysLeft: true,
      calculatedAt: true,
    },
  });

  // Score actual (el más reciente)
  const latestScore = scoreHistory.at(-1) ?? null;

  // Signals activos
  const activeSignals = await prisma.churnSignal.findMany({
    where: { tenantId: tenant.id, resolved: false },
    orderBy: { createdAt: "desc" },
  });

  // Signals resueltos (últimos 30 días)
  const resolvedSignals = await prisma.churnSignal.findMany({
    where: {
      tenantId: tenant.id,
      resolved: true,
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { resolvedAt: "desc" },
    take: 20,
  });

  // Timeline de actividad reciente (últimas 50 acciones del tenant en ActivityLog)
  const activityTimeline = await prisma.activityLog.findMany({
    where: { entityId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      action: true,
      entity: true,
      detail: true,
      user: true,
      createdAt: true,
    },
  }).catch(() => []);

  logger.info("[superadmin/churn] Detalle servido", {
    tenantSlug,
    scoreCount: scoreHistory.length,
    activeSignals: activeSignals.length,
  });

  return NextResponse.json({
    tenant,
    latestScore,
    scoreHistory,
    signals: {
      active: activeSignals,
      resolved: resolvedSignals,
    },
    activityTimeline,
  });
}

// ─── PATCH /api/superadmin/churn/[tenantSlug] — resolver signal manualmente ──

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  const { tenantSlug } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = resolveSignalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  const signal = await prisma.churnSignal.findFirst({
    where: { id: parsed.data.signalId, tenantId: tenant.id },
  });
  if (!signal) {
    return NextResponse.json({ error: "Signal no encontrada" }, { status: 404 });
  }

  const updated = await prisma.churnSignal.update({
    where: { id: parsed.data.signalId },
    data: {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: parsed.data.resolvedBy,
    },
  });

  logger.info("[superadmin/churn] Signal resuelta manualmente", {
    user: auth.username,
    tenantSlug,
    signalId: parsed.data.signalId,
    resolvedBy: parsed.data.resolvedBy,
  });

  return NextResponse.json({ ok: true, signal: updated });
}
