export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod";
import {
  getOrCreateConversation,
  loadConversationHistory,
  saveMessage,
} from "@/lib/ai-conversation-memory";

const SaveSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(5000),
});

// GET: Load conversation history for the advisor
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const conversationId = await getOrCreateConversation(
      auth.tenantId,
      auth.username ?? "admin",
      "coach",
    );

    const messages = await loadConversationHistory(conversationId);

    return NextResponse.json({
      conversationId,
      messages,
    });
  } catch {
    return NextResponse.json({ conversationId: null, messages: [] });
  }
}

// POST: Save a message to the conversation
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  try {
    const conversationId = await getOrCreateConversation(
      auth.tenantId,
      auth.username ?? "admin",
      "coach",
    );

    await saveMessage(conversationId, parsed.data.role, parsed.data.content);

    return NextResponse.json({ ok: true, conversationId });
  } catch {
    return NextResponse.json({ ok: true }); // Don't block UX if save fails
  }
}
