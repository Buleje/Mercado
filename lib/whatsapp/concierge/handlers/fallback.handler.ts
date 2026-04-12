import "server-only";
import { formatWelcomeMenu } from "../../message-templates";
import type { ConversationContext, ActionResult, Classification } from "../types";
import { extractState } from "../conversation-store";

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Handles "desconocido" intent or any case where AI confidence is too low.
 * Returns the welcome menu without changing the current state.
 * This preserves any ongoing cart/checkout session.
 */
export async function fallbackHandler(
  ctx: ConversationContext,
  _classification: Classification,
): Promise<ActionResult> {
  const currentState = extractState(ctx.conversation);

  return {
    reply: formatWelcomeMenu("Buleje"),
    newState: currentState, // preserve current state — don't reset an active session
  };
}
