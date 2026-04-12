import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { WhatsAppConversation } from "@/lib/generated/prisma/client";
import type { CartItem, ConversationState } from "./types";

// Session TTL: 30 minutes of inactivity
const SESSION_TTL_MS = 30 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cartItemsToJson(items: CartItem[]): string {
  return JSON.stringify(items);
}

function parseCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw as CartItem[];
}

function newExpiresAt(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load an active (non-expired) conversation by tenantId + phone.
 * Returns null if none exists or session has expired.
 * tenantId is always the first parameter (CLAUDE.md rule #3).
 */
export async function getConversation(
  tenantId: string,
  phone: string,
): Promise<WhatsAppConversation | null> {
  try {
    const row = await (prisma as unknown as {
      whatsAppConversation: {
        findUnique: (args: unknown) => Promise<WhatsAppConversation | null>;
      };
    }).whatsAppConversation.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });

    if (!row) return null;

    // Treat expired sessions as non-existent so the engine starts fresh
    if (row.expiresAt < new Date()) {
      // Fire-and-forget cleanup — never await non-critical ops
      deleteConversation(tenantId, phone).catch(() => {});
      return null;
    }

    return row;
  } catch (err) {
    logger.error("[conversation-store] getConversation failed", {
      tenantId,
      phone,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Upsert conversation state. Creates row if first message, updates otherwise.
 * tenantId is always the first parameter (CLAUDE.md rule #3).
 */
export async function upsertConversation(
  tenantId: string,
  phone: string,
  state: ConversationState,
  cartItems: CartItem[],
  options: { deliveryAddress?: string; escalated?: boolean } = {},
): Promise<WhatsAppConversation | null> {
  const expiresAt = newExpiresAt();
  const cartJson = cartItemsToJson(cartItems);

  try {
    const result = await (prisma as unknown as {
      whatsAppConversation: {
        upsert: (args: unknown) => Promise<WhatsAppConversation>;
      };
    }).whatsAppConversation.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      create: {
        tenantId,
        phone,
        state,
        cartItems: cartJson,
        deliveryAddress: options.deliveryAddress,
        lastMessageAt: new Date(),
        expiresAt,
      },
      update: {
        state,
        cartItems: cartJson,
        lastMessageAt: new Date(),
        expiresAt,
        ...(options.deliveryAddress != null && {
          deliveryAddress: options.deliveryAddress,
        }),
      },
    });
    return result;
  } catch (err) {
    logger.error("[conversation-store] upsertConversation failed", {
      tenantId,
      phone,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Read the cart items from a conversation row, safely parsed.
 */
export function extractCartItems(
  conversation: WhatsAppConversation | null,
): CartItem[] {
  if (!conversation) return [];
  return parseCartItems(conversation.cartItems);
}

/**
 * Extract the conversation state with a safe fallback to "idle".
 */
export function extractState(
  conversation: WhatsAppConversation | null,
): ConversationState {
  if (!conversation) return "idle";
  const valid: ConversationState[] = [
    "idle",
    "browsing",
    "cart",
    "checkout",
    "awaiting_payment",
    "completed",
  ];
  return valid.includes(conversation.state as ConversationState)
    ? (conversation.state as ConversationState)
    : "idle";
}

/**
 * Hard-delete a conversation row (used on expiry or explicit cancel).
 * tenantId is always the first parameter (CLAUDE.md rule #3).
 */
export async function deleteConversation(
  tenantId: string,
  phone: string,
): Promise<void> {
  try {
    await (prisma as unknown as {
      whatsAppConversation: {
        delete: (args: unknown) => Promise<unknown>;
      };
    }).whatsAppConversation.delete({
      where: { tenantId_phone: { tenantId, phone } },
    });
  } catch {
    // Ignore — row may not exist
  }
}
