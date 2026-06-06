import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ChatThreadsDB, ChatMessagesDB } from "@/lib/db/chat.db";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireCustomer } from "@/lib/auth/require-customer";

/**
 * Bandeja del chat marketplace (estilo Messenger) — Brandon 2026-06-06 v2.
 *
 * v2: migrado del modelo legacy ChatMessage al sistema D2
 * (ConversationThread/ConversationMessage) — el MISMO que usa el ChatTab
 * del panel admin de la tienda. Antes cliente y tienda escribían en
 * sistemas distintos y no se veían entre sí.
 *
 * GET  → threads del customer logueado (cross-tienda) con logo, último
 *        mensaje, unreadForBuyer. + unreadTotal para el badge del nav.
 * PATCH { threadId } → marca el thread leído del lado buyer
 *        (resetea unreadForBuyer + sella readByBuyerAt → la tienda ve ✓✓).
 *
 * Seguridad: sesión JWT de customer obligatoria; ownership por phone.
 */

const PHONE_RE = /^9\d{8}$/;

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("51") && cleaned.length === 11) return cleaned.slice(2);
  return cleaned;
}

export const GET = withApiHandler("chat-mkt-conversations-get", async (req: NextRequest) => {
  // GENEROUS: la bandeja se POLLEA (15s idle / 6s abierta) — MODERATE
  // (20/5min) bloqueaba el polling legítimo a los ~5 minutos.
  const limited = applyRateLimit(req, "GENEROUS", "chat-mkt-convs");
  if (limited) return limited;

  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;
  if (!customer.customerId) {
    return NextResponse.json({ error: "Cuenta no vinculada a un teléfono" }, { status: 400 });
  }
  const phone = normalizePhone(customer.customerId);
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "Teléfono de sesión inválido" }, { status: 400 });
  }

  try {
    const threads = await ChatThreadsDB.listByCustomerPhone(phone, { limit: 30 });

    const data = threads.map((t) => ({
      threadId: t.id,
      storeId: t.storeId,
      storeName: t.storeName,
      storeSlug: t.storeSlug,
      storeLogo: t.storeLogo,
      lastMessage: t.lastMessageText ?? "",
      lastSenderType:
        t.lastSenderType === "buyer" ? ("customer" as const) : ("store" as const),
      lastAt: t.lastMessageAt ?? t.createdAt,
      unreadCount: t.unreadForBuyer,
    }));

    const unreadTotal = data.reduce((n, c) => n + c.unreadCount, 0);

    return NextResponse.json(
      { data, unreadTotal },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    logger.error("[chat/marketplace/conversations GET]", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
});

const MarkReadSchema = z.object({
  threadId: z.string().min(1).max(100),
});

export const PATCH = withApiHandler("chat-mkt-conversations-read", async (req: NextRequest) => {
  const limited = applyRateLimit(req, "GENEROUS", "chat-mkt-read");
  if (limited) return limited;

  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;
  if (!customer.customerId) {
    return NextResponse.json({ error: "Cuenta no vinculada a un teléfono" }, { status: 400 });
  }
  const phone = normalizePhone(customer.customerId);
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "Teléfono de sesión inválido" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = MarkReadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "threadId requerido" }, { status: 400 });
  }

  try {
    // Ownership: el thread debe pertenecer al phone de la sesión.
    const thread = await prisma.conversationThread.findUnique({
      where: { id: parsed.data.threadId },
      select: { tenantId: true, customerPhone: true },
    });
    if (!thread || normalizePhone(thread.customerPhone) !== phone) {
      return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
    }

    await ChatMessagesDB.markAsRead(thread.tenantId, parsed.data.threadId, "buyer");
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    logger.error("[chat/marketplace/conversations PATCH]", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
});
