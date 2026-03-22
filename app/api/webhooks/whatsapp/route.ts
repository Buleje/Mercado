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

            // Mock: Auto-respuesta o actualización de Orden si responde "CONFIRMO"
            if (text && text.toUpperCase().includes("CONFIRMO")) {
              await prisma.order.updateMany({
                where: { customerPhone: sender, status: "pendiente" },
                data: { status: "confirmado" }
              });
              logger.info(`[webhook/whatsapp] Auto-confirmada orden para ${sender}`);
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
