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
  | "awaiting_payment_capture" // multi-vendor: esperando foto Yape del cliente
  | "completed";

// ─── Cart ─────────────────────────────────────────────────────────────────────

/**
 * A single modifier selection (e.g. "Sin crema", "Extra queso").
 * Mirrors the modifier shape used in CheckoutModal — added here for
 * WhatsApp concierge multi-vendor support.
 */
export interface SelectedModifier {
  modifierGroupId: string;
  modifierGroupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number; // 0 if no extra charge
}

export interface CartItem {
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
  // ── Multi-vendor fields (added for multi-vendor checkout support) ──────────
  // Optional during transition: legacy single-tenant handlers (cart-add,
  // order-status) don't yet populate these. Multi-vendor checkout requires
  // them — see multi-vendor-checkout.ts for the runtime contract.
  /** tenantId of the store this product belongs to */
  storeId?: string;
  /** Human-readable slug used to identify the store (e.g. "bodega-san-martin") */
  storeSlug?: string;
  /** Display name of the store shown to the customer */
  storeName?: string;
  /** SHA-256 hash of serialized modifiers — used for idempotency dedup */
  modifierHash?: string;
  /** Selected modifier options (cremas, variaciones, toppings, etc.) */
  modifiers?: SelectedModifier[];
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
