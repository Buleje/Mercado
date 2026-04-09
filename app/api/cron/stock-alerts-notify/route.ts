import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { ProductsDB } from "@/lib/db/products.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { sendPushToPhone } from "@/lib/push-sender";
import { enqueueNotification } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/stock-alerts-notify
 *
 * Busca productos con stock por debajo del mínimo definido
 * (o < 5 si no tiene mínimo). Registra notificación en NotificationLog.
 *
 * Sugerencia vercel.json: "0 8,14,20 * * *" (3 veces al día)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("stock-alerts-notify", async () => {
      // Multi-tenant: process all active tenants
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, name: true },
      });

      const allResults: Array<{ tenant: string; total: number; agotados: number; bajos: number }> = [];

      for (const tenant of tenants) {
        // Query products for this tenant (check both slug and id for compatibility)
        const tenantIds = tenant.id === tenant.slug ? [tenant.id] : [tenant.id, tenant.slug];
        const allProducts = await prisma.product.findMany({
          where: {
            tenantId: { in: tenantIds },
            active: true,
            stock: { not: null },
          },
          select: { id: true, name: true, category: true, unit: true, stock: true, stockMin: true },
        });

        const alertas = allProducts
          .filter((p) => {
            const minimo = p.stockMin ?? 5;
            return (p.stock as number) < minimo;
          })
          .map((p) => ({
            id: p.id,
            nombre: p.name,
            categoria: p.category,
            unidad: p.unit,
            stockActual: p.stock as number,
            minimo: p.stockMin ?? 5,
            deficit: (p.stockMin ?? 5) - (p.stock as number),
          }));

        if (alertas.length === 0) continue;

        // Deduplication: check if we already sent alert for these products today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const recentLog = await prisma.notificationLog.findFirst({
          where: {
            type: "low_stock_cron",
            recipient: `admin-${tenant.slug}`,
            createdAt: { gte: today },
          },
        }).catch(() => null);

        // Skip if already notified today with same count (avoid duplicate WhatsApp spam)
        const alreadyNotified = recentLog?.message?.includes(`${alertas.length} producto(s)`);
        if (alreadyNotified) {
          allResults.push({ tenant: tenant.name, total: alertas.length, agotados: 0, bajos: alertas.length });
          continue;
        }

        // Register notification log
        const nombresAlerta = alertas
          .slice(0, 5)
          .map((a) => `${a.nombre} (${a.stockActual}/${a.minimo})`)
          .join(", ");
        const sufijo = alertas.length > 5 ? ` y ${alertas.length - 5} más` : "";

        await NotificationLogsDB.add({
          type: "low_stock_cron",
          recipient: `admin-${tenant.slug}`,
          message: `${alertas.length} producto(s) con stock bajo: ${nombresAlerta}${sufijo}`,
          status: "pending",
        });

        // Send push + WhatsApp to store owner
        (async () => {
          try {
            // ownerPhone vive en Tenant, no en Settings
            const tenantRecord = await prisma.tenant.findUnique({
              where: { id: tenant.id },
              select: { ownerPhone: true },
            });
            const ownerPhone = tenantRecord?.ownerPhone || (tenant.slug === "main" ? process.env.NOTIFY_PHONE : null);
            if (!ownerPhone) return;

            const pushBody = alertas.slice(0, 3).map(a => `${a.nombre}: ${a.stockActual}/${a.minimo}`).join(", ");
            const extra = alertas.length > 3 ? ` y ${alertas.length - 3} más` : "";

            sendPushToPhone(ownerPhone, {
              title: `⚠️ ${alertas.length} producto(s) con stock bajo`,
              body: pushBody + extra,
              url: "/admin?module=inventario&tab=stock",
            }).catch(() => {});

            // WhatsApp alert for ALL low stock products (not just agotados)
            const agotados = alertas.filter(a => a.stockActual <= 0);
            const bajos = alertas.filter(a => a.stockActual > 0);

            const lines: string[] = [
              `🚨 *Alerta de Stock — ${tenant.name}*`,
              ``,
            ];

            if (agotados.length > 0) {
              lines.push(`❌ *${agotados.length} AGOTADOS:*`);
              agotados.slice(0, 5).forEach(a => lines.push(`  • ${a.nombre}`));
              if (agotados.length > 5) lines.push(`  ...y ${agotados.length - 5} más`);
              lines.push(``);
            }

            if (bajos.length > 0) {
              lines.push(`⚠️ *${bajos.length} con stock bajo:*`);
              bajos.slice(0, 5).forEach(a => lines.push(`  • ${a.nombre}: quedan ${a.stockActual} (mín. ${a.minimo})`));
              if (bajos.length > 5) lines.push(`  ...y ${bajos.length - 5} más`);
              lines.push(``);
            }

            lines.push(`📱 Revisa tu panel → Inventario`);

            enqueueNotification({
              type: "whatsapp",
              recipient: ownerPhone,
              message: lines.join("\n"),
              tenantId: tenant.id,
            }).catch(() => {});

            allResults.push({
              tenant: tenant.name,
              total: alertas.length,
              agotados: agotados.length,
              bajos: bajos.length,
            });
          } catch { /* silencioso */ }
        })();

        logActivity(
          "stock-alert",
          "Product",
          `[${tenant.name}] ${alertas.length} producto(s) con stock bajo detectados por cron`,
          undefined,
          "cron"
        ).catch(() => {});
      }

      logger.info("[cron/stock-alerts-notify] Completado", { tenants: allResults.length });

      return {
        ok: true,
        tenants: allResults,
        processedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/stock-alerts-notify] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
