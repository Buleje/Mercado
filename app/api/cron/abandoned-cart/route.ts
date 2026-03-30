export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/create-notification";

/**
 * GET /api/cron/abandoned-cart
 *
 * Detecta carritos guardados sin completar por mas de 2 horas.
 * Usa la tabla SavedCart (customerPhone, itemsJson, updatedAt).
 * Retorna JSON con la lista de clientes y sus productos para
 * que un proceso externo (WhatsApp, etc.) envie el recordatorio.
 * Tambien crea notificaciones admin para el Notification Center.
 *
 * Sugerencia vercel.json: "0 *\/2 * * *" (cada 2 horas)
 * Autorizacion: Bearer <CRON_SECRET>
 */

type CartItem = {
  id?: string;
  name?: string;
  price?: number;
  qty?: number;
  quantity?: number;
  [key: string]: unknown;
};

type AbandonedCartResult = {
  customerPhone: string;
  customerName: string | null;
  abandonedSince: string;      // ISO — updatedAt del carrito
  minutesAbandoned: number;
  items: CartItem[];
  totalItems: number;
  estimatedValue: number;
  whatsappUrl: string;
  whatsappText: string;
};

function buildWhatsappText(name: string | null, items: CartItem[]): string {
  const greeting = name ? `Hola ${name}` : "Hola";
  const itemLines = items
    .slice(0, 3)
    .map((i) => {
      const qty = i.qty ?? i.quantity ?? 1;
      return `- ${i.name ?? "Producto"} x${qty}`;
    })
    .join("\n");
  const more = items.length > 3 ? `\n...y ${items.length - 3} mas` : "";
  return `${greeting}, tienes productos esperando en Buleje:\n${itemLines}${more}\n\nCompleta tu pedido aqui: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://bodega.san-martin.pe"}`;
}

function buildWhatsappUrl(phone: string, text: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

function estimateValue(items: CartItem[]): number {
  return items.reduce((acc, i) => {
    const qty = i.qty ?? i.quantity ?? 1;
    const price = typeof i.price === "number" ? i.price : 0;
    return acc + price * qty;
  }, 0);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("abandoned-cart", async () => {
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 horas atras
      const maxAge = new Date(Date.now() - 24 * 60 * 60 * 1000); // maximo 24 horas

      // Buscar carritos guardados actualizados hace mas de 2 horas pero menos de 24
      const carts = await prisma.savedCart.findMany({
        where: {
          updatedAt: { lt: cutoff, gt: maxAge },
          // Solo carritos con contenido
          NOT: { itemsJson: "[]" },
        },
        include: {
          customer: {
            select: { phone: true, name: true },
          },
        },
        orderBy: { updatedAt: "asc" },
      });

      if (carts.length === 0) {
        logger.info("[cron/abandoned-cart] Sin carritos abandonados");
        return { total: 0, carts: [], notificationsCreated: 0 };
      }

      const now = Date.now();
      let notificationsCreated = 0;

      const abandonados: AbandonedCartResult[] = carts.flatMap((cart) => {
        let items: CartItem[] = [];
        try {
          const parsed = JSON.parse(cart.itemsJson);
          items = Array.isArray(parsed) ? (parsed as CartItem[]) : [];
        } catch {
          return []; // JSON invalido — omitir
        }

        if (items.length === 0) return [];

        const minutesAbandoned = Math.floor((now - cart.updatedAt.getTime()) / 60000);
        const customerName = cart.customer?.name ?? null;
        const whatsappText = buildWhatsappText(customerName, items);

        return [
          {
            customerPhone: cart.customerPhone,
            customerName,
            abandonedSince: cart.updatedAt.toISOString(),
            minutesAbandoned,
            items,
            totalItems: items.length,
            estimatedValue: estimateValue(items),
            whatsappUrl: buildWhatsappUrl(cart.customerPhone, whatsappText),
            whatsappText,
          } satisfies AbandonedCartResult,
        ];
      });

      // Crear notificaciones admin para cada carrito abandonado
      for (const cart of abandonados) {
        const displayName = cart.customerName || cart.customerPhone;
        const valorStr = `S/${cart.estimatedValue.toFixed(2)}`;
        createNotification({
          tenantId: "main",
          type: "CARRITO_ABANDONADO",
          severity: cart.estimatedValue > 100 ? "HIGH" : "MEDIUM",
          title: `Carrito abandonado: ${displayName}`,
          body: `${displayName} dejo un carrito con ${cart.totalItems} producto${cart.totalItems !== 1 ? "s" : ""} (${valorStr}). Hace ${Math.floor(cart.minutesAbandoned / 60)}h ${cart.minutesAbandoned % 60}min.`,
          actionUrl: cart.whatsappUrl,
          actionLabel: "Contactar por WhatsApp",
          entityId: `abandoned-${cart.customerPhone}`,
        }).catch(() => {});
        notificationsCreated++;
      }

      logger.info(`[cron/abandoned-cart] ${abandonados.length} carritos abandonados detectados, ${notificationsCreated} notificaciones creadas`);

      return { total: abandonados.length, carts: abandonados, notificationsCreated };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    logger.error(`[cron/abandoned-cart] Error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
