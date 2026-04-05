import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { getPlanLimits } from "@/lib/plans";
import { invalidateCustomDomainCache } from "@/lib/resolve-tenant";

export const dynamic = "force-dynamic";

/** Validate a custom domain string (basic format check). */
function isValidDomain(d: string): boolean {
  // Must look like: domain.tld or sub.domain.tld — no scheme, no path, no port
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(d);
}

// GET /api/tenant/custom-domain  →  { customDomain: string | null }
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
    select: { customDomain: true },
  });

  return NextResponse.json({ customDomain: tenant?.customDomain ?? null });
}

// PUT /api/tenant/custom-domain  →  body: { domain: string }
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
    select: { id: true, plan: true, customDomain: true },
  });
  if (!tenant) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

  const limits = getPlanLimits(tenant.plan);
  if (!limits.customDomain) {
    return NextResponse.json(
      { error: "Tu plan actual no incluye dominio personalizado. Actualiza a Pro o Business." },
      { status: 403 }
    );
  }

  let body: { domain?: string };
  try { body = await req.json(); } catch { body = {}; }

  const domain = body.domain?.trim().toLowerCase();
  if (!domain) return NextResponse.json({ error: "El campo domain es requerido" }, { status: 400 });
  if (!isValidDomain(domain)) {
    return NextResponse.json({ error: "Formato de dominio inválido (ej: www.mitienda.com)" }, { status: 400 });
  }

  // Block platform subdomains
  const ROOT_DOMAIN = (process.env.ROOT_DOMAIN ?? "").split(":")[0];
  if (ROOT_DOMAIN && domain.endsWith(`.${ROOT_DOMAIN}`)) {
    return NextResponse.json(
      { error: "No puedes usar un subdominio de la plataforma como dominio personalizado" },
      { status: 400 }
    );
  }

  // Check uniqueness
  const taken = await prisma.tenant.findFirst({
    where: { customDomain: domain, NOT: { id: auth.tenantId } },
    select: { slug: true },
  });
  if (taken) {
    return NextResponse.json({ error: "Este dominio ya está en uso por otra tienda" }, { status: 409 });
  }

  // Evict old cached entry if domain is changing
  if (tenant.customDomain && tenant.customDomain !== domain) {
    invalidateCustomDomainCache(tenant.customDomain);
  }

  await prisma.tenant.update({
    where: { id: auth.tenantId },
    data: { customDomain: domain },
  });

  return NextResponse.json({ customDomain: domain });
}

// DELETE /api/tenant/custom-domain  →  removes the custom domain
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
    select: { customDomain: true },
  });

  if (tenant?.customDomain) {
    invalidateCustomDomainCache(tenant.customDomain);
  }

  await prisma.tenant.update({
    where: { id: auth.tenantId },
    data: { customDomain: null },
  });

  return NextResponse.json({ ok: true });
}
