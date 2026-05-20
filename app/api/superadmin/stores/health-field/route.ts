import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { SuperadminStoresHealthDB } from "@/lib/db/superadmin-stores-health.db";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * PATCH /api/superadmin/stores/health-field
 *
 * Actualiza un campo individual del tenant/store/settings desde el modal
 * de acción de la pestaña Salud. Mapea checkId → tabla/campo correctos.
 *
 * Body: { tenantId, checkId, value }
 *   - tenantId: CUID del Tenant
 *   - checkId: id del check ("logo", "yape", "address", etc.)
 *   - value: string (URL para imágenes, JSON para Yape, "true"/"false" para booleans)
 */

const Schema = z.object({
  tenantId: z.string().min(1),
  checkId: z.string().min(1),
  value: z.string().max(2000),
});

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-stores-health-field"); if (_rl) return _rl;
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch((err) => {
    logger.warn("[superadmin/stores/health-field] body parse failed", { error: String(err) });
    return null;
  });
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }
  const { tenantId, checkId, value } = parsed.data;

  // Audit project-wide 2026-05-19: migrado a SuperadminStoresHealthDB.
  const tenant = await SuperadminStoresHealthDB.findTenant(tenantId);
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  try {
    switch (checkId) {
      // ── Tenant fields ────────────────────────────────────
      case "logo": {
        await SuperadminStoresHealthDB.updateTenantLogo(tenantId, value || null);
        // Mirror también en el Store si existe
        const store = await SuperadminStoresHealthDB.findStoreByTenant(tenantId);
        if (store) {
          await SuperadminStoresHealthDB.updateStore(store.id, { logo: value || null });
        }
        break;
      }
      case "ownerPhone":
        await SuperadminStoresHealthDB.updateTenantOwnerPhone(tenantId, value || null);
        break;

      // ── Store fields ─────────────────────────────────────
      case "banner":
      case "description":
      case "published": {
        const store = await SuperadminStoresHealthDB.findStoreByTenant(tenantId);
        if (!store) {
          return NextResponse.json({ error: "store_not_found" }, { status: 404 });
        }
        const data: Record<string, unknown> = {};
        if (checkId === "banner") data.banner = value || null;
        if (checkId === "description") data.description = value || null;
        if (checkId === "published") data.isPublished = value === "true" || value === "1";
        await SuperadminStoresHealthDB.updateStore(store.id, data);
        break;
      }

      // ── Settings fields ──────────────────────────────────
      case "businessName":
      case "businessPhone":
      case "businessAddress":
      case "razonSocial":
      case "ruc":
      case "hours":
      case "deliveryZone":
      case "yape": {
        const data: Record<string, unknown> = {};
        if (checkId === "businessName") data.businessName = value || null;
        if (checkId === "businessPhone") data.businessPhone = value || null;
        if (checkId === "businessAddress") data.businessAddress = value || null;
        if (checkId === "razonSocial") data.razonSocial = value || null;
        if (checkId === "ruc") data.ruc = value || null;
        if (checkId === "hours") data.hours = value || null;
        if (checkId === "deliveryZone") data.deliveryZone = value || null;
        if (checkId === "yape") {
          // Value es JSON: { enabled, phone }
          try {
            const parsed = JSON.parse(value) as {
              enabled?: boolean;
              phone?: string;
            };
            data.yapeEnabled = !!parsed.enabled;
            data.yapePhone = parsed.phone ?? null;
          } catch {
            return NextResponse.json(
              { error: "invalid_yape_value" },
              { status: 400 },
            );
          }
        }

        await SuperadminStoresHealthDB.upsertSettings(tenantId, data);
        break;
      }

      default:
        return NextResponse.json(
          { error: "unsupported_check_id", checkId },
          { status: 400 },
        );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[health-field PATCH]", { error: String(err), checkId });
    return NextResponse.json(
      { error: "server_error", detail: String(err) },
      { status: 500 },
    );
  }
}
