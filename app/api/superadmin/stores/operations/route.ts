import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/stores/operations
 *
 * Centro de operaciones cross-tenant. Devuelve los pedidos abiertos del
 * marketplace + indicador de demora vs SLA (configurable por tienda) +
 * datos de contacto del owner para que el platform-admin pueda intervenir
 * cuando el negocio no responde a tiempo.
 *
 * Heurísticas de SLA por defecto (en minutos desde createdAt):
 *   - pendiente: 10 min  (debe ser aceptado)
 *   - procesando: 30 min (debe estar listo)
 *   - enviado:    45 min (debe ser entregado)
 *
 * Queryparams:
 *   - hours: ventana de tiempo en horas (default: 24)
 *   - onlyDelayed: si está presente, devuelve solo demorados
 */

const SLA_MINUTES: Record<string, number> = {
  pendiente: 10,
  confirmado: 30,
  en_camino: 45,
};

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const session = await getPlatformSession(token);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const hours = Math.max(1, Math.min(168, Number(url.searchParams.get("hours") ?? 24)));
    const onlyDelayed = url.searchParams.has("onlyDelayed");

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        source: "marketplace",
        deletedAt: null,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        tenantId: true,
        customerName: true,
        customerPhone: true,
        customerLocation: true,
        total: true,
        status: true,
        paymentMethod: true,
        deliveryStatus: true,
        estimatedDeliveryAt: true,
        deliveredAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
        items: { select: { id: true } },
      },
    });

    // Tenants y stores para enriquecer
    const tenantIds = Array.from(new Set(orders.map((o) => o.tenantId)));
    const [tenants, stores] = await Promise.all([
      prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: {
          id: true,
          slug: true,
          name: true,
          plan: true,
          ownerPhone: true,
          ownerEmail: true,
        },
      }),
      prisma.store.findMany({
        where: { tenantId: { in: tenantIds } },
        select: {
          tenantId: true,
          slug: true,
          name: true,
          zone: true,
        },
      }),
    ]);

    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    const storeMap = new Map(stores.map((s) => [s.tenantId, s]));

    const now = Date.now();

    const enriched = orders.map((o) => {
      const tenant = tenantMap.get(o.tenantId);
      const store = storeMap.get(o.tenantId);
      const minutesElapsed = Math.floor(
        (now - new Date(o.createdAt).getTime()) / 60000,
      );
      const slaMinutes = SLA_MINUTES[o.status] ?? 60;
      const isOpen = o.status !== "entregado" && o.status !== "cancelado";
      const overrun = isOpen ? minutesElapsed - slaMinutes : 0;
      const dangerLevel: "ok" | "warn" | "danger" = !isOpen
        ? "ok"
        : overrun >= slaMinutes
        ? "danger"
        : overrun > 0
        ? "warn"
        : "ok";

      return {
        id: o.id,
        tenantId: o.tenantId,
        tenantSlug: tenant?.slug ?? null,
        tenantName: tenant?.name ?? "—",
        tenantPlan: tenant?.plan ?? "free",
        tenantZone: store?.zone ?? null,
        ownerPhone: tenant?.ownerPhone ?? null,
        storeName: store?.name ?? tenant?.name ?? "—",
        storeSlug: store?.slug ?? null,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerLocation: o.customerLocation,
        paymentMethod: o.paymentMethod,
        total: Number(o.total),
        status: o.status,
        deliveryStatus: o.deliveryStatus,
        isOpen,
        itemCount: o.items.length,
        minutesElapsed,
        slaMinutes,
        overrun,
        dangerLevel,
        estimatedDeliveryAt: o.estimatedDeliveryAt
          ? o.estimatedDeliveryAt.toISOString()
          : null,
        deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : null,
        cancelledAt: o.cancelledAt ? o.cancelledAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      };
    });

    const filtered = onlyDelayed
      ? enriched.filter((o) => o.dangerLevel !== "ok")
      : enriched;

    // Agrupado por tienda para vista por-tenant
    const byTenant = new Map<
      string,
      {
        tenantId: string;
        tenantSlug: string | null;
        tenantName: string;
        ownerPhone: string | null;
        storeName: string;
        storeSlug: string | null;
        total: number;
        open: number;
        delayed: number;
        danger: number;
        ordersCount: number;
      }
    >();
    for (const o of enriched) {
      const key = o.tenantId;
      const cur = byTenant.get(key) ?? {
        tenantId: o.tenantId,
        tenantSlug: o.tenantSlug,
        tenantName: o.tenantName,
        ownerPhone: o.ownerPhone,
        storeName: o.storeName,
        storeSlug: o.storeSlug,
        total: 0,
        open: 0,
        delayed: 0,
        danger: 0,
        ordersCount: 0,
      };
      cur.ordersCount += 1;
      cur.total += o.total;
      if (o.isOpen) cur.open += 1;
      if (o.dangerLevel === "warn" || o.dangerLevel === "danger") cur.delayed += 1;
      if (o.dangerLevel === "danger") cur.danger += 1;
      byTenant.set(key, cur);
    }

    const tenantsAgg = Array.from(byTenant.values()).sort(
      (a, b) => b.danger - a.danger || b.delayed - a.delayed,
    );

    // Stats
    const stats = {
      totalOrders: enriched.length,
      openOrders: enriched.filter((o) => o.isOpen).length,
      delayedOrders: enriched.filter((o) => o.dangerLevel !== "ok").length,
      dangerOrders: enriched.filter((o) => o.dangerLevel === "danger").length,
      totalRevenue: enriched.reduce((s, o) => s + o.total, 0),
      storesAffected: tenantsAgg.filter((t) => t.delayed > 0).length,
    };

    return NextResponse.json({
      orders: filtered,
      tenants: tenantsAgg,
      stats,
      windowHours: hours,
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
