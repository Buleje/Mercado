import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTenantSlug } from "@/lib/resolve-tenant";
import { createApiKey, revokeApiKey, listApiKeys } from "@/lib/api-keys";
import { verifySessionToken, SESSION } from "@/lib/session";
import { getPlanLimits } from "@/lib/plans";

export const dynamic = "force-dynamic";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireAdmin(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  return !!(token && (await verifySessionToken(token)));
}

async function getTenantId(req: NextRequest): Promise<string> {
  const rawTenantId = req.headers.get("x-tenant-id") ?? "main";
  return (await resolveTenantSlug(rawTenantId)) ?? "main";
}

// ─── Plan guard ───────────────────────────────────────────────────────────────

async function requireApiAccess(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
    select: { plan: true },
  });
  const limits = getPlanLimits(tenant?.plan ?? "free");
  return limits.apiAccess;
}

// ─── GET /api/api-keys ────────────────────────────────────────────────────────
// List active API keys for the current tenant. Requires admin session.

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = await getTenantId(req);

  if (!(await requireApiAccess(tenantId))) {
    return NextResponse.json(
      { error: "API access requires the Business plan" },
      { status: 403 }
    );
  }

  const keys = await listApiKeys(tenantId);
  return NextResponse.json({ keys });
}

// ─── POST /api/api-keys ───────────────────────────────────────────────────────
// Create a new API key. The raw key is returned ONCE — show it to the user immediately.

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = await getTenantId(req);

  if (!(await requireApiAccess(tenantId))) {
    return NextResponse.json(
      { error: "API access requires the Business plan" },
      { status: 403 }
    );
  }

  let body: { name?: unknown };
  try {
    body = (await req.json()) as { name?: unknown };
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length < 2 || name.length > 100) {
    return NextResponse.json(
      { error: "Nombre requerido (2–100 caracteres)" },
      { status: 400 }
    );
  }

  try {
    const { rawKey, keyPrefix, id } = await createApiKey(tenantId, name);
    return NextResponse.json({ id, keyPrefix, rawKey }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error al crear la clave" }, { status: 500 });
  }
}

// ─── DELETE /api/api-keys?id=xxx ─────────────────────────────────────────────
// Revoke an API key by its ID.

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = await getTenantId(req);
  const id = req.nextUrl.searchParams.get("id") ?? "";

  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const revoked = await revokeApiKey(id, tenantId);
  if (!revoked) {
    return NextResponse.json({ error: "Clave no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
