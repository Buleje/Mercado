
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const BodySchema = z.object({
  name:        z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  logo:        z.string().url().optional(),
  banner:      z.string().url().optional(),
  category:    z.string().max(50).optional(),
  zone:        z.string().max(80).optional(),
  // SECURITY 2026-06-29 (commission-integrity): el `commission` NO se acepta del
  // cliente. Antes un vendor (rol owner) podía auto-registrar su tienda con
  // commission=0 → como Store.commission gana de override sobre el tier dinámico
  // (computeVendorTier), pagaba 0% de comisión a la plataforma para siempre.
  // El default queda en 5% y SOLO el superadmin puede cambiarlo
  // (app/api/superadmin/stores). Regla danger-zone: el vendor NO fija su comisión.
});

// ── POST /api/marketplace/stores/register — registrar nueva tienda ─────────────
// Solo admin y tienda_owner pueden crear tiendas.
// La tienda queda como isPublished=false hasta que un admin la apruebe.

export async function POST(req: NextRequest) {
  // Rate limit: anti-spam signup tienda (5 attempts / 15min / IP)
  const rl = applyRateLimit(req, "STRICT", "marketplace-stores-register");
  if (rl) return rl;

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
      // commission omitido a propósito → registerForExistingTenant aplica el
      // default 5% (ver SECURITY note en BodySchema).
    });

    logActivity(
      "Registrar",
      "marketplace_store",
      `Nueva tienda en marketplace: ${store.name} (/${store.slug})`,
      store.id,
      auth.username,
    ).catch((err) => logger.error("[marketplace/stores/register] operation failed", { error: String(err), tenantId: auth.tenantId }));

    return NextResponse.json({ data: store }, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
