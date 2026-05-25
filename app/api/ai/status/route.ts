import { NextResponse } from "next/server";
import { getAIStatus } from "@/lib/ai-config";
import { logger } from "@/lib/logger";

/**
 * GET /api/ai/status
 * Public endpoint — returns which AI providers are configured.
 * Used by LiveChatWidget to show "IA conectada" or "IA no configurada".
 */
export async function GET() {
  try {
    const status = getAIStatus();

    return NextResponse.json({
      activeProvider: status.activeProvider,
      activeProviderName: status.activeProviderName,
      hasAI: status.hasAnyProvider,
      providers: status.providers.map(p => ({
        id: p.id,
        name: p.name,
        configured: p.configured,
      })),
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
