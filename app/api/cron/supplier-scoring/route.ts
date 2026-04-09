import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queue";
import { sendPushToPhone } from "@/lib/push-sender";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * GET /api/cron/supplier-scoring
 *
 * Scoring mensual automático de proveedores. Analiza las órdenes de compra
 * del último mes y calcula puntajes de:
 * - Puntualidad: ¿entregó antes o en la fecha prometida?
 * - Calidad: inversamente proporcional a mermas/devoluciones (si hay data)
 * - Precio: compara el costo unitario promedio actual vs el anterior
 *
 * Crea SupplierEvaluation automáticas para que el dueño vea el ranking
 * sin tener que calificar manualmente.
 *
 * vercel.json: "0 8 1 * *" (primer día del mes, 8:00 AM)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("supplier-scoring", async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Multi-tenant: process all active tenants
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, name: true },
      });

      const allResults: Array<{ tenant: string; scored: number; rankings: Array<{ name: string; punctuality: number; quality: number; price: number; avg: number }> }> = [];

      for (const tenant of tenants) {
        const tenantIds = tenant.id === tenant.slug ? [tenant.id] : [tenant.id, tenant.slug];

        // Get active suppliers for this tenant
        const suppliers = await prisma.supplier.findMany({
          where: {
            tenantId: { in: tenantIds },
            estado: "activo",
          },
          select: {
            id: true,
            name: true,
            phone: true,
          },
        });

        if (suppliers.length === 0) continue;

        const scored: Array<{
          name: string;
          punctuality: number;
          quality: number;
          price: number;
          avg: number;
        }> = [];

        for (const supplier of suppliers) {
          // Get current month purchases
          const currentPurchases = await prisma.purchaseOrder.findMany({
            where: {
              supplierId: supplier.id,
              createdAt: { gte: thirtyDaysAgo },
            },
            select: {
              id: true,
              status: true,
              deliveryDate: true,
              createdAt: true,
              items: {
                select: { unitCost: true, quantity: true },
              },
            },
          });

          if (currentPurchases.length === 0) continue;

          // ── Punctuality Score (1-5) ──
          let punctuality = 3;
          const withDeliveryDate = currentPurchases.filter((p) => p.deliveryDate);
          if (withDeliveryDate.length > 0) {
            const received = withDeliveryDate.filter(
              (p) => p.status === "recibido" || p.status === "parcial"
            );
            const onTime = received.filter((p) => {
              if (!p.deliveryDate) return true;
              return p.deliveryDate >= p.createdAt;
            });
            const ratio = received.length > 0 ? onTime.length / received.length : 0.5;
            punctuality = Math.max(1, Math.min(5, Math.round(ratio * 4) + 1));
          }

          // ── Quality Score (1-5) ──
          const cancelled = currentPurchases.filter((p) => p.status === "cancelado").length;
          const totalOrders = currentPurchases.length;
          const cancelRatio = totalOrders > 0 ? cancelled / totalOrders : 0;
          const quality = Math.max(1, Math.min(5, Math.round((1 - cancelRatio) * 4) + 1));

          // ── Price Score (1-5) ──
          const currentAvgCost = calcAvgCost(currentPurchases);

          const prevPurchases = await prisma.purchaseOrder.findMany({
            where: {
              supplierId: supplier.id,
              createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
            },
            select: {
              items: { select: { unitCost: true, quantity: true } },
            },
          });
          const prevAvgCost = calcAvgCost(prevPurchases);

          let priceScore = 3;
          if (prevAvgCost > 0 && currentAvgCost > 0) {
            const change = (currentAvgCost - prevAvgCost) / prevAvgCost;
            if (change <= -0.05) priceScore = 5;
            else if (change <= -0.02) priceScore = 4;
            else if (change <= 0.02) priceScore = 3;
            else if (change <= 0.05) priceScore = 2;
            else priceScore = 1;
          }

          const avg = Math.round(((punctuality + quality + priceScore) / 3) * 10) / 10;

          // Create evaluation record
          await prisma.supplierEvaluation.create({
            data: {
              tenantId: tenant.id,
              supplierId: supplier.id,
              punctuality,
              quality,
              price: priceScore,
              notes: `[${tenant.name}] Auto-scoring mensual (${currentPurchases.length} órdenes). Puntualidad=${punctuality}, Calidad=${quality}, Precio=${priceScore}`,
            },
          });

          scored.push({
            name: supplier.name,
            punctuality,
            quality,
            price: priceScore,
            avg,
          });
        }

        // Sort by average score
        scored.sort((a, b) => b.avg - a.avg);

        // Build WhatsApp message for this tenant
        if (scored.length > 0) {
          const lines: string[] = [
            `📋 *Ranking de Proveedores — ${tenant.name} — Mes*`,
            ``,
            `Se evaluaron ${scored.length} proveedores automáticamente:`,
            ``,
          ];

          for (let i = 0; i < Math.min(scored.length, 10); i++) {
            const s = scored[i];
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
            const stars = "⭐".repeat(Math.round(s.avg));
            lines.push(`${medal} *${s.name}* ${stars} (${s.avg}/5)`);
            lines.push(`   Puntualidad: ${s.punctuality} · Calidad: ${s.quality} · Precio: ${s.price}`);
          }

          if (scored.length > 0 && scored[scored.length - 1].avg < 2.5) {
            const worst = scored[scored.length - 1];
            lines.push(``);
            lines.push(`⚠️ *${worst.name}* tiene puntaje bajo (${worst.avg}/5) — ¿buscar alternativa?`);
          }

          const message = lines.join("\n");

          const settings = await prisma.settings.findFirst({
            where: { tenantId: { in: tenantIds } },
            select: { businessPhone: true },
          });
          const phone = settings?.businessPhone || (tenant.slug === "main" ? process.env.NOTIFY_PHONE : null);

          if (phone) {
            enqueueNotification({
              type: "whatsapp",
              recipient: phone,
              message,
              tenantId: tenant.id,
            }).catch(() => {});
            sendPushToPhone(phone, {
              title: `📋 Ranking de proveedores — ${tenant.name}`,
              body: `${scored.length} proveedores evaluados. Mejor: ${scored[0]?.name ?? "—"} (${scored[0]?.avg ?? 0}/5)`,
              url: "/admin?module=proveedores",
            }).catch(() => {});
          }
        }

        logActivity(
          "cron_supplier_scoring",
          "supplier",
          `[${tenant.name}] ${scored.length} proveedores evaluados automáticamente`,
        ).catch(() => {});

        allResults.push({ tenant: tenant.name, scored: scored.length, rankings: scored });
      }

      logger.info("[cron/supplier-scoring] Completado", { tenants: allResults.length });

      return { ok: true, tenants: allResults };
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error("supplier-scoring cron failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Calculate weighted average unit cost from purchase orders */
function calcAvgCost(
  purchases: Array<{ items: Array<{ unitCost: unknown; quantity: number }> }>
): number {
  let totalCost = 0;
  let totalQty = 0;
  for (const p of purchases) {
    for (const item of p.items) {
      totalCost += toNumOrZero(item.unitCost as Parameters<typeof toNumOrZero>[0]) * item.quantity;
      totalQty += item.quantity;
    }
  }
  return totalQty > 0 ? totalCost / totalQty : 0;
}
