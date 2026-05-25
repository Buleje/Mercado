import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AiAssistantFeedbackDB } from "@/lib/db/ai-assistant-feedback.db";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const FeedbackSchema = z.object({
  messageId: z.string().min(1),
  feedback: z.enum(["up", "down"]),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/ai-assistant/feedback
 * Record user feedback (👍/👎) for an AI message.
 */
export async function POST(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "MODERATE", "ai-assistant-feedback"); if (_rl) return _rl;
    const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = FeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }

    // Audit project-wide 2026-05-19: migrado a AiAssistantFeedbackDB.
    const message = await AiAssistantFeedbackDB.findMessageWithConversation(parsed.data.messageId);

    if (!message || message.conversation.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
    }

    const updated = await AiAssistantFeedbackDB.updateMessageFeedback(parsed.data.messageId, {
      feedback: parsed.data.feedback,
      feedbackNote: parsed.data.note ?? null,
    });

    logActivity(
      "ai_feedback",
      "ai-message",
      `${parsed.data.feedback === "up" ? "👍" : "👎"} feedback on AI message`,
      parsed.data.messageId,
      auth.username
    ).catch(() => {
        /* fire-and-forget per CLAUDE.md rule #7 */
      });

    return NextResponse.json({ data: { id: updated.id, feedback: updated.feedback } });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/ai-assistant/feedback
 * Get feedback stats — useful for monitoring AI quality.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const [total, thumbsUp, thumbsDown, recentBad] = await Promise.all([
      AiAssistantFeedbackDB.countFeedback(auth.tenantId, "any"),
      AiAssistantFeedbackDB.countFeedback(auth.tenantId, "up"),
      AiAssistantFeedbackDB.countFeedback(auth.tenantId, "down"),
      AiAssistantFeedbackDB.listRecentNegative(auth.tenantId, 10),
    ]);

    return NextResponse.json({
      data: {
        total,
        thumbsUp,
        thumbsDown,
        satisfactionRate: total > 0 ? Math.round((thumbsUp / total) * 100) : null,
        recentNegative: recentBad,
      },
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
