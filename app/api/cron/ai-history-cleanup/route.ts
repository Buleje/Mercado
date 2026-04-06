export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/ai-history-cleanup
 *
 * Deletes AI conversation history older than 90 days.
 * Like cleaning out old documents from the filing cabinet every quarter.
 *
 * This prevents the database from growing unbounded with old AI chat logs.
 * Messages are deleted via cascade when the conversation is deleted.
 *
 * Authorization: Bearer <CRON_SECRET>
 * Schedule: weekly → "0 3 * * 0" (every Sunday at 3 AM)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const RETENTION_DAYS = 90;

  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // First delete orphaned messages from old conversations
    const deletedMessages = await prisma.aIMessage.deleteMany({
      where: {
        conversation: { updatedAt: { lt: cutoff } },
      },
    });

    // Then delete the old conversations themselves
    const deletedConversations = await prisma.aIConversation.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });

    logger.info("[ai-cleanup] Old AI conversations cleaned up", {
      cutoffDate: cutoff.toISOString(),
      retentionDays: RETENTION_DAYS,
      conversationsDeleted: deletedConversations.count,
      messagesDeleted: deletedMessages.count,
    });

    return NextResponse.json({
      ok: true,
      retentionDays: RETENTION_DAYS,
      conversationsDeleted: deletedConversations.count,
      messagesDeleted: deletedMessages.count,
      cutoffDate: cutoff.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[ai-cleanup] Failed to clean AI history", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
