import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ── Schemas ──────────────────────────────────────────────────────────────────

const CreateConversationSchema = z.object({
  channel: z.enum(["assistant", "coach", "whatsapp"]).optional().default("assistant"),
  title: z.string().max(200).optional().default(""),
});

const SaveMessageSchema = z.object({
  conversationId: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(10000),
  mode: z.string().optional(),
  tokensUsed: z.number().int().optional(),
  latencyMs: z.number().int().optional(),
});

/**
 * GET /api/ai-assistant/history
 * List conversations for the current user, or get a specific conversation's messages.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = req.nextUrl;
  const conversationId = searchParams.get("conversationId");
  const search = searchParams.get("search");
  const channel = searchParams.get("channel");

  if (conversationId) {
    // Get specific conversation with messages
    const conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, tenantId: auth.tenantId, user: auth.username },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ data: conversation });
  }

  // List conversations — most recent first
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  const where: Record<string, unknown> = {
    tenantId: auth.tenantId,
    user: auth.username,
  };
  if (channel) where.channel = channel;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { messages: { some: { content: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const conversations = await prisma.aIConversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      channel: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ data: conversations });
}

/**
 * POST /api/ai-assistant/history
 * Create a new conversation or save a message to an existing one.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === "create") {
    const parsed = CreateConversationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }
    const conversation = await prisma.aIConversation.create({
      data: {
        tenantId: auth.tenantId,
        user: auth.username,
        channel: parsed.data.channel,
        title: parsed.data.title,
      },
    });
    return NextResponse.json({ data: conversation }, { status: 201 });
  }

  if (action === "message") {
    const parsed = SaveMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }

    // Verify conversation belongs to user + tenant
    const conv = await prisma.aIConversation.findFirst({
      where: { id: parsed.data.conversationId, tenantId: auth.tenantId, user: auth.username },
    });
    if (!conv) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const message = await prisma.aIMessage.create({
      data: {
        conversationId: parsed.data.conversationId,
        role: parsed.data.role,
        content: parsed.data.content,
        mode: parsed.data.mode,
        tokensUsed: parsed.data.tokensUsed,
        latencyMs: parsed.data.latencyMs,
      },
    });

    // Update conversation title from first user message if empty
    if (!conv.title && parsed.data.role === "user") {
      await prisma.aIConversation.update({
        where: { id: conv.id },
        data: { title: parsed.data.content.slice(0, 120) },
      });
    } else {
      // Touch updatedAt
      await prisma.aIConversation.update({
        where: { id: conv.id },
        data: { updatedAt: new Date() },
      });
    }

    return NextResponse.json({ data: message }, { status: 201 });
  }

  return NextResponse.json({ error: "action requerido: 'create' o 'message'" }, { status: 400 });
}
