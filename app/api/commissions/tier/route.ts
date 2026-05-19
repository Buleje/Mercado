import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { CommissionsDB } from "@/lib/db/commissions.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/commissions/tier?storeId=xxx
 *
 * Audit 2026-05-17 (construcción gap 2 — Vendor Tier escalonado).
 *
 * Devuelve el tier vigente del vendor con ventas últimos 30 días, rate
 * efectivo, umbral del siguiente nivel, y comparación con el override
 * estático de `Store.commission`.
 *
 * Útil para mostrar al vendor "estás a S/X de subir a Gold" o al superadmin
 * para auditar quién paga qué rate.
 */

const QuerySchema = z.object({
  storeId: z.string().min(1).max(100),
});

export async function GET(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "commissions-tier");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({ storeId: searchParams.get("storeId") });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "storeId requerido", issues: parsed.error.issues.map(i => i.message) },
        { status: 400 },
      );
    }

    // Verificar que la tienda pertenezca al tenant (via CommissionsDB regla #1)
    const store = await CommissionsDB.getStore(auth.tenantId, parsed.data.storeId);
    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada en este tenant" }, { status: 404 });
    }

    const tierInfo = await CommissionsDB.computeVendorTier(
      auth.tenantId,
      parsed.data.storeId,
      store.commission,
    );

    return NextResponse.json({
      storeId: store.id,
      storeName: store.name,
      overrideRate: store.commission,
      ...tierInfo,
      progressToNext: tierInfo.threshold > 0
        ? Math.min(1, tierInfo.ventas30d / tierInfo.threshold)
        : 1,
      remainingForNext: tierInfo.threshold > 0
        ? Math.max(0, tierInfo.threshold - tierInfo.ventas30d)
        : 0,
    });
  } catch (err) {
    logger.error("[commissions/tier] error", {
      err: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Error al calcular tier" }, { status: 500 });
  }
}
