import "server-only";
import { logger } from "@/lib/logger";
import { formatHumanHandoff } from "../../message-templates";
import type { ConversationContext, ActionResult, Classification } from "../types";

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Escalates the conversation to a human agent.
 * 1. Sends the customer a hold message.
 * 2. Fire-and-forget: notifies staff phone if WHATSAPP_STAFF_PHONE is set.
 * If WHATSAPP_STAFF_PHONE is not configured, escalation is silent (only
 * the customer reply is sent).
 */
export async function humanEscalationHandler(
  ctx: ConversationContext,
  _classification: Classification,
): Promise<ActionResult> {
  const staffPhone = process.env.WHATSAPP_STAFF_PHONE;

  if (staffPhone) {
    // Fire-and-forget — non-critical notification (CLAUDE.md rule #7)
    notifyStaff(staffPhone, ctx.phone, ctx.message).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
  }

  return {
    reply: formatHumanHandoff("Buleje"),
    newState: "idle",
    shouldEscalate: true,
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function notifyStaff(
  staffPhone: string,
  customerPhone: string,
  lastMessage: string,
): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!accessToken || !phoneId) {
    logger.warn("[human-escalation] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_ID not set — staff notification skipped");
    return;
  }

  const body = {
    messaging_product: "whatsapp",
    to: staffPhone,
    type: "text",
    text: {
      body:
        `🚨 *Escalada a humano*\n` +
        `Cliente: ${customerPhone}\n` +
        `Último mensaje: "${lastMessage.slice(0, 100)}"\n\n` +
        `Atiéndele directamente por WhatsApp.`,
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    logger.warn("[human-escalation] staff notification failed", {
      status: res.status,
    });
  }
}
