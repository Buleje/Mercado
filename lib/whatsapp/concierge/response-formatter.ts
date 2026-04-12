import "server-only";
// response-formatter.ts — thin adapter between ActionResult and the wire format
// Imports message-templates.ts WITHOUT modifying it (ADR-046 constraint).

export { formatError, formatWelcomeMenu } from "../message-templates";

import type { ActionResult, ConciergeResponse, ConversationState } from "./types";

/**
 * Converts an ActionResult from a handler into the final ConciergeResponse
 * that the engine returns to the webhook caller.
 */
export function buildConciergeResponse(
  result: ActionResult,
  currentState: ConversationState,
): ConciergeResponse {
  return {
    reply: result.reply,
    state: result.newState ?? currentState,
    escalated: result.shouldEscalate ?? false,
  };
}
