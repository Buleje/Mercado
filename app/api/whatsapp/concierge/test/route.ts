import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleIncomingMessage } from "@/lib/whatsapp/concierge/concierge-router";
import { getActiveProvider } from "@/lib/ai/provider";
import { applyRateLimit } from "@/lib/rate-limit";

// Next 16 cacheComponents-compatible: handler es dinámico por naturaleza.

// Dev-only test endpoint: invokes the concierge engine directly without
// going through Meta's webhook. Returns the AI reply as JSON so you can
// iterate on prompts and flows from the terminal with curl.
//
// Disabled in production (NODE_ENV=production) — returns 404 to keep the
// surface area minimal.

const BodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  phone: z.string().min(8),
  message: z.string().min(1).max(500),
});

// Hardened (audit 2026-05-02 #5): production NEVER enables this endpoint.
// The previous OR-form let WHATSAPP_CONCIERGE_TEST=1 reactivate it in prod
// — too easy to leak via env-typo or copy-paste from staging. If you really
// need to debug a live deploy, hit the staging URL or use Vercel preview.
function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function GET() {
  if (!isDev()) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    activeProvider: getActiveProvider(),
    aiKeySet:
      Boolean(process.env.ANTHROPIC_API_KEY) ||
      Boolean(process.env.GROQ_API_KEY) ||
      Boolean(process.env.OPENAI_API_KEY),
    hint:
      "POST { tenantId?, phone, message } to simulate a WhatsApp message. " +
      "Without an AI key, classifier returns 'desconocido' → welcome menu.",
  });
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "whatsapp-concierge-test"); if (_rl) return _rl;
  if (!isDev()) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    );
  }

  const { tenantId = "main", phone, message } = parsed.data;
  const cleanPhone = phone.replace(/\D/g, "");

  try {
    const response = await handleIncomingMessage(tenantId, cleanPhone, message);
    return NextResponse.json({
      ok: true,
      activeProvider: getActiveProvider(),
      tenantId,
      phone: cleanPhone,
      message,
      response,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
