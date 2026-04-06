export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// ---------- helpers ----------

function toISO(d: Date) {
  return d.toISOString();
}

const PHONE_RE = /^9\d{8}$/;

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

export async function GET(req: NextRequest) {
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
    console.error("[chat/marketplace GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// ---------- POST: enviar mensaje ----------
// Body: { storeId, storePhone, storeName, customerPhone, customerName, message, senderType: "store"|"customer" }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }

    const {
      storeId,
      storePhone,
      storeName = "Tienda",
      customerPhone: rawCustomerPhone,
      customerName = "Cliente",
      message,
      senderType,
    } = body as {
      storeId?: string;
      storePhone?: string;
      storeName?: string;
      customerPhone?: string;
      customerName?: string;
      message?: string;
      senderType?: string;
    };

    // Validaciones
    if (!storeId?.trim()) {
      return NextResponse.json({ error: "storeId requerido" }, { status: 400 });
    }
    if (!rawCustomerPhone) {
      return NextResponse.json({ error: "customerPhone requerido" }, { status: 400 });
    }
    const customerPhone = normalizePhone(rawCustomerPhone);
    if (!PHONE_RE.test(customerPhone)) {
      return NextResponse.json({ error: "customerPhone inválido" }, { status: 400 });
    }
    if (!message?.trim() || message.trim().length > 500) {
      return NextResponse.json({ error: "message requerido (máx 500 chars)" }, { status: 400 });
    }
    if (senderType !== "store" && senderType !== "customer") {
      return NextResponse.json({ error: "senderType debe ser 'store' o 'customer'" }, { status: 400 });
    }

    // Codificamos storeId en customerName para no alterar el schema
    const storePrefix = `store:${storeId}:${storeName}`;
    const dbSender = senderType === "store" ? "admin" : "customer";

    const row = await prisma.chatMessage.create({
      data: {
        customerPhone,
        customerName: storePrefix,
        sender: dbSender,
        message: message.trim(),
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
          ? `Nuevo mensaje de ${customerName}: "${message.trim().slice(0, 100)}"`
          : `Mensaje de ${storeName}: "${message.trim().slice(0, 100)}"`,
        storeId
      ).catch(() => {});
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
    console.error("[chat/marketplace POST]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

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
    console.warn("[chat/marketplace] WhatsApp notify failed", res.status);
  }
}
