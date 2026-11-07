import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { UsoNegocioDB } from "@/lib/db/uso-negocio.db";
import { USAGE_TIERS } from "@/lib/billing/wire-up/usage-tiers";
import { cupoDeUsoDePlan, recommendUpgrade } from "@/lib/superadmin/upgrade-recommendation";
import { camposDeOperaciones, compararPorUso } from "@/lib/superadmin/uso-negocio";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/tenants/usage
 *
 * Uso vs límites del plan por tienda (ADR — gestión de tiendas, 2026-06-14).
 * Calcula desde datos reales: pedidos del mes (vs límite order.created del
 * tier), productos y usuarios admin. Marca candidatas a upsell (≥ alertAt).
 *
 * 04-11: las consultas viven en `UsoNegocioDB` (antes `prisma` directo) y cada fila suma las
 * operaciones REALES de 30 días (pedidos + ventas + libro CTP + trozas) y los ingresos de personas,
 * campos ADITIVOS: un aserradero ya no sale con uso cero. El límite del plan sigue siendo de pedidos.
 */

// El cupo de cada Tenant.plan sale de `cupoDeUsoDePlan` (misma escalera que la
// recomendación): «pro» = Starter = 1.000 pedidos, no los 10.000 de Pro.

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const nowMs = now.getTime();
    const { negocios, pedidosDelMes, productos, admins, senales } = await UsoNegocioDB.leerTodo(
      monthStart,
      new Date(nowMs - 7 * 86_400_000),
      new Date(nowMs - 30 * 86_400_000),
    );

    const rows = negocios.map((t) => {
      const tier = cupoDeUsoDePlan(t.plan);
      const quota = USAGE_TIERS[tier]["order.created"];
      const orderLimit = quota?.limit ?? Infinity;
      const alertAt = quota?.alertAt ?? 0.9;
      const ordersThisMonth = pedidosDelMes.get(t.id) ?? 0;
      const pct = orderLimit === Infinity || orderLimit === 0 ? 0 : ordersThisMonth / orderLimit;
      const nearLimit = orderLimit !== Infinity && pct >= alertAt;
      const trialDaysLeft = t.trialEndsAt ? Math.ceil((t.trialEndsAt.getTime() - nowMs) / 86_400_000) : null;
      return {
        slug: t.slug,
        name: t.name,
        plan: t.plan,
        tier,
        ordersThisMonth,
        orderLimit: orderLimit === Infinity ? null : orderLimit,
        orderPct: Math.round(pct * 100),
        nearLimit,
        products: productos.get(t.id) ?? 0,
        adminUsers: admins.get(t.id) ?? 0,
        trialDaysLeft,
        ageDays: Math.floor((nowMs - t.createdAt.getTime()) / 86_400_000),
        ...camposDeOperaciones(senales.get(t.id)),
        // Recomendación de upgrade sólo para candidatas a upsell.
        recommendation: nearLimit ? recommendUpgrade(t.plan, ordersThisMonth) : null,
      };
    });

    // Upsell candidates primero (cerca del límite), luego por uso desc y, a igual uso, por operaciones.
    rows.sort(compararPorUso);

    // Resumen de expansión: upside mensual total de las candidatas.
    const upsell = {
      count: rows.filter((r) => r.nearLimit).length,
      monthlyUpsidePEN: rows.reduce((sum, r) => sum + (r.recommendation?.upsidePEN ?? 0), 0),
    };

    return NextResponse.json({ rows, upsell, generatedAt: now.toISOString() });
  } catch (e) {
    logger.error("[tenants/usage] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
