import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireCustomer } from "@/lib/auth/require-customer";
import { requireAdmin } from "@/lib/require-admin";

// ---------- helpers ----------

function toISO(d: Date) {
  return d.toISOString();
}

const PHONE_RE = /^9\d{8}$/;

const MarketplaceChatSchema = z.object({
  storeId: z.string().min(1).max(100),
  storePhone: z.string().max(30).optional(),
  storeName: z.string().max(200).default("Tienda"),
  customerPhone: z.string().min(1).max(30),
  customerName: z.string().max(200).default("Cliente"),
  message: z.string().min(1).max(500).transform((s) => s.trim()),
  senderType: z.enum(["store", "customer"]),
});

/**
 * Normaliza phone: acepta "51XXXXXXXXX" y "9XXXXXXXX"
 */
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("51") && cleaned.length === 11) return cleaned.slice(2);
  return cleaned;
}

// ---------- GET: obtener mensajes de un chat marketplace ----------
// ?storeId=xxx&customerPhone=9xxxxxxxx&limit=50

export const GET = withApiHandler("chat-marketplace-get", async (req, _ctx) => {
  // GENEROUS: la conversación abierta POLLEA cada 5s (chat "en vivo") —
  // MODERATE (20/5min) cortaba el chat a los ~100 segundos (Brandon 2026-06-06).
  const limited = applyRateLimit(req, "GENEROUS", "chat-mkt-get");
  if (limited) return limited;

  // P0 #5 — requiere sesión de cliente autenticado
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  if (!customer.customerId) {
    return NextResponse.json({ error: "Cuenta no vinculada a un teléfono" }, { status: 400 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const storeId = searchParams.get("storeId");
    const rawPhone = searchParams.get("customerPhone");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

    if (!storeId?.trim()) {
      return NextResponse.json({ error: "storeId requerido" }, { status: 400 });
    }
    if (!rawPhone) {
      return NextResponse.json({ error: "customerPhone requerido" }, { status: 400 });
    }

    const phone = normalizePhone(rawPhone);
    if (!PHONE_RE.test(phone)) {
      return NextResponse.json({ error: "customerPhone inválido (9 dígitos)" }, { status: 400 });
    }

    // Ownership check: el phone del query debe coincidir con el de la sesión
    if (normalizePhone(customer.customerId) !== phone) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Usamos ChatMessage existente con filtro por combinación storeId+phone
    // El storeId se almacena en customerName como prefijo "store:<storeId>:<nombre>"
    // para no requerir migración de schema.
    const storePrefix = `store:${storeId}:`;

    const messages = await prisma.chatMessage.findMany({
      where: {
        customerPhone: phone,
        customerName: { startsWith: storePrefix },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    const data = messages.map((m) => ({
      id: m.id,
      storeId,
      customerPhone: m.customerPhone,
      senderType: m.sender === "admin" ? "store" : "customer",
      message: m.message,
      read: m.read,
      createdAt: toISO(m.createdAt),
    }));

    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[chat/marketplace GET]", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
});

// ---------- POST: enviar mensaje ----------
// Body: { storeId, storePhone, storeName, customerPhone, customerName, message, senderType: "store"|"customer" }

export const POST = withApiHandler("chat-marketplace-post", async (req, _ctx) => {
  const limited = applyRateLimit(req, "MODERATE", "chat-mkt-post");
  if (limited) return limited;

  try {
    const body = await req.json().catch((err) => {
      logger.warn("Invalid JSON body in chat-marketplace POST", { err: err instanceof Error ? err.message : String(err) });
      return null;
    });
    const parsed = MarketplaceChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos de chat inválidos" }, { status: 400 });
    }

    const {
      storeId,
      storePhone,
      storeName,
      customerName,
      message,
      senderType,
    } = parsed.data;

    let customerPhone: string;

    if (senderType === "customer") {
      // P0 #6 — requiere sesión de cliente; ignorar customerPhone del body
      const customer = await requireCustomer(req);
      if (customer instanceof NextResponse) return customer;

      if (!customer.customerId) {
        return NextResponse.json({ error: "Cuenta no vinculada a un teléfono" }, { status: 400 });
      }
      customerPhone = normalizePhone(customer.customerId);
    } else {
      // senderType === "store" — requiere admin del tenant
      const admin = await requireAdmin(req, ["admin", "cajero", "tienda_owner"]);
      if (admin instanceof NextResponse) return admin;

      customerPhone = normalizePhone(parsed.data.customerPhone);
    }

    if (!PHONE_RE.test(customerPhone)) {
      return NextResponse.json({ error: "customerPhone inválido (9 dígitos)" }, { status: 400 });
    }

    // Obtener tenantId de la tienda para aislamiento multi-tenant
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { tenantId: true } });
    const tenantId = store?.tenantId ?? "main";

    // Codificamos storeId en customerName para no alterar el schema
    const storePrefix = `store:${storeId}:${storeName}`;
    const dbSender = senderType === "store" ? "admin" : "customer";

    const row = await prisma.chatMessage.create({
      data: {
        customerPhone,
        customerName: storePrefix,
        sender: dbSender,
        message,
        tenantId,
      },
    });

    // Fire-and-forget: notificar por WhatsApp al destinatario
    const recipientPhone =
      senderType === "customer"
        ? storePhone   // notificar a la tienda
        : customerPhone; // notificar al comprador

    if (recipientPhone) {
      notifyWhatsApp(
        recipientPhone,
        senderType === "customer"
          ? `Nuevo mensaje de ${customerName}: "${message.slice(0, 100)}"`
          : `Mensaje de ${storeName}: "${message.slice(0, 100)}"`,
        storeId
      ).catch((err) => logger.error("[chat/marketplace] WhatsApp notify failed", { error: String(err), storeId }));
    }

    return NextResponse.json(
      {
        data: {
          id: row.id,
          storeId,
          customerPhone: row.customerPhone,
          senderType,
          message: row.message,
          read: row.read,
          createdAt: toISO(row.createdAt),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error("[chat/marketplace POST]", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
});

// ---------- fire-and-forget helper ----------

async function notifyWhatsApp(
  phone: string,
  text: string,
  _storeId: string
): Promise<void> {
  const apiKey = process.env.WHATSAPP_API_KEY;
  const baseUrl = process.env.WHATSAPP_API_URL;
  if (!apiKey || !baseUrl) return;

  const formattedPhone = phone.startsWith("51") ? phone : `51${phone}`;

  const res = await fetch(`${baseUrl}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ phone: formattedPhone, message: text }),
  });

  if (!res.ok) {
    logger.warn("[chat/marketplace] WhatsApp notify failed", { detail: String(res.status) });
  }
}
