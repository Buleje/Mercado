import "server-only";

// Import ADR-043 classifier WITHOUT modifying the file (ADR-046 constraint)
import { classifyWhatsappIntent, shouldTrustAi } from "../ai-intent";
import { formatWelcomeMenu } from "../message-templates";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

import {
  getConversation,
  upsertConversation,
  extractState,
  extractCartItems,
} from "./conversation-store";
import { dispatch } from "./state-machine";
import { buildConciergeResponse } from "./response-formatter";
import type { ConversationContext, ConciergeResponse } from "./types";

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * handleIncomingMessage — the single entry point for the concierge engine.
 *
 * Flow:
 *  1. Load conversation context from DB (null = first message or expired)
 *  2. Classify message with AI (ADR-043)
 *  3. If confidence < 0.6 → fallback to welcome menu without state change
 *  4. Dispatch to handler via state machine
 *  5. Persist new state + cart
 *  6. Fire-and-forget audit log
 *  7. Return formatted response
 *
 * Never throws — all errors produce a friendly reply.
 */
export async function handleIncomingMessage(
  tenantId: string,
  phone: string,
  message: string,
): Promise<ConciergeResponse> {
  // ── Guard: message too long (test case #11) ──────────────────────────────
  if (message.trim().length > 500) {
    return {
      reply:
        "Tu mensaje es muy largo. Por favor escribe en frases cortas, por ejemplo:\n" +
        "_\"Quiero 2 kg de arroz\"_ o _\"Cuánto cuesta la leche\"_",
      state: "idle",
      escalated: false,
    };
  }

  // ── Load conversation ────────────────────────────────────────────────────
  const conversation = await getConversation(tenantId, phone);
  const currentState = extractState(conversation);

  // ── Classify with AI ─────────────────────────────────────────────────────
  let classification = await classifyWhatsappIntent(message);

  // If AI returns low confidence → fallback to welcome menu (test case #13)
  if (!shouldTrustAi(classification)) {
    classification = { intent: "desconocido", confidence: 0 };
  }

  // ── Build context ────────────────────────────────────────────────────────
  const ctx: ConversationContext = {
    tenantId,
    phone,
    message,
    conversation,
  };

  // ── Dispatch to state machine ────────────────────────────────────────────
  let result;
  try {
    result = await dispatch(ctx, classification);
  } catch (err) {
    logger.error("[concierge-router] dispatch crashed", {
      tenantId,
      phone,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      reply:
        "Lo siento, ocurrió un error. Escribe *hola* para volver al menú o espera un momento.",
      state: currentState,
      escalated: false,
    };
  }

  // ── Persist updated state ────────────────────────────────────────────────
  const newState = result.newState ?? currentState;
  const newCart = result.updatedCartItems ?? extractCartItems(conversation);

  await upsertConversation(tenantId, phone, newState, newCart);

  // ── Fire-and-forget audit log (CLAUDE.md rule #7) ────────────────────────
  logActivity(
    "whatsapp.message",
    "WhatsAppConversation",
    JSON.stringify({ intent: classification.intent, state: newState, reply: result.reply.slice(0, 80) }),
    phone,
    phone,
    undefined,
    tenantId,
  ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

  // ── Build and return response ────────────────────────────────────────────
  return buildConciergeResponse(result, currentState);
}
