import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { TenantFeatureFlagDB } from "@/lib/db/tenant-feature-flag.db";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { computeBlockers, getModoOficialState } from "@/lib/sunat/modo-oficial";
import { SUNAT_OFICIAL_FLAG } from "@/lib/sunat/modo-oficial.types";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

async function resolveTenant(slug: string) {
  return prisma.tenant.findFirst({ where: { OR: [{ slug }, { id: slug }] }, select: { id: true, slug: true } });
}

const BodySchema = z.object({ enabled: z.boolean() });

/**
 * GET  /api/superadmin/tenants/[slug]/sunat-oficial → estado del modo oficial.
 * PUT  /api/superadmin/tenants/[slug]/sunat-oficial → enciende/apaga el toggle.
 *
 * Control MANUAL por superadmin (decisión negocio 2026-05-26). Al ENCENDER,
 * valida los bloqueos (config + RUC + token): si hay bloqueos → 422 y NO activa.
 * Apagar siempre se permite.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

  const state = await getModoOficialState(tenant.id);
  return NextResponse.json({ ok: true, state });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimited = applyRateLimit(req, "MODERATE", "sa-sunat-oficial");
  if (rateLimited) return rateLimited;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;

  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  // Al ENCENDER: validar que la config fiscal esté lista. Apagar siempre se permite.
  if (parsed.data.enabled) {
    const { bloqueos } = await computeBlockers(tenant.id);
    if (bloqueos.length > 0) {
      return NextResponse.json(
        { error: "No se puede activar: faltan requisitos fiscales.", bloqueos },
        { status: 422 },
      );
    }
  }

  await TenantFeatureFlagDB.set(tenant.id, SUNAT_OFICIAL_FLAG, parsed.data.enabled);
  logger.info("[superadmin] Modo SUNAT Oficial actualizado", {
    tenantId: tenant.id,
    slug: tenant.slug,
    enabled: parsed.data.enabled,
    by: session.username,
  });
  // [AUDIT] Toggle de impacto TRIBUTARIO → audit-log persistente (Ley 29733 +
  // trazabilidad SUNAT). El logger.info de arriba no persiste; esto sí, como
  // impersonate. logSuperadminAction nunca throwea (try/catch interno).
  await logSuperadminAction(
    "sunat_oficial_toggle",
    `Modo SUNAT Oficial ${parsed.data.enabled ? "ACTIVADO" : "desactivado"} para tenant "${tenant.slug}"`,
    { targetTenantId: tenant.id, targetTenantSlug: tenant.slug, enabled: parsed.data.enabled },
    session.username,
  );

  const state = await getModoOficialState(tenant.id);
  return NextResponse.json({ ok: true, state });
}
