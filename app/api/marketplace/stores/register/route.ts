import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

const BodySchema = z.object({
  name:        z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  logo:        z.string().url().optional(),
  banner:      z.string().url().optional(),
  category:    z.string().max(50).optional(),
  zone:        z.string().max(80).optional(),
  commission:  z.number().min(0).max(30).optional(),
});

// ── POST /api/marketplace/stores/register — registrar nueva tienda ─────────────
// Solo admin y tienda_owner pueden crear tiendas.
// La tienda queda como isPublished=false hasta que un admin la apruebe.

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Verificar que el tenant no tenga ya una tienda registrada
    const existing = await MarketplaceStoresDB.getByTenantId(auth.tenantId);
    if (existing) {
      return NextResponse.json(
        { error: "Este tenant ya tiene una tienda registrada", storeSlug: existing.slug },
        { status: 409 },
      );
    }

    // ADR-023: el admin autenticado ya tiene un Tenant real (auth.tenantId),
    // así que usamos registerForExistingTenant() — no creamos un Tenant nuevo.
    const store = await MarketplaceStoresDB.registerForExistingTenant({
      tenantId:    auth.tenantId,
      name:        parsed.data.name,
      description: parsed.data.description,
      logo:        parsed.data.logo,
      banner:      parsed.data.banner,
      category:    parsed.data.category,
      zone:        parsed.data.zone,
      commission:  parsed.data.commission,
    });

    logActivity(
      "Registrar",
      "marketplace_store",
      `Nueva tienda en marketplace: ${store.name} (/${store.slug})`,
      store.id,
      auth.username,
    ).catch(() => {});

    return NextResponse.json({ data: store }, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
