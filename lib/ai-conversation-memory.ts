import "server-only";

/**
 * lib/ai-conversation-memory.ts
 *
 * Multi-turn conversation memory for the AI assistant.
 * Like having a notepad where the assistant writes down what you talked about,
 * so next time you ask something it remembers the context.
 *
 * Uses the AIConversation + AIMessage tables via Prisma.
 * Loads last N messages from a conversation to inject into the LLM context.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ── Config ────────────────────────────────────────────────────────────────────

/** Max messages to load as context (older ones get trimmed) */
const MAX_CONTEXT_MESSAGES = 16;

/** Max age for a conversation to be considered "active" (2 hours) */
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

// ── Public API ────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Get or create an active conversation for a user.
 * If the user has a recent conversation (< 2 hours old), reuse it.
 * Otherwise, create a new one.
 */
export async function getOrCreateConversation(
  tenantId: string,
  username: string,
  channel: "assistant" | "coach" = "assistant",
): Promise<string> {
  try {
    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);

    // Find most recent active conversation
    const existing = await prisma.aIConversation.findFirst({
      where: {
        tenantId,
        user: username,
        channel,
        updatedAt: { gte: cutoff },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (existing) return existing.id;

    // Create new conversation
    const created = await prisma.aIConversation.create({
      data: { tenantId, user: username, channel },
    });

    logger.info("[ai-memory] New conversation created", {
      conversationId: created.id,
      channel,
      username,
    });

    return created.id;
  } catch (err) {
    // If DB isn't ready (tables not migrated), return a temp ID
    logger.warn("[ai-memory] Could not access conversation table, using ephemeral mode", {
      error: err instanceof Error ? err.message : String(err),
    });
    return `ephemeral-${Date.now()}`;
  }
}

/**
 * Load recent messages from a conversation for LLM context.
 * Returns the last N messages in chronological order.
 */
export async function loadConversationHistory(
  conversationId: string,
): Promise<ConversationMessage[]> {
  // Skip for ephemeral conversations
  if (conversationId.startsWith("ephemeral-")) return [];

  try {
    const messages = await prisma.aIMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: MAX_CONTEXT_MESSAGES,
      select: { role: true, content: true },
    });

    // Reverse to chronological order
    return messages.reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  } catch {
    return [];
  }
}

/**
 * Save a message to a conversation.
 * Fire-and-forget safe — errors are logged but don't throw.
 */
export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: { mode?: string; tokensUsed?: number; latencyMs?: number },
): Promise<void> {
  if (conversationId.startsWith("ephemeral-")) return;

  try {
    await prisma.aIMessage.create({
      data: {
        conversationId,
        role,
        content,
        mode: metadata?.mode,
        tokensUsed: metadata?.tokensUsed,
        latencyMs: metadata?.latencyMs,
      },
    });

    // Update conversation title from first user message
    if (role === "user") {
      const conv = await prisma.aIConversation.findUnique({
        where: { id: conversationId },
        select: { title: true },
      });
      if (conv && !conv.title) {
        await prisma.aIConversation.update({
          where: { id: conversationId },
          data: { title: content.slice(0, 120) },
        });
      } else {
        await prisma.aIConversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
      }
    }
  } catch (err) {
    logger.warn("[ai-memory] Failed to save message", {
      conversationId,
      role,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
