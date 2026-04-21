import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ProductsDB } from "@/lib/db/products.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { logger } from "@/lib/logger";
import { z } from "zod";

const bodySchema = z.object({
  /** fuerza recorrer todos los productos aunque no estén críticos */
  includeAll: z.boolean().optional(),
  /** umbral en días de cobertura para disparar — default: solo stockMin */
  maxDays: z.number().int().positive().optional(),
});

/**
 * POST /api/admin/alerts/stock-critical
 *
 * Detecta SKUs críticos (stock ≤ stockMin) y dispara notificaciones:
 *  - Crea entradas en NotificationsDB (in-app bell)
 *  - Si WHATSAPP_WEBHOOK_URL está configurado → POST con payload
 *  - Si TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID → sendMessage
 *
 * Devuelve resumen de cuántos canales dispararon y a cuántos SKUs afecta.
 *
 * Autorización: admin. Puede ser triggereado desde UI o cron diario.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req, ["owner", "admin", "manager"]);
    if (admin instanceof NextResponse) return admin;

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    const opts = parsed.success ? parsed.data : {};
    const tenantId = req.headers.get("x-tenant-id") || "main";

    const allProducts = await ProductsDB.getAll(tenantId);
    const critical = allProducts.filter((p) => {
      if (!p.active) return false;
      const stock = p.stock ?? 0;
      const min = p.stockMin ?? 5;
      if (opts.includeAll) return stock <= min;
      return stock <= min && stock >= 0;
    });

    if (critical.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Sin SKUs críticos — no se enviaron alertas",
        affected: 0,
        channels: { inApp: 0, whatsapp: false, telegram: false },
      });
    }

    // Preparar mensaje
    const topList = critical
      .slice(0, 10)
      .map(
        (p) =>
          `• ${p.name} — stock ${p.stock ?? 0} / min ${p.stockMin ?? "—"}`,
      )
      .join("\n");
    const subject = `⚠️ ${critical.length} SKU${critical.length > 1 ? "s" : ""} en stock crítico`;
    const body = `Bodega San Martín · alerta automática\n\n${topList}${
      critical.length > 10 ? `\n...y ${critical.length - 10} más` : ""
    }\n\nRevisá en /admin · módulo Inventario.`;

    let inAppCreated = 0;
    let whatsappOk = false;
    let telegramOk = false;

    // 1. In-app notification log
    try {
      await NotificationLogsDB.add(
        {
          type: "stock_critical",
          recipient: "admin",
          message: `${subject} — ${critical.length} SKUs`,
          status: "sent",
        },
        tenantId,
      );
      inAppCreated = 1;
    } catch (e) {
      logger.warn("[alerts/stock-critical] in-app notif failed", { error: String(e) });
    }

    // 2. WhatsApp webhook
    const waUrl = process.env.WHATSAPP_WEBHOOK_URL;
    if (waUrl) {
      try {
        const res = await fetch(waUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "stock_critical",
            subject,
            body,
            skus: critical.map((p) => ({
              id: p.id,
              name: p.name,
              stock: p.stock,
              min: p.stockMin,
            })),
            tenantId,
            generatedAt: new Date().toISOString(),
          }),
        });
        whatsappOk = res.ok;
      } catch (e) {
        logger.warn("[alerts/stock-critical] whatsapp webhook failed", {
          error: String(e),
        });
      }
    }

    // 3. Telegram bot
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat = process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChat) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${tgToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: tgChat,
              text: `*${subject}*\n\n${topList}${
                critical.length > 10 ? `\n...y ${critical.length - 10} más` : ""
              }`,
              parse_mode: "Markdown",
            }),
          },
        );
        telegramOk = res.ok;
      } catch (e) {
        logger.warn("[alerts/stock-critical] telegram failed", { error: String(e) });
      }
    }

    logger.info("[alerts/stock-critical] dispatched", {
      affected: critical.length,
      inApp: inAppCreated,
      whatsapp: whatsappOk,
      telegram: telegramOk,
      tenantId,
    });

    return NextResponse.json({
      ok: true,
      affected: critical.length,
      channels: { inApp: inAppCreated, whatsapp: whatsappOk, telegram: telegramOk },
      preview: {
        subject,
        firstItems: critical.slice(0, 5).map((p) => ({
          id: p.id,
          name: p.name,
          stock: p.stock,
          min: p.stockMin,
        })),
      },
    });
  } catch (err) {
    logger.error("[alerts/stock-critical] failed", { error: String(err) });
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
