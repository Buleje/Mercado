import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHmac } from "crypto";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { timingSafeCompare } from "@/lib/timing-safe";
import { transcribeAudio } from "@/lib/voice/transcribe";
import { extractOrderFromText } from "@/lib/voice/order-extractor";
import {
  buildConfirmationMessage,
  buildFallbackMessage,
} from "@/lib/voice/response-builder";
import { aiCostGuard } from "@/lib/ai/cost-control";

// ── Request schema ─────────────────────────────────────────────────────────────

const VoiceRequestSchema = z.object({
  tenantId: z.string().min(1),
  from: z.string().min(1),
  mediaId: z.string().min(1),
  mimeType: z.string().optional(),
  storeName: z.string().optional(),
  /**
   * Catálogo opcional para match. Si no se pasa, todos los items quedan en
   * unresolved (el webhook caller puede enriquecerlo desde su BD).
   */
  productCatalog: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .optional(),
});

export type VoiceRequest = z.infer<typeof VoiceRequestSchema>;

export interface VoiceResponse {
  transcription: string;
  reply: string;
  draft: {
    intent: string;
    itemsResolved: number;
    itemsUnresolved: number;
  };
}

// ── POST /api/whatsapp/voice ───────────────────────────────────────────────────

/**
 * Endpoint llamado desde el webhook principal cuando detecta un mensaje de audio.
 * Pipeline:
 *   1. Transcribe audio (Groq Whisper large-v3)
 *   2. Extrae items de pedido (Groq LLM llama-3.3-70b)
 *   3. Construye mensaje de confirmación
 *   4. Retorna texto para que el webhook lo envíe al cliente
 *
 * NO modifica schema.prisma, orders.db.ts ni el webhook existente.
 * Solo devuelve el draft al caller — la persistencia es responsabilidad del caller.
 *
 * ADR relacionado: ADR-046 (WhatsApp Concierge)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // SECURITY 2026-05-07 (CRM-SEC F3): rate-limit STRICT — audio Groq Whisper
  // es costoso. Sin esto cualquiera puede inflar la factura llamando en loop.
  const rl = applyRateLimit(req, "STRICT", "whatsapp-voice");
  if (rl) return rl as unknown as NextResponse;

  // Validar firma HMAC interna: solo el webhook whatsapp propio puede llamar
  // este endpoint. Header X-Internal-Signature = HMAC-SHA256(body, INTERNAL_WEBHOOK_SECRET).
  // F7: usar INTERNAL_WEBHOOK_SECRET separado; fallback a CRON_SECRET con warning.
  const rawBody = await req.text();
  const internalSecret =
    process.env.INTERNAL_WEBHOOK_SECRET ||
    (() => {
      if (process.env.CRON_SECRET) {
        logger.warn(
          "[whatsapp/voice] INTERNAL_WEBHOOK_SECRET no definido — usando CRON_SECRET como fallback. " +
          "Configura INTERNAL_WEBHOOK_SECRET para separar secrets por responsabilidad.",
        );
      }
      return process.env.CRON_SECRET;
    })();
  if (internalSecret) {
    const signature = req.headers.get("x-internal-signature") ?? "";
    const expected = createHmac("sha256", internalSecret)
      .update(rawBody)
      .digest("hex");
    if (!timingSafeCompare(signature, expected)) {
      logger.warn("[whatsapp/voice] firma interna inválida o ausente", {
        hasHeader: Boolean(signature),
      });
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = VoiceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", issues: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }

  const { tenantId, from, mediaId, mimeType, storeName, productCatalog } =
    parsed.data;

  const effectiveStoreName = storeName ?? "Bodega";

  logger.info("[whatsapp/voice] Iniciando pipeline de voz", {
    tenantId,
    from: from.slice(-4), // solo últimos 4 dígitos por privacidad
    mediaId,
  });

  // ── 1. Transcripción ─────────────────────────────────────────────────────────
  // F1 AI-COST: Whisper ~$0.006/min → cap por tenant antes de llamar
  const VOICE_COST_USD = 0.01;
  if (!await aiCostGuard.canSpend(tenantId, VOICE_COST_USD)) {
    return NextResponse.json(
      { error: "Cuota mensual de transcripción de audio agotada" },
      { status: 429 },
    );
  }

  let transcription: string;
  try {
    transcription = await transcribeAudio(mediaId, mimeType);
    aiCostGuard.recordSpend(tenantId, VOICE_COST_USD);
  } catch (err) {
    logger.error("[whatsapp/voice] Error en transcripción", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json<VoiceResponse>({
      transcription: "",
      reply: buildFallbackMessage(effectiveStoreName),
      draft: { intent: "unknown", itemsResolved: 0, itemsUnresolved: 0 },
    });
  }

  if (!transcription.trim()) {
    logger.info("[whatsapp/voice] Transcripción vacía", { tenantId });
    return NextResponse.json<VoiceResponse>({
      transcription: "",
      reply: buildFallbackMessage(effectiveStoreName),
      draft: { intent: "unknown", itemsResolved: 0, itemsUnresolved: 0 },
    });
  }

  logger.info("[whatsapp/voice] Transcripción obtenida", {
    tenantId,
    chars: transcription.length,
    preview: transcription.slice(0, 80),
  });

  // ── 2. Extracción de intent + items ──────────────────────────────────────────
  // F1 AI-COST: LLM extracción ~$0.005 → guard antes de llamar
  const LLM_COST_USD = 0.005;
  if (!await aiCostGuard.canSpend(tenantId, LLM_COST_USD)) {
    return NextResponse.json(
      { error: "Cuota mensual de análisis de pedido agotada" },
      { status: 429 },
    );
  }

  let draft;
  try {
    draft = await extractOrderFromText(
      transcription,
      tenantId,
      productCatalog,
    );
    aiCostGuard.recordSpend(tenantId, LLM_COST_USD);
  } catch (err) {
    logger.error("[whatsapp/voice] Error en extracción", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json<VoiceResponse>({
      transcription,
      reply: buildFallbackMessage(effectiveStoreName),
      draft: { intent: "unknown", itemsResolved: 0, itemsUnresolved: 0 },
    });
  }

  // ── 3. Construir respuesta ────────────────────────────────────────────────────
  const hasItems = draft.items.length > 0 || draft.unresolved.length > 0;

  let reply: string;
  if (!hasItems || draft.intent === "unknown") {
    reply = buildFallbackMessage(effectiveStoreName);
  } else {
    reply = buildConfirmationMessage(draft, effectiveStoreName);
  }

  // ── Audit log — fire-and-forget (CLAUDE.md regla #7) ────────────────────────
  logVoiceActivity(tenantId, from, transcription, draft.intent).catch((err) => logger.warn("[crm-sec] op failed", { err: String(err) }));

  logger.info("[whatsapp/voice] Pipeline completado", {
    tenantId,
    intent: draft.intent,
    itemsResolved: draft.items.length,
    itemsUnresolved: draft.unresolved.length,
  });

  return NextResponse.json<VoiceResponse>({
    transcription,
    reply,
    draft: {
      intent: draft.intent,
      itemsResolved: draft.items.length,
      itemsUnresolved: draft.unresolved.length,
    },
  });
}

// ── Audit log helper ──────────────────────────────────────────────────────────

async function logVoiceActivity(
  tenantId: string,
  from: string,
  transcription: string,
  intent: string,
): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    await (
      prisma as unknown as {
        activityLog: {
          create: (args: unknown) => Promise<unknown>;
        };
      }
    ).activityLog.create({
      data: {
        tenantId,
        action: "whatsapp_voice_order",
        entityType: "whatsapp_message",
        entityId: from,
        metadata: {
          intent,
          transcriptionLength: transcription.length,
          from: from.slice(-4),
        },
      },
    });
  } catch {
    // Silencioso — log no es crítico
  }
}
