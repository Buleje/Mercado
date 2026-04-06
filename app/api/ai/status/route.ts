export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAIStatus } from "@/lib/ai-config";

/**
 * GET /api/ai/status
 * Public endpoint — returns which AI providers are configured.
 * Used by LiveChatWidget to show "IA conectada" or "IA no configurada".
 */
export async function GET() {
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
}
