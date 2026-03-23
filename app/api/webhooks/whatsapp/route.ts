import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Webhook para Meta WhatsApp Business API o Twilio.
 * Recibe confirmaciones de lectura y respuestas de clientes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Verificar firma de seguridad (ej. Meta X-Hub-Signature-256)
    // const signature = req.headers.get("x-hub-signature-256");
    // verifySignature(signature, body);

    logger.info("[webhook/whatsapp] Recibido payload", { payload: body });

    // 2. Extraer statuses de mensajes (ej. 'delivered', 'read')
    if (body.entry && body.entry[0].changes) {
      for (const change of body.entry[0].changes) {
        if (change.value.statuses) {
          for (const statusObj of change.value.statuses) {
            const recipientId = statusObj.recipient_id;
            const status = statusObj.status;
            
            // Aquí podríamos actualizar la orden si el cliente leyó el mensaje
            // e.g. await prisma.notificationLog.update(...)
            logger.info(`[webhook/whatsapp] Mensaje a ${recipientId} tuvo status: ${status}`);
          }
        }
        
        // 3. Extraer respuestas del cliente (ej. interactivo o texto libre)
        if (change.value.messages) {
          for (const message of change.value.messages) {
            const sender = message.from; 
            const text = message.text?.body;
            
            logger.info(`[webhook/whatsapp] Mensaje recibido de ${sender}: ${text}`);

            if (text) {
              const upper = text.toUpperCase().trim();

              // CONFIRMO → confirmar pedido pendiente
              if (upper.includes("CONFIRMO")) {
                await prisma.order.updateMany({
                  where: { customerPhone: sender, status: "pendiente" },
                  data: { status: "confirmado" },
                });
                logger.info(`[webhook/whatsapp] Auto-confirmada orden para ${sender}`);
              }

              // PEDIDO / QUIERO → crear pedido desde texto
              else if (upper.startsWith("PEDIDO") || upper.startsWith("QUIERO")) {
                // Parse: "Quiero 2 arroz, 1 azucar, 3 aceite"
                const itemsText = text.replace(/^(pedido|quiero)\s*/i, "").trim();
                const itemRegex = /(\d+)\s+([^,]+)/g;
                const items: { name: string; quantity: number }[] = [];
                let match;
                while ((match = itemRegex.exec(itemsText)) !== null) {
                  items.push({ name: match[2].trim(), quantity: parseInt(match[1]) });
                }

                if (items.length > 0) {
                  // Try to find matching products
                  const orderItems = [];
                  for (const item of items) {
                    const product = await prisma.product.findFirst({
                      where: {
                        name: { contains: item.name, mode: "insensitive" },
                        active: true,
                      },
                      select: { id: true, name: true, price: true },
                    });
                    if (product) {
                      orderItems.push({
                        productId: product.id,
                        name: product.name,
                        price: product.price ?? 0,
                        quantity: item.quantity,
                      });
                    }
                  }

                  if (orderItems.length > 0) {
                    const total = orderItems.reduce((s, i) => s + (i.price * i.quantity), 0);

                    // Find or identify customer
                    const customer = await prisma.customer.findFirst({
                      where: { phone: sender },
                      select: { name: true },
                    });

                    await prisma.order.create({
                      data: {
                        customerName: customer?.name ?? sender,
                        customerPhone: sender,
                        total,
                        status: "pendiente",
                        paymentMethod: "efectivo",
                        notes: `Pedido via WhatsApp: ${text}`,
                        items: orderItems,
                        source: "whatsapp",
                      },
                    });

                    logger.info(`[webhook/whatsapp] Pedido creado para ${sender}: ${orderItems.length} productos, S/${total.toFixed(2)}`);
                  }
                }
              }

              // ESTADO → consultar estado de pedidos activos
              else if (upper.includes("ESTADO") || upper.includes("MI PEDIDO")) {
                const activeOrders = await prisma.order.findMany({
                  where: {
                    customerPhone: sender,
                    status: { notIn: ["entregado", "cancelado", "delivered", "cancelled"] },
                  },
                  select: { id: true, status: true, total: true },
                  take: 5,
                  orderBy: { createdAt: "desc" },
                });
                logger.info(`[webhook/whatsapp] Consulta estado de ${sender}: ${activeOrders.length} pedidos activos`);
              }

              // CATALOGO → enviar link al catálogo
              else if (upper.includes("CATALOGO") || upper.includes("PRODUCTOS") || upper.includes("MENU")) {
                logger.info(`[webhook/whatsapp] Solicitud de catalogo de ${sender}`);
                // The response would be sent via the WhatsApp API send message endpoint
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    logger.error("[webhook/whatsapp] Error procesando webhook", { error });
    return NextResponse.json({ error: "Fallo interno" }, { status: 500 });
  }
}

/**
 * Endpoint de Verificación para Meta (GET Challenge)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "BODEGASANMARTIN";

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      logger.info("[webhook/whatsapp] Verificación de Meta exitosa.");
      return new NextResponse(challenge, { status: 200 });
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({ error: "Bad Request" }, { status: 400 });
}
