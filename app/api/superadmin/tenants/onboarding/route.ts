import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/tenants/onboarding
 *
 * Activación de tiendas (gestión de tiendas, Brandon 2026-06-14). Calcula, por
 * tienda, qué hitos de setup completó (logo · productos · primer pedido ·
 * primera venta POS) para detectar a las que se estancaron y reactivarlas.
 * Todo desde datos reales (sin tabla nueva).
 */

const STEPS = ["logo", "productos", "pedido", "venta"] as const;
type Step = (typeof STEPS)[number];

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  try {
    const nowMs = Date.now();
    const [tenants, productsBy, ordersBy, salesBy] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true, slug: true, name: true, logoUrl: true, createdAt: true, plan: true, trialEndsAt: true } }),
      prisma.product.groupBy({ by: ["tenantId"], _count: { _all: true } }),
      prisma.order.groupBy({ by: ["tenantId"], _count: { _all: true } }),
      prisma.sale.groupBy({ by: ["tenantId"], _count: { _all: true } }),
    ]);

    const has = (arr: { tenantId: string; _count: { _all: number } }[]) => {
      const s = new Set<string>();
      for (const r of arr) if (r._count._all > 0) s.add(r.tenantId);
      return s;
    };
    const hasProducts = has(productsBy);
    const hasOrders = has(ordersBy);
    const hasSales = has(salesBy);

    const rows = tenants.map((t) => {
      const steps: Record<Step, boolean> = {
        logo: !!t.logoUrl,
        productos: hasProducts.has(t.id),
        pedido: hasOrders.has(t.id),
        venta: hasSales.has(t.id),
      };
      const done = STEPS.filter((s) => steps[s]).length;
      const stuckAt = STEPS.find((s) => !steps[s]) ?? null;
      const trialDaysLeft = t.trialEndsAt
        ? Math.ceil((t.trialEndsAt.getTime() - nowMs) / 86_400_000)
        : null;
      return {
        slug: t.slug,
        name: t.name,
        plan: t.plan,
        createdAt: t.createdAt.toISOString(),
        trialEndsAt: t.trialEndsAt?.toISOString() ?? null,
        trialDaysLeft,
        ageDays: Math.floor((nowMs - t.createdAt.getTime()) / 86_400_000),
        steps,
        done,
        total: STEPS.length,
        pct: Math.round((done / STEPS.length) * 100),
        stuckAt,
        complete: done === STEPS.length,
      };
    });

    // Estancadas primero (menos pasos), luego más nuevas.
    rows.sort((a, b) => a.done - b.done || b.createdAt.localeCompare(a.createdAt));

    const summary = {
      total: rows.length,
      complete: rows.filter((r) => r.complete).length,
      stuck: rows.filter((r) => !r.complete).length,
    };
    return NextResponse.json({ rows, summary, steps: STEPS });
  } catch (e) {
    logger.error("[tenants/onboarding] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
