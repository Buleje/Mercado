/**
 * lib/ai/yape-vision.ts
 *
 * Extrae monto/código/fecha/last4 de una captura de Yape usando
 * Claude Sonnet 4.6 Vision (claude-sonnet-4-6).
 *
 * Diseño:
 *  - Recibe un `imageUrl` (público o pre-firmado) y deja que el SDK lo
 *    descargue como parte multimodal (`type: "image"`).
 *  - Pide al modelo SOLO JSON estricto. Validamos con Zod safeParse.
 *  - Cualquier fallo (red, JSON malformado, no-Yape, ilegible) →
 *    `confidence: "low"` con `detectedAmount: null` y un visionResponse
 *    que contiene la razón. Nunca lanza.
 *  - Cost-tracking via `aiCostGuard` (lib/ai/cost-control.ts). El
 *    pipeline Yape NO está atado a un tenant (PaymentApproval es
 *    global) → usamos el bucket sintético `__yape_vision__`.
 *
 * Costo estimado por llamada (Sonnet 4.6 Vision):
 *   ~1.5K input tokens (imagen + prompt) + ~150 output tokens
 *   ≈ $0.0050 / captura. Budget bucket: 200 capturas/día = $1/día.
 */

import "server-only";
import { generateText } from "ai";
import { z } from "zod";
import { anthropicProvider } from "@/lib/ai/provider";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface YapeVisionResult {
  detectedAmount: number | null;
  yapeOpCode: string | null;
  yapeLast4: string | null;
  yapeDate: Date | null;
  confidence: "high" | "medium" | "low";
  visionResponse: Record<string, unknown>;
}

/**
 * Input puede ser:
 *  - URL pública (la subimos a Anthropic como referencia URL)
 *  - Buffer/Uint8Array (capturas de Twilio o Meta que requieren auth header
 *    y por eso bajamos antes de pasar a Vision)
 *  - data: URL string
 */
export type YapeVisionInput =
  | string
  | URL
  | Uint8Array
  | ArrayBuffer
  | Buffer;

// Costo aproximado de una llamada Vision (USD). Sub-estimación
// conservadora: si el cost real es mayor, recordSpend lo refleja.
const COST_PER_CALL_USD = 0.005;

// Bucket sintético global (PaymentApproval no es por-tenant).
const COST_BUCKET = "__yape_vision__";

// ─── Zod schema para output del modelo ────────────────────────────────────────

const YapeJsonSchema = z
  .object({
    isYape: z.boolean().optional(),
    monto: z.union([z.number(), z.string()]).nullable().optional(),
    codigoOperacion: z.union([z.string(), z.number()]).nullable().optional(),
    last4: z.union([z.string(), z.number()]).nullable().optional(),
    fecha: z.string().nullable().optional(),
    confianza: z.enum(["high", "medium", "low"]).optional(),
    razon: z.string().optional(),
  })
  .passthrough();

type YapeJson = z.infer<typeof YapeJsonSchema>;

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un validador de capturas de Yape (app peruana de pagos móviles).
Tu tarea: extraer datos clave de la imagen y responder SOLO en JSON.

Campos a extraer:
- monto (número, en soles peruanos S/, ej. 12.50)
- codigoOperacion (string, suele tener 6-9 dígitos, a veces aparece como "Cód. de operación" o "N° de operación")
- last4 (string, últimos 4 dígitos del número de celular del destinatario, suele estar enmascarado como "***1234")
- fecha (string, formato ISO 8601 si es posible, o tal cual aparece)
- confianza ("high" | "medium" | "low") según legibilidad
- razon (opcional, breve, si confianza es low)

Si la imagen NO es de Yape (otra app, screenshot diferente, o ilegible):
{"isYape": false, "razon": "<motivo>"}

Si es Yape pero algún campo no se puede leer, devuelve null en ese campo.

Responde EXCLUSIVAMENTE con un objeto JSON válido. Nada de texto antes o después.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJsonObject(raw: string): unknown | null {
  // Remueve fences ```json ... ``` y busca el primer { ... } balanceado
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // "S/ 12.50" → 12.50
    const cleaned = v.replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toLast4(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\D/g, "");
  return s.length >= 4 ? s.slice(-4) : null;
}

function toOpCode(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\D/g, "");
  return s.length >= 6 ? s : null;
}

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

function lowConfidenceResult(reason: string, raw: unknown): YapeVisionResult {
  return {
    detectedAmount: null,
    yapeOpCode: null,
    yapeLast4: null,
    yapeDate: null,
    confidence: "low",
    visionResponse: {
      ok: false,
      reason,
      raw: raw ?? null,
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

function toVisionImage(input: YapeVisionInput): URL | Uint8Array {
  if (input instanceof URL) return input;
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  // string: puede ser URL absoluta o data: URL
  if (typeof input === "string") {
    if (input.startsWith("data:") || input.startsWith("http")) {
      return new URL(input);
    }
    return new URL(input);
  }
  // Fallback (no debería llegar aquí en TS strict)
  throw new Error("[yape-vision] tipo de imagen no soportado");
}

export async function extractYapePayment(
  imageUrl: YapeVisionInput,
): Promise<YapeVisionResult> {
  // Cost-control: presupuesto global del pipeline Yape
  if (!await aiCostGuard.canSpend(COST_BUCKET, COST_PER_CALL_USD, "business")) {
    logger.warn("[yape-vision] presupuesto agotado, rechazando llamada");
    return lowConfidenceResult("ai-budget-exhausted", null);
  }

  const startedAt = Date.now();
  let rawText = "";
  const visionImage = toVisionImage(imageUrl);

  // SECURITY/RELIABILITY 2026-05-06 (audit AI #10): retry con backoff para
  // errores transitorios 429/5xx. Antes un 429 transitorio devolvía
  // confidence:low y el cliente reenviaba la captura → 2× costo Anthropic.
  async function callVisionOnce(): Promise<string> {
    const { text } = await generateText({
      model: anthropicProvider("claude-sonnet-4-6"),
      maxOutputTokens: 400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analiza esta captura de Yape y devuelve el JSON." },
            { type: "image", image: visionImage },
          ],
        },
      ],
    });
    return text;
  }

  function isRetryable(err: unknown): boolean {
    const e = err as { statusCode?: number; status?: number; message?: string };
    const code = e?.statusCode ?? e?.status ?? 0;
    if (code === 429) return true;
    if (code >= 500 && code < 600) return true;
    if ((e?.message ?? "").toLowerCase().includes("timeout")) return true;
    return false;
  }

  try {
    let attempt = 0;
    while (true) {
      try {
        rawText = await callVisionOnce();
        break;
      } catch (err) {
        attempt++;
        if (attempt >= 2 || !isRetryable(err)) throw err;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    aiCostGuard.recordSpend(COST_BUCKET, COST_PER_CALL_USD);
  } catch (err) {
    logger.error("[yape-vision] modelo falló", {
      error: err instanceof Error ? err.message : String(err),
      imagePreview:
        typeof imageUrl === "string"
          ? imageUrl.slice(0, 80)
          : imageUrl instanceof URL
            ? imageUrl.toString().slice(0, 80)
            : "<binary>",
    });
    return lowConfidenceResult("model-call-failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Parse JSON
  const obj = extractJsonObject(rawText);
  if (!obj) {
    logger.warn("[yape-vision] sin JSON válido en respuesta", {
      preview: rawText.slice(0, 120),
    });
    return lowConfidenceResult("no-json-in-response", { rawText });
  }

  const parsed = YapeJsonSchema.safeParse(obj);
  if (!parsed.success) {
    logger.warn("[yape-vision] schema mismatch", {
      issues: parsed.error.issues.slice(0, 3),
    });
    return lowConfidenceResult("schema-mismatch", obj as Record<string, unknown>);
  }

  const data: YapeJson = parsed.data;

  // No es Yape → marcar low explícito
  if (data.isYape === false) {
    return {
      detectedAmount: null,
      yapeOpCode: null,
      yapeLast4: null,
      yapeDate: null,
      confidence: "low",
      visionResponse: {
        ok: true,
        isYape: false,
        reason: data.razon ?? "modelo determinó que no es Yape",
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  const detectedAmount = toNumber(data.monto);
  const yapeOpCode = toOpCode(data.codigoOperacion);
  const yapeLast4 = toLast4(data.last4);
  const yapeDate = toDate(data.fecha);

  // Heurística de confianza: high si todos los campos críticos llegaron
  let confidence: "high" | "medium" | "low" =
    data.confianza ?? "medium";
  if (confidence === "high" && (detectedAmount == null || yapeOpCode == null)) {
    confidence = "medium";
  }
  if (detectedAmount == null && yapeOpCode == null) {
    confidence = "low";
  }

  return {
    detectedAmount,
    yapeOpCode,
    yapeLast4,
    yapeDate,
    confidence,
    visionResponse: {
      ok: true,
      isYape: true,
      raw: data,
      latencyMs: Date.now() - startedAt,
      costEstimateUsd: COST_PER_CALL_USD,
    },
  };
}
