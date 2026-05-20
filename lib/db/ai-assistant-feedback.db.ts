import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AiAssistantFeedbackDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/ai-assistant/feedback.
 * 5 queries de feedback (verify + update + 4 stats).
 * Multi-tenant guard: conversation.tenantId nested (aIMessage no tiene tenantId).
 */

export const AiAssistantFeedbackDB = {
  async findMessageWithConversation(messageId: string) {
    return prisma.aIMessage.findFirst({
      where: { id: messageId },
      include: { conversation: { select: { tenantId: true, user: true } } },
    });
  },

  async updateMessageFeedback(
    messageId: string,
    data: { feedback: string; feedbackNote: string | null },
  ) {
    return prisma.aIMessage.update({
      where: { id: messageId },
      data,
    });
  },

  async countFeedback(tenantId: string, feedback?: "up" | "down" | "any") {
    const feedbackClause =
      feedback === "any" ? { not: null } : feedback ?? undefined;
    return prisma.aIMessage.count({
      where: {
        conversation: { tenantId },
        role: "assistant",
        ...(feedbackClause !== undefined && { feedback: feedbackClause }),
      },
    });
  },

  async listRecentNegative(tenantId: string, take = 10) {
    return prisma.aIMessage.findMany({
      where: {
        conversation: { tenantId },
        role: "assistant",
        feedback: "down",
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        content: true,
        feedbackNote: true,
        createdAt: true,
      },
    });
  },
};
