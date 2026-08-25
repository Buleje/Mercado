import "server-only";
import { z } from "zod";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
import { safeParseJSON } from "@/lib/ai-json-parser";
import { logger } from "@/lib/logger";

/**
 * lib/ai/vision-extract.ts — extracción estructurada desde una foto (OCR de
 * planillas manuscritas, boletas, guías). Único lugar que arma el fetch a
 * Vision: antes de este helper, cada ruta OCR (`gtf-ocr`, `ocr/invoice`)
 * repetía el mismo fetch OpenAI→Anthropic con fallback y JSON Schema a mano.
 * Mismo patrón que esas dos, factorizado porque acá se agregan DOS rutas más
 * en el mismo commit (cubicación aserrada + trozas) — tres copias es debt,
 * no estilo.
 *
 * Sigue el mismo orden de proveedor (OpenAI si hay key, si no Anthropic) para
 * no romper el comportamiento que ya conocen esas rutas hermanas.
 */

export interface VisionExtractParams<T> {
  /** Base64 crudo o data URL (`data:image/...;base64,...`). */
  imageBase64: string;
  /** Instrucción de qué extraer — específica del dominio (GTF, factura, planilla). */
  prompt: string;
  /** Schema Zod para validar/tipar la respuesta ya parseada. */
  schema: z.ZodType<T>;
  /** JSON Schema equivalente — Anthropic no lee Zod, necesita el `output_config.format`. */
  jsonSchema: Record<string, unknown>;
  /** Tope de tokens de la respuesta. Planillas con muchas filas necesitan más que un dato suelto. */
  maxTokens?: number;
  /** Prefijo de log (ej. "[cubicacion-ocr:trozas]") para poder rastrear cuál ruta falló. */
  logTag: string;
}

export type VisionExtractResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; raw?: string };

export async function visionExtractJSON<T>(
  params: VisionExtractParams<T>,
): Promise<VisionExtractResult<T>> {
  const { imageBase64, prompt, schema, jsonSchema, maxTokens = 2000, logTag } = params;
  const dataUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  const rawBase64 = imageBase64.startsWith("data:") ? (imageBase64.split(",")[1] ?? "") : imageBase64;

  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;

  try {
    let content = "";

    if (openai) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Sos un extractor de datos de fotos/documentos peruanos. Respondé SOLO JSON válido sin markdown. Si algo no se puede leer, no lo inventes.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          max_tokens: maxTokens,
          // OCR/extracción — determinístico, variación = errores de parsing.
          temperature: AI_TEMPERATURES.extraction,
        }),
      });
      if (!res.ok) return { ok: false, status: 502, error: `API error: ${res.status}` };
      content = (await res.json())?.choices?.[0]?.message?.content ?? "";
    } else if (anthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: maxTokens,
          // Sonnet 5 razona por defecto y `max_tokens` topea razonamiento MÁS
          // respuesta: leer una planilla es extracción, no un problema a pensar.
          thinking: { type: "disabled" },
          // El JSON queda garantizado por la API en vez de pedido por prompt —
          // el fallo típico del OCR no es leer mal la foto, es devolver el
          // JSON envuelto en markdown y morir en el parseo.
          output_config: { format: { type: "json_schema", schema: jsonSchema } },
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: rawBase64 } },
                { type: "text", text: prompt },
              ],
            },
          ],
        }),
      });
      if (!res.ok) return { ok: false, status: 502, error: `API error: ${res.status}` };
      content = (await res.json())?.content?.[0]?.text ?? "";
    } else {
      logger.warn(`${logTag} sin OPENAI_API_KEY ni ANTHROPIC_API_KEY configuradas`);
      return {
        ok: false,
        status: 503,
        error: "La lectura automática de fotos todavía no está activada en esta tienda. Cargá los datos a mano mientras tanto.",
      };
    }

    const parsed = safeParseJSON(content, schema);
    if (!parsed.ok) {
      logger.warn(`${logTag} no se pudo interpretar la respuesta del modelo`, { raw: parsed.raw?.slice(0, 500) });
      return { ok: false, status: 422, error: "No se pudo interpretar la foto", raw: parsed.raw };
    }
    return { ok: true, data: parsed.data };
  } catch (error) {
    logger.error(`${logTag} failed`, { error: String(error) });
    return {
      ok: false,
      status: 500,
      error: `Error procesando la foto: ${error instanceof Error ? error.message : "desconocido"}`,
    };
  }
}
