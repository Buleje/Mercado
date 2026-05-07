import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limit";

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
  const _rl = await applyRateLimit(req, "MODERATE", "ai-assistant-feedback"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  // Verify message exists and belongs to user's tenant
  const message = await prisma.aIMessage.findFirst({
    where: { id: parsed.data.messageId },
    include: { conversation: { select: { tenantId: true, user: true } } },
  });

  if (!message || message.conversation.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
  }

  const updated = await prisma.aIMessage.update({
    where: { id: parsed.data.messageId },
    data: {
      feedback: parsed.data.feedback,
      feedbackNote: parsed.data.note ?? null,
    },
  });

  logActivity(
    "ai_feedback",
    "ai-message",
    `${parsed.data.feedback === "up" ? "👍" : "👎"} feedback on AI message`,
    parsed.data.messageId,
    auth.username
  ).catch(() => {});

  return NextResponse.json({ data: { id: updated.id, feedback: updated.feedback } });
}

/**
 * GET /api/ai-assistant/feedback
 * Get feedback stats — useful for monitoring AI quality.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const [total, thumbsUp, thumbsDown, recentBad] = await Promise.all([
    prisma.aIMessage.count({
      where: {
        conversation: { tenantId: auth.tenantId },
        role: "assistant",
        feedback: { not: null },
      },
    }),
    prisma.aIMessage.count({
      where: {
        conversation: { tenantId: auth.tenantId },
        role: "assistant",
        feedback: "up",
      },
    }),
    prisma.aIMessage.count({
      where: {
        conversation: { tenantId: auth.tenantId },
        role: "assistant",
        feedback: "down",
      },
    }),
    prisma.aIMessage.findMany({
      where: {
        conversation: { tenantId: auth.tenantId },
        role: "assistant",
        feedback: "down",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        content: true,
        feedbackNote: true,
        createdAt: true,
      },
    }),
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
}
