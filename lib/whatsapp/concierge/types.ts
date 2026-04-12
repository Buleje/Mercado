import "server-only";
import type { WhatsAppConversation } from "@/lib/generated/prisma/client";
import type { Classification } from "../ai-intent";

// Re-export for convenience within the concierge package
export type { Classification };

// ─── Conversation State ───────────────────────────────────────────────────────

/** Valid states for a WhatsApp conversation session */
export type ConversationState =
  | "idle"
  | "browsing"
  | "cart"
  | "checkout"
  | "awaiting_payment"
  | "completed";

// ─── Cart ─────────────────────────────────────────────────────────────────────

export interface CartItem {
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

/**
 * Full context passed to every handler. Immutable after construction.
 */
export interface ConversationContext {
  /** tenantId always comes from the platform config, never from the WA payload */
  tenantId: string;
  /** Caller phone in E.164 without '+' (e.g. "51987654321") */
  phone: string;
  /** Raw message text from the customer */
  message: string;
  /** Existing DB row — null if first message or session expired */
  conversation: WhatsAppConversation | null;
}

// ─── Action Result ────────────────────────────────────────────────────────────

/**
 * What a handler returns after processing an intent.
 */
export interface ActionResult {
  /** Text to send back to the customer via WhatsApp */
  reply: string;
  /** New state to persist — omit to keep current state */
  newState?: ConversationState;
  /** Updated cart contents — omit to keep existing cart */
  updatedCartItems?: CartItem[];
  /** When true, conversation-store marks session as escalated */
  shouldEscalate?: boolean;
}

// ─── Handler Map ──────────────────────────────────────────────────────────────

/**
 * A handler processes a classified intent given its context.
 * All handlers must be async and must NOT throw — return ActionResult with
 * a friendly error reply on failure.
 */
export type HandlerFn = (
  ctx: ConversationContext,
  classification: Classification,
) => Promise<ActionResult>;

// ─── Concierge Response ───────────────────────────────────────────────────────

/**
 * Final output of the concierge engine — sent back to the webhook caller.
 */
export interface ConciergeResponse {
  reply: string;
  /** New state after processing */
  state: ConversationState;
  /** Whether the session was escalated to a human agent */
  escalated: boolean;
}
