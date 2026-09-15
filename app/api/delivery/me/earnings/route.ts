import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { limaDateKey, startOfLimaDay, startOfLimaDayDaysAgo } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * GET /api/delivery/me/earnings?period=today|week|month|all
 *
 * Devuelve ganancias del partner autenticado:
 *   - delivered: fees de assignments delivered en el periodo
 *   - tips: suma de tipAmount
 *   - byDay: array para gráfico (últimos N días)
 *
 * Brandon mayo 2026 v7: removido `"use cache"` + `cacheLife()` — en Next 16
 * una función cacheada no puede consumir cookies/headers de la request, y
 * `requirePartner(req)` las necesita. El resultado eran HTTP 500 al cargar
 * /delivery-app/ganancias. El polling de 60s del PartnerDashboard es bajo
 * para hacer caching ad-hoc innecesario.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requirePartner(req);
    if (session instanceof NextResponse) return session;

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? "month";

    // "Hoy" del rider arranca a las 00:00 de Lima (UTC-5), no a las 00:00 UTC
    // (= 19:00 Lima del día anterior). Sin esto las ganancias de la tarde-noche
    // caían en el día equivocado del total y del gráfico.
    let sinceMs: number;
    let bucketDays = 30;
    if (period === "today") { sinceMs = startOfLimaDay(); bucketDays = 1; }
    else if (period === "week") { sinceMs = startOfLimaDayDaysAgo(7); bucketDays = 7; }
    else if (period === "month") { sinceMs = startOfLimaDayDaysAgo(30); bucketDays = 30; }
    else { sinceMs = startOfLimaDayDaysAgo(365 * 5); bucketDays = 90; }
    const since = new Date(sinceMs);

    // SECURITY 2026-05-05 (pentest delivery H012): scope tenantId. Antes
    // un assignment con tenantId divergente (ver H010 ya parchado) inflaba
    // earnings cruzadas del partner.
    // TODO(deuda-tecnica-2026-05-08): migrar a lib/db/delivery.db.ts (regla #1
    // CLAUDE.md). Este file ya tenia prisma directo antes del cambio de cache;
    // el lint lo detecto al re-evaluar al modificar.
     
    const assignments = await prisma.deliveryAssignment.findMany({
      where: {
        partnerId: session.partnerId,
        tenantId: session.tenantId,
        status: "delivered",
        deliveredAt: { gte: since },
      },
      select: {
        id: true, fee: true, tipAmount: true, deliveredAt: true,
      },
      orderBy: { deliveredAt: "asc" },
    });

    const totalFees = assignments.reduce((s, a) => s + Number(a.fee), 0);
    const totalTips = assignments.reduce((s, a) => s + Number(a.tipAmount ?? 0), 0);

    // Bucket por día.
    const byDay: { date: string; fees: number; tips: number; count: number }[] = [];
    const map = new Map<string, { fees: number; tips: number; count: number }>();
    for (const a of assignments) {
      if (!a.deliveredAt) continue;
      const key = limaDateKey(a.deliveredAt);
      const existing = map.get(key) ?? { fees: 0, tips: 0, count: 0 };
      existing.fees += Number(a.fee);
      existing.tips += Number(a.tipAmount ?? 0);
      existing.count += 1;
      map.set(key, existing);
    }
    // Llenar ventana con ceros (días Lima) para que el chart no salte.
    for (let i = bucketDays - 1; i >= 0; i--) {
      const key = limaDateKey(startOfLimaDayDaysAgo(i));
      const e = map.get(key) ?? { fees: 0, tips: 0, count: 0 };
      byDay.push({ date: key, ...e });
    }

    return NextResponse.json({
      period,
      since: since.toISOString(),
      totals: {
        deliveries: assignments.length,
        fees: totalFees,
        tips: totalTips,
        total: totalFees + totalTips,
      },
      byDay,
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
