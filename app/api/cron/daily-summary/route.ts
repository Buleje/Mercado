import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { SalesDB, CashRegistersDB } from "@/lib/db/sales.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { ProductsDB } from "@/lib/db/products.db";
import { logger } from "@/lib/logger";
import { enqueueActivityLog } from "@/lib/queue";
import { sendPushToPhone } from "@/lib/push-sender";
import { enqueueNotification } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { generateDailyInsights } from "@/lib/ai/daily-insights";
import { reportAICall } from "@/lib/billing/wire-up/ai-metering-middleware";

/**
 * GET /api/cron/daily-summary
 *
 * Recopila el resumen diario: ventas, pedidos, stock bajo,
 * top 5 productos y diferencia de caja.
 * El resultado puede consumirse por otro servicio (WhatsApp / email).
 *
 * Sugerencia vercel.json: "0 20 * * *" (20:00 cada día)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("daily-summary", async () => {
      // Multi-tenant: process all active tenants
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, name: true },
      });

      const summaries: Array<{ tenant: string; totalVentas: number; totalPedidos: number }> = [];

      for (const tenant of tenants) {
        const tenantId = tenant.id;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfDayISO = startOfDay.toISOString();

        // Recopilar datos en paralelo
        const [allSales, todayOrders, allProducts, openCash] = await Promise.all([
          SalesDB.getAll(tenantId),
          OrdersDB.getAllFiltered({ since: startOfDayISO, tenantId }),
          ProductsDB.getAll(tenantId),
          CashRegistersDB.getOpen(tenantId),
        ]);

        // Ventas POS del día
        const todaySales = allSales.filter(
          (s) => new Date(s.createdAt) >= startOfDay
        );

        // Brandon mayo 2026 v7: para el reporte diario "ventas del día" solo
        // contamos los pedidos entregados. Antes incluía pendientes/confirmados/
        // en_camino que pueden cancelarse y distorsionan el ingreso reportado.
        const activeOrders = todayOrders.filter((o) => {
          const status = (o.status ?? "").toLowerCase();
          return status === "entregado" || status === "delivered";
        });

        // Totales
        const salesTotal = todaySales.reduce((sum, s) => sum + (s.total ?? 0), 0);
        const ordersTotal = activeOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
        const totalVentas = salesTotal + ordersTotal;
        const totalPedidos = todaySales.length + activeOrders.length;

        // Top 5 productos vendidos
        const productMap: Record<string, { nombre: string; cantidad: number; ingresos: number }> = {};
        for (const sale of todaySales) {
          for (const item of sale.items ?? []) {
            const key = String(item.productId);
            if (!productMap[key]) productMap[key] = { nombre: item.name, cantidad: 0, ingresos: 0 };
            productMap[key].cantidad += item.quantity ?? 0;
            productMap[key].ingresos += (item.price ?? 0) * (item.quantity ?? 0);
          }
        }
        for (const order of activeOrders) {
          for (const item of order.items ?? []) {
            const key = String(item.id);
            if (!productMap[key]) productMap[key] = { nombre: item.name, cantidad: 0, ingresos: 0 };
            productMap[key].cantidad += item.quantity ?? 0;
            productMap[key].ingresos += (item.price ?? 0) * (item.quantity ?? 0);
          }
        }
        const top5Productos = Object.values(productMap)
          .sort((a, b) => b.cantidad - a.cantidad)
          .slice(0, 5);

        // Productos con stock bajo
        const productosStockBajo = allProducts.filter((p) => {
          if (!p.active) return false;
          if (p.stock == null) return false;
          const min = p.stockMin ?? 5;
          return p.stock <= min;
        });

        // Diferencia de caja
        let diferenciaCaja: number | null = null;
        if (openCash) {
          const totalIngresos = openCash.movements
            .filter((m) => m.type === "venta" || m.type === "ingreso")
            .reduce((sum, m) => sum + m.amount, 0);
          const totalEgresos = openCash.movements
            .filter((m) => m.type === "egreso")
            .reduce((sum, m) => sum + m.amount, 0);
          const esperado = openCash.openingAmount + totalIngresos - totalEgresos;
          diferenciaCaja = openCash.closingAmount != null
            ? openCash.closingAmount - esperado
            : null;
        }

        const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;
        const fechaTexto = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

        // Obtener resumen del día anterior para comparar tendencias
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);

        let summaryAyer: { totalVentas: number; totalPedidos: number; ticketPromedio: number } | null = null;
        try {
          const prevSummary = await prisma.dailySummary.findFirst({
            where: {
              tenantId,
              fecha: { gte: yesterday, lte: yesterdayEnd },
            },
            select: {
              totalVentas: true,
              cantidadVentas: true,
              ticketPromedio: true,
            },
          });
          if (prevSummary) {
            summaryAyer = {
              totalVentas: Number(prevSummary.totalVentas),
              totalPedidos: prevSummary.cantidadVentas,
              ticketPromedio: Number(prevSummary.ticketPromedio),
            };
          }
        } catch (e) {
          logger.warn("[daily-summary] No se pudo obtener resumen de ayer", { error: String(e) });
        }

        // Generar resumen inteligente con IA (fire-and-forget safe — nunca rompe el cron)
        const aiInsights = await generateDailyInsights({
          hoy: {
            totalVentas,
            totalPedidos,
            ticketPromedio,
            top5Productos,
            productosStockBajo,
            diferenciaCaja,
            tenantName: tenant.name,
            fechaTexto,
          },
          ayer: summaryAyer,
        }).catch((err: unknown) => {
          logger.warn("[cron/daily-summary] generateDailyInsights failed", {
            tenantId,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        });

        // ADR-047 billing wire-up: meter AI insight call when LLM succeeded.
        // Idempotency: tenant + yyyy-mm-dd → 1 event per day per tenant
        if (aiInsights) {
          try {
            const dayKey = startOfDay.toISOString().slice(0, 10);
            reportAICall(tenantId, "ai.insight.call", `insight:${tenantId}:${dayKey}`);
          } catch {
            // Metering never blocks the cron
          }
        }

        // Auto-save DailySummary record. Schema has @@index([tenantId, fecha])
        // but no @@unique on the pair, so upsert isn't available — fall back
        // to findFirst + update/create. Schema field types:
        //   diferenciaCaja: Decimal NOT NULL @default(0)
        //   stockAlertas:   String? (JSON stringified list)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diferenciaCajaSafe = diferenciaCaja ?? 0;
        const stockAlertasJson = JSON.stringify(
          productosStockBajo.map((p) => ({ id: p.id, name: p.name, stock: p.stock ?? 0 })),
        );
        try {
          const existing = await prisma.dailySummary.findFirst({
            where: { tenantId, fecha: today },
            select: { id: true },
          });
          if (existing) {
            await prisma.dailySummary.update({
              where: { id: existing.id },
              data: {
                totalVentas,
                cantidadVentas: totalPedidos,
                ticketPromedio,
                diferenciaCaja: diferenciaCajaSafe,
                stockAlertas: stockAlertasJson,
                productoTop: top5Productos[0]?.nombre ?? null,
                mejorHora: null,
              },
            });
          } else {
            await prisma.dailySummary.create({
              data: {
                tenantId,
                fecha: today,
                totalVentas,
                cantidadVentas: totalPedidos,
                ticketPromedio,
                diferenciaCaja: diferenciaCajaSafe,
                stockAlertas: stockAlertasJson,
                productoTop: top5Productos[0]?.nombre ?? null,
                creadoPor: "cron",
              },
            });
          }
        } catch (e) {
          logger.warn("[daily-summary] Error saving DailySummary", { error: String(e) });
        }

        // Texto del resumen: preferir versión IA, con fallback a texto raw estructurado
        const aiSummaryText = aiInsights?.summary ?? null;
        const trendEmoji = aiInsights?.emoji ?? "📊";

        const rawLines = [
          `💰 Ventas: S/ ${totalVentas.toFixed(2)} (${totalPedidos} transacciones)`,
          `🧾 Ticket promedio: S/ ${ticketPromedio.toFixed(2)}`,
          `📦 Stock bajo: ${productosStockBajo.length} productos`,
          diferenciaCaja !== null ? `💵 Diferencia caja: S/ ${diferenciaCaja.toFixed(2)}` : null,
          top5Productos.length > 0 ? `🏆 Top: ${top5Productos.slice(0, 3).map((p, i) => `${i + 1}. ${p.nombre} (${p.cantidad})`).join(" | ")}` : null,
          productosStockBajo.length > 0 ? `⚠ Stock crítico: ${productosStockBajo.slice(0, 3).map(p => `${p.name}(${p.stock})`).join(", ")}` : null,
        ].filter((line): line is string => line !== null).join("\n");

        const whatsappText = [
          `${trendEmoji} *Resumen del día — ${tenant.name}*`,
          `📅 ${fechaTexto}`,
          ``,
          // Cuerpo principal: IA o raw
          aiSummaryText ?? rawLines,
          ``,
          // Siempre incluir el detalle raw como referencia rápida
          aiSummaryText ? rawLines : null,
          aiSummaryText ? `` : null,
          `─────`,
          `${tenant.name} 🏪`,
        ].filter((line): line is string => line !== null).join("\n");

        // Send WhatsApp + Push to store owner.
        // ownerPhone lives on the Tenant model (not Settings) — read it from
        // the already-loaded tenant to avoid an extra round trip.
        (async () => {
          try {
            const tenantWithPhone = await prisma.tenant.findUnique({
              where: { id: tenant.id },
              select: { ownerPhone: true },
            });
            const ownerPhone = tenantWithPhone?.ownerPhone || (tenant.slug === "main" ? process.env.NOTIFY_PHONE : null);
            if (ownerPhone) {
              enqueueNotification({ type: "whatsapp", recipient: ownerPhone, message: whatsappText, tenantId: tenant.id, metadata: { purpose: "daily-summary" } }).catch((err) => logger.error("[cron/daily-summary] WhatsApp enqueue failed", { error: String(err), tenantId: tenant.id }));
              sendPushToPhone(ownerPhone, {
                title: `📊 Resumen del día — ${tenant.name}`,
                body: `S/ ${totalVentas.toFixed(2)} en ventas · ${totalPedidos} pedidos · ${productosStockBajo.length} alertas`,
                url: "/admin?module=panel-principal",
              }).catch((err) => logger.error("[cron/daily-summary] push send failed", { error: String(err), tenantId: tenant.id }));
            }
          } catch { /* silencioso */ }
        })();

        summaries.push({ tenant: tenant.name, totalVentas, totalPedidos });

        enqueueActivityLog({ action: "daily-summary", resource: "Report", userId: "cron", tenantId: tenant.id, details: { description: `[${tenant.name}] Resumen: S/ ${totalVentas.toFixed(2)} en ventas, ${totalPedidos} pedidos` }, timestamp: new Date().toISOString() }).catch((err: unknown) => logger.warn("[cron/daily-summary] enqueueActivityLog failed", { error: String(err), tenantId }));
      }

      logger.info("[cron/daily-summary] Completado", { tenants: summaries.length });

      return {
        ok: true,
        tenants: summaries,
        generadoA: new Date().toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/daily-summary] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
