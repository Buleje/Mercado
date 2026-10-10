import { NextRequest, NextResponse } from "next/server";
import { findTenantBillingByIdOrSlug } from "@/lib/tenant";
import { requireAdmin } from "@/lib/require-admin";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { createApiKey, revokeApiKey, listApiKeys } from "@/lib/api-keys";
import { getPlanLimits } from "@/lib/plans";
import { applyRateLimit } from "@/lib/rate-limit";

// ─── Auth helper ──────────────────────────────────────────────────────────────
// SECURITY 2026-05-06: derivamos tenantId del JWT (no del header x-tenant-id).
// Antes un admin de tenant A podía listar/crear/revocar API keys de tenant B
// inyectando el header. Ahora `tryAdmin` retorna `tenantId` validado del JWT.

// SECURITY 2026-10-04: una clave API abre `/api/sync/*`, que entrega el Drive
// entero sin mirar el rol de carpeta. Con `tryAdmin` cualquier sesión del panel
// (un cajero) se creaba una y bajaba documentos restringidos. Ahora sólo admin y
// dueño, estricto: `requireAdmin` deja pasar al management tier (encargado).
async function authAdmin(req: NextRequest): Promise<{ tenantId: string } | NextResponse> {
  const session = await requireAdmin(req, ["admin", "owner"]);
  if (session instanceof NextResponse) return session;
  const prohibido = soloAdminODueno(session.role, "manejar las claves API");
  if (prohibido) return prohibido;
  return { tenantId: session.tenantId };
}

// ─── Plan guard ───────────────────────────────────────────────────────────────

async function requireApiAccess(tenantId: string): Promise<boolean> {
  // Audit project-wide 2026-05-19: migrado a findTenantBillingByIdOrSlug (cacheado).
  const tenant = await findTenantBillingByIdOrSlug(tenantId);
  const limits = getPlanLimits(tenant?.plan ?? "free");
  return limits.apiAccess;
}

// ─── GET /api/api-keys ────────────────────────────────────────────────────────
// List active API keys for the current tenant. Requires admin session.

export async function GET(req: NextRequest) {
  const auth = await authAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

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
  const _rl = await applyRateLimit(req, "STRICT", "api-keys"); if (_rl) return _rl;
  const auth = await authAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

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
  const _rl = await applyRateLimit(req, "STRICT", "api-keys"); if (_rl) return _rl;
  const auth = await authAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;
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
