import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  sendBotReply,
  sendInteractiveButtons,
  formatCatalog,
  formatOrderDetail,
  formatWelcome,
  formatPaymentInstructions,
} from "@/lib/whatsapp-bot";
import { generateAIResponse } from "@/lib/whatsapp-ai";

export const dynamic = "force-dynamic";

/* ─────────────────────────── helpers ─────────────────────────── */

interface WhatsAppMessage {
  from: string;
  text?: { body: string };
  interactive?: { button_reply?: { id: string; title: string } };
}

/* ─────────────────────────── POST ─────────────────────────── */

/**
 * Webhook para Meta WhatsApp Business API.
 * Recibe mensajes de clientes y responde automáticamente.
 */
export async function POST(req: NextRequest) {
  try {
    // Validar firma X-Hub-Signature-256 de Meta (si APP_SECRET está configurado)
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const rawBody = await req.text();
    if (appSecret) {
      const signature = req.headers.get("x-hub-signature-256");
      if (!signature) {
        logger.warn("[webhook/whatsapp] Payload sin firma — rechazado");
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
      }
      const crypto = await import("crypto");
      const expectedSig = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
      if (signature !== expectedSig) {
        logger.warn("[webhook/whatsapp] Firma inválida — rechazado");
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const body = JSON.parse(rawBody);

    logger.info("[webhook/whatsapp] Recibido payload", { payload: body });

    // 1. Status updates (delivered, read, etc.)
    if (body.entry?.[0]?.changes) {
      for (const change of body.entry[0].changes) {
        if (change.value.statuses) {
          for (const statusObj of change.value.statuses) {
            logger.info(`[webhook/whatsapp] Mensaje a ${statusObj.recipient_id} tuvo status: ${statusObj.status}`);
          }
        }

        // 2. Incoming messages
        if (change.value.messages) {
          for (const message of change.value.messages as WhatsAppMessage[]) {
            await handleMessage(message);
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

/* ─────────────────────────── message router ─────────────────────────── */

async function handleMessage(message: WhatsAppMessage) {
  const sender = message.from;

  // Handle interactive button replies
  if (message.interactive?.button_reply) {
    const btnId = message.interactive.button_reply.id;
    logger.info(`[webhook/whatsapp] Botón presionado por ${sender}: ${btnId}`);

    if (btnId === "btn_confirmar") {
      await handleConfirmo(sender);
    } else if (btnId === "btn_catalogo") {
      await handleCatalogo(sender);
    } else if (btnId === "btn_estado") {
      await handleEstado(sender);
    } else if (btnId === "btn_pago") {
      sendBotReply(sender, formatPaymentInstructions()).catch(() => {});
    }
    return;
  }

  const text = message.text?.body;
  if (!text) return;

  const upper = text.toUpperCase().trim();
  logger.info(`[webhook/whatsapp] Mensaje recibido de ${sender}: ${text}`);

  // ── HOLA / MENU / HI / BUENOS → Welcome
  if (/^(HOLA|MENU|HI|BUENOS|BUENAS|AYUDA|HELP)/.test(upper)) {
    sendBotReply(sender, formatWelcome()).catch(() => {});
    return;
  }

  // ── CATALOGO / PRODUCTOS → Product catalog
  if (upper.includes("CATALOGO") || upper.includes("PRODUCTOS")) {
    await handleCatalogo(sender);
    return;
  }

  // ── PRECIO [term] → Price lookup
  if (upper.startsWith("PRECIO")) {
    await handlePrecio(sender, text);
    return;
  }

  // ── PAGO → Payment instructions
  if (upper.includes("PAGO")) {
    sendBotReply(sender, formatPaymentInstructions()).catch(() => {});
    return;
  }

  // ── CONFIRMO → Confirm pending order
  if (upper.includes("CONFIRMO")) {
    await handleConfirmo(sender);
    return;
  }

  // ── ESTADO / MI PEDIDO → Order status
  if (upper.includes("ESTADO") || upper.includes("MI PEDIDO")) {
    await handleEstado(sender);
    return;
  }

  // ── PEDIDO / QUIERO → Create order from text
  if (upper.startsWith("PEDIDO") || upper.startsWith("QUIERO")) {
    await handlePedido(sender, text);
    return;
  }

  // ── Fallback → Respuesta IA + botones interactivos
  try {
    const [openOrder, fiadoCount] = await Promise.all([
      prisma.order.findFirst({
        where: { customerPhone: sender, status: { in: ["pendiente", "confirmado"] } },
        select: { id: true },
      }),
      prisma.fiado.count({ where: { customerId: sender, status: "ACTIVO" } }),
    ]);

    const customer = await prisma.customer.findFirst({
      where: { phone: sender },
      select: { name: true },
    });

    const aiReply = await generateAIResponse(text, customer?.name ?? sender, {
      hasOpenOrder: !!openOrder,
      hasFiado: fiadoCount > 0,
    });

    sendBotReply(sender, aiReply).catch(() => {});
    logger.info(`[webhook/whatsapp] Respuesta IA enviada a ${sender}`);
  } catch (err) {
    logger.warn("[webhook/whatsapp] Error en respuesta IA, usando fallback de botones", { error: err });
  }

  sendInteractiveButtons(sender, "¿Qué deseas hacer?", [
    { id: "btn_catalogo", title: "Ver catálogo" },
    { id: "btn_estado", title: "Mis pedidos" },
    { id: "btn_pago", title: "Cómo pagar" },
  ]).catch(() => {});
}

/* ─────────────────────────── command handlers ─────────────────────────── */

async function handleCatalogo(sender: string) {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      select: { name: true, price: true, stock: true },
      orderBy: { name: "asc" },
      take: 20,
    });

    const catalog = products.map(p => ({
      name: p.name,
      price: p.price ?? 0,
      stock: p.stock ?? 0,
    }));

    sendBotReply(sender, formatCatalog(catalog)).catch(() => {});
    logger.info(`[webhook/whatsapp] Catálogo enviado a ${sender}: ${catalog.length} productos`);
  } catch (err) {
    logger.error("[webhook/whatsapp] Error al obtener catálogo", { error: err });
    sendBotReply(sender, "Lo siento, no pude cargar el catálogo. Intenta de nuevo en un momento.").catch(() => {});
  }
}

async function handlePrecio(sender: string, text: string) {
  const term = text.replace(/^precio\s*/i, "").trim();
  if (!term) {
    sendBotReply(sender, "Escribe *PRECIO* seguido del producto.\nEjemplo: _PRECIO arroz_").catch(() => {});
    return;
  }

  try {
    const product = await prisma.product.findFirst({
      where: { name: { contains: term, mode: "insensitive" }, active: true },
      select: { name: true, price: true, stock: true, unit: true },
    });

    if (product) {
      const stockText = (product.stock ?? 0) > 0 ? `✅ ${product.stock} ${product.unit} disponibles` : "⛔ Agotado";
      sendBotReply(sender, `💰 *${product.name}*\nPrecio: S/${(product.price ?? 0).toFixed(2)} por ${product.unit}\n${stockText}\n\n🛒 Escribe "QUIERO 1 ${product.name}" para pedir`).catch(() => {});
    } else {
      sendBotReply(sender, `No encontré "${term}" en nuestro catálogo.\nEscribe *CATALOGO* para ver todos los productos.`).catch(() => {});
    }
    logger.info(`[webhook/whatsapp] Consulta precio de ${sender}: "${term}" → ${product ? product.name : "no encontrado"}`);
  } catch (err) {
    logger.error("[webhook/whatsapp] Error al buscar precio", { error: err });
    sendBotReply(sender, "Error al buscar el producto. Intenta de nuevo.").catch(() => {});
  }
}

async function handleConfirmo(sender: string) {
  try {
    const result = await prisma.order.updateMany({
      where: { customerPhone: sender, status: "pendiente" },
      data: { status: "confirmado" },
    });

    if (result.count > 0) {
      sendBotReply(sender, `✅ *¡Pedido confirmado!*\n\nTu pedido ha sido confirmado exitosamente.\nTe avisaremos cuando esté en camino. 🛵\n\n💳 Escribe *PAGO* para ver las opciones de pago.`).catch(() => {});
      sendInteractiveButtons(sender, "¿Qué deseas hacer ahora?", [
        { id: "btn_pago", title: "Ver opciones de pago" },
        { id: "btn_estado", title: "Ver mis pedidos" },
        { id: "btn_catalogo", title: "Seguir comprando" },
      ]).catch(() => {});
      logger.info(`[webhook/whatsapp] Auto-confirmadas ${result.count} órdenes para ${sender}`);
    } else {
      sendBotReply(sender, "No tienes pedidos pendientes por confirmar.\nEscribe *QUIERO* seguido de tus productos para hacer un nuevo pedido.").catch(() => {});
    }
  } catch (err) {
    logger.error("[webhook/whatsapp] Error al confirmar pedido", { error: err });
    sendBotReply(sender, "Error al confirmar tu pedido. Intenta de nuevo.").catch(() => {});
  }
}

async function handleEstado(sender: string) {
  try {
    const activeOrders = await prisma.order.findMany({
      where: {
        customerPhone: sender,
        status: { notIn: ["entregado", "cancelado"] },
      },
      select: {
        id: true,
        status: true,
        total: true,
        items: { select: { name: true, quantity: true, price: true } },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    });

    if (activeOrders.length > 0) {
      for (const order of activeOrders) {
        const detail = formatOrderDetail({
          id: order.id,
          status: order.status,
          total: order.total,
          items: order.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        });
        sendBotReply(sender, detail).catch(() => {});
      }
    } else {
      sendBotReply(sender, "No tienes pedidos activos.\nEscribe *QUIERO* seguido de tus productos para hacer un nuevo pedido. 🛒").catch(() => {});
    }

    logger.info(`[webhook/whatsapp] Consulta estado de ${sender}: ${activeOrders.length} pedidos activos`);
  } catch (err) {
    logger.error("[webhook/whatsapp] Error al consultar estado", { error: err });
    sendBotReply(sender, "Error al consultar tus pedidos. Intenta de nuevo.").catch(() => {});
  }
}

async function handlePedido(sender: string, text: string) {
  try {
    // Parse: "Quiero 2 arroz, 1 azucar, 3 aceite"
    const itemsText = text.replace(/^(pedido|quiero)\s*/i, "").trim();
    const itemRegex = /(\d+)\s+([^,]+)/g;
    const items: { name: string; quantity: number }[] = [];
    let match;
    while ((match = itemRegex.exec(itemsText)) !== null) {
      items.push({ name: match[2].trim(), quantity: parseInt(match[1]) });
    }

    if (items.length === 0) {
      sendBotReply(sender, "No pude entender tu pedido.\nFormato: *QUIERO 2 arroz, 1 azúcar, 3 aceite*\n\nEscribe *CATALOGO* para ver productos disponibles.").catch(() => {});
      return;
    }

    // Find matching products
    const orderItems = [];
    const notFound: string[] = [];
    for (const item of items) {
      const product = await prisma.product.findFirst({
        where: { name: { contains: item.name, mode: "insensitive" }, active: true },
        select: { id: true, name: true, price: true, unit: true, image: true },
      });
      if (product) {
        orderItems.push({
          productId: product.id,
          name: product.name,
          price: product.price ?? 0,
          quantity: item.quantity,
          unit: product.unit ?? "und",
          image: product.image ?? "",
        });
      } else {
        notFound.push(item.name);
      }
    }

    if (orderItems.length === 0) {
      sendBotReply(sender, `No encontré ninguno de los productos mencionados.\nEscribe *CATALOGO* para ver productos disponibles.`).catch(() => {});
      return;
    }

    const total = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);

    // Find or identify customer
    const customer = await prisma.customer.findFirst({
      where: { phone: sender },
      select: { name: true },
    });

    const order = await prisma.order.create({
      data: {
        id: crypto.randomUUID(),
        customerName: customer?.name ?? sender,
        customerPhone: sender,
        total,
        status: "pendiente",
        paymentMethod: "efectivo",
        notes: `[WhatsApp] ${text}`,
        items: { create: orderItems },
      },
    });

    // Build confirmation message
    const itemLines = orderItems.map(i => `  • ${i.quantity}x *${i.name}* — S/${(i.price * i.quantity).toFixed(2)}`).join("\n");
    const notFoundMsg = notFound.length > 0 ? `\n\n⚠️ No encontré: ${notFound.join(", ")}` : "";
    const shortId = order.id.slice(-8).toUpperCase();

    sendBotReply(sender, `🏪 *Buleje*\n━━━━━━━━━━━━━━━━━━━\n📋 Pedido #${shortId} creado\n━━━━━━━━━━━━━━━━━━━\n${itemLines}\n\n💰 *Total: S/${total.toFixed(2)}*${notFoundMsg}\n\n✅ Escribe *CONFIRMO* para confirmar\n❌ O escribe *CANCELAR* para anular`).catch(() => {});

    sendInteractiveButtons(sender, "¿Confirmas tu pedido?", [
      { id: "btn_confirmar", title: "Confirmar pedido" },
      { id: "btn_catalogo", title: "Seguir comprando" },
      { id: "btn_pago", title: "Cómo pagar" },
    ]).catch(() => {});

    logger.info(`[webhook/whatsapp] Pedido creado para ${sender}: ${orderItems.length} productos, S/${total.toFixed(2)}`);
  } catch (err) {
    logger.error("[webhook/whatsapp] Error al crear pedido", { error: err });
    sendBotReply(sender, "Error al crear tu pedido. Intenta de nuevo en un momento.").catch(() => {});
  }
}

/* ─────────────────────────── GET (Meta verification) ─────────────────────────── */

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
