import "server-only";
import { logger } from "@/lib/logger";
import { DOC_CATEGORIES } from "@/lib/types/documents";
import { fetchGroqWithRetry } from "@/lib/groq-fetch";

/** Modelo de visión Groq (multimodal). Mismo que el tier "premium" del router. */
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

/**
 * ADR-119 — Escáner de documentos desde cámara móvil.
 *
 * Recibe la URL firmada de una foto subida y usa visión (gpt-4o-mini) para
 * extraer de un vistazo: un nombre legible, categoría, tags, texto OCR y —lo
 * más valioso— la fecha de vencimiento si el documento la tiene (licencias,
 * certificados, contratos). Así el celular se vuelve un escáner que además
 * arma solo el recordatorio de vencimiento.
 *
 * Best-effort: si no hay API key o falla, devuelve ok:false y el caller deja
 * el documento con el nombre original (la subida nunca se pierde).
 */
export interface ScanResult {
  ok: boolean;
  suggestedName?: string;
  category?: string;
  tags?: string[];
  /** ISO date o null. La fecha de vencimiento detectada en el documento. */
  expiresAt?: string | null;
  ocrText?: string;
  error?: string;
}

const PROMPT = `Eres un asistente que analiza fotos de documentos de una bodega/empresa peruana (licencia de funcionamiento, certificado DIGESA, contrato, factura/boleta, recibo, DNI, etc.).
Devuelve SOLO un JSON valido:
{
  "suggestedName": "Nombre corto y claro del documento",
  "category": "<una de: ${DOC_CATEGORIES.join("|")}>",
  "tags": ["tag1","tag2"],
  "expiresAt": "YYYY-MM-DD o null si no vence o no es visible",
  "ocrText": "todo el texto legible del documento"
}
Reglas: tags en minuscula sin tildes (max 5). Si ves una fecha de vencimiento/caducidad/"valido hasta", ponla en expiresAt. No pongas texto fuera del JSON.`;

export async function scanDocument(imageUrl: string): Promise<ScanResult> {
  const apiKey = process.env.GROQ_API_KEY;
  const hasGateway = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey && !hasGateway) {
    return { ok: false, error: "scan deshabilitado — falta GROQ_API_KEY o AI_GATEWAY" };
  }
  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
    return { ok: false, error: "imageUrl invalida" };
  }

  try {
    // Visión vía infra LLM del proyecto (Gateway / Groq directo). Llama-4-Scout
    // es multimodal y acepta image_url en el payload OpenAI-compatible.
    const resp = await fetchGroqWithRetry(
      apiKey ?? "",
      {
        model: GROQ_VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 1200,
        temperature: 0.1,
      },
      "doc-scan"
    );

    if (!resp.ok || !resp.data) return { ok: false, error: resp.error ?? "vision call failed" };

    const payload = resp.data as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "no JSON in response" };

    const parsed = JSON.parse(match[0]) as Partial<ScanResult>;

    let expiresAt: string | null = null;
    if (typeof parsed.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(parsed.expiresAt)) {
      const d = new Date(parsed.expiresAt);
      if (!Number.isNaN(d.getTime())) expiresAt = d.toISOString();
    }

    const category =
      typeof parsed.category === "string" && DOC_CATEGORIES.includes(parsed.category as never)
        ? parsed.category
        : "otros";

    return {
      ok: true,
      suggestedName: typeof parsed.suggestedName === "string" ? parsed.suggestedName.slice(0, 120) : undefined,
      category,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()).slice(0, 5)
        : [],
      expiresAt,
      ocrText: typeof parsed.ocrText === "string" ? parsed.ocrText.slice(0, 20000) : undefined,
    };
  } catch (err) {
    logger.error("[scan-document] failed", { err: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
