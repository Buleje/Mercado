import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { TenantCustomDomainDB } from "@/lib/db/tenant-custom-domain.db";
import { getPlanLimits } from "@/lib/plans";
import { invalidateCustomDomainCache } from "@/lib/resolve-tenant";
import { applyRateLimit } from "@/lib/rate-limit";

/** Validate a custom domain string (basic format check). */
function isValidDomain(d: string): boolean {
  // Must look like: domain.tld or sub.domain.tld — no scheme, no path, no port
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(d);
}

// GET /api/tenant/custom-domain  →  { customDomain: string | null }
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // Audit project-wide 2026-05-19: migrado a TenantCustomDomainDB.
  const tenant = await TenantCustomDomainDB.findCurrentDomain(auth.tenantId);

  return NextResponse.json({ customDomain: tenant?.customDomain ?? null });
}

// PUT /api/tenant/custom-domain  →  body: { domain: string }
export async function PUT(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "tenant-custom-domain"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const tenant = await TenantCustomDomainDB.findTenantForUpdate(auth.tenantId);
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
  const taken = await TenantCustomDomainDB.findDomainTakenBy(domain, auth.tenantId);
  if (taken) {
    return NextResponse.json({ error: "Este dominio ya está en uso por otra tienda" }, { status: 409 });
  }

  // Evict old cached entry if domain is changing
  if (tenant.customDomain && tenant.customDomain !== domain) {
    invalidateCustomDomainCache(tenant.customDomain);
  }

  await TenantCustomDomainDB.setCustomDomain(auth.tenantId, domain);

  return NextResponse.json({ customDomain: domain });
}

// DELETE /api/tenant/custom-domain  →  removes the custom domain
export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "tenant-custom-domain"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const tenant = await TenantCustomDomainDB.findCurrentDomain(auth.tenantId);

  if (tenant?.customDomain) {
    invalidateCustomDomainCache(tenant.customDomain);
  }

  await TenantCustomDomainDB.setCustomDomain(auth.tenantId, null);

  return NextResponse.json({ ok: true });
}
