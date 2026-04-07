/**
 * lib/ai-json-parser.ts
 *
 * Parser robusto para respuestas JSON de LLMs que NO tienen structured output
 * garantizado (Groq con tools, ver ADR-009).
 *
 * Los LLMs a menudo devuelven JSON con:
 *   - Markdown fences ```json ... ```
 *   - Texto explicativo antes o después del JSON
 *   - Claves entre comillas simples en lugar de dobles (menos común)
 *   - Trailing commas en arrays/objects (inválido en JSON estricto)
 *
 * `safeParseJSON<T>(raw, schema)` aplica heurísticas de limpieza + valida
 * contra un schema Zod + devuelve un tagged result para forzar al caller
 * a manejar el caso de falla.
 *
 * Uso:
 * ```ts
 * import { z } from "zod";
 * import { safeParseJSON } from "@/lib/ai-json-parser";
 *
 * const PredictionSchema = z.object({
 *   topProducts: z.array(z.object({ product: z.string(), score: z.number() })),
 *   summary: z.string(),
 * });
 *
 * const parsed = safeParseJSON(llmResponse, PredictionSchema);
 * if (!parsed.ok) {
 *   logger.warn("[demand-prediction] Malformed JSON from LLM", { raw: parsed.raw });
 *   return fallbackRuleBasedResponse();
 * }
 * return parsed.data;
 * ```
 */

import type { z } from "zod";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; raw: string; error: string };

/**
 * Intenta parsear `raw` como JSON y validarlo contra `schema`.
 * Aplica limpiezas comunes antes del parse:
 *   - Strip markdown code fences (```json ... ```)
 *   - Extrae el primer bloque {...} o [...] si hay texto antes/después
 *   - Quita trailing commas simples
 *
 * Devuelve `{ok: true, data}` si pasa el schema, o `{ok: false, raw, error}`
 * para que el caller decida el fallback.
 */
export function safeParseJSON<T>(
  raw: string,
  schema: z.ZodType<T>,
): ParseResult<T> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, raw, error: "empty response" };
  }

  const cleaned = cleanJSONResponse(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      ok: false,
      raw,
      error: `JSON.parse failed: ${(e as Error).message}`,
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      raw,
      error: `schema validation failed: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    };
  }

  return { ok: true, data: result.data };
}

/**
 * Aplica heurísticas de limpieza antes de JSON.parse.
 * Exportado para testing aislado.
 */
export function cleanJSONResponse(raw: string): string {
  let s = raw.trim();

  // 1. Strip markdown code fences
  //    ```json\n{...}\n```  o  ```\n{...}\n```
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }

  // 2. Si hay texto antes del primer { o [, extraer solo desde ahí
  //    (el LLM a veces agrega "Aquí tienes el JSON:" antes)
  const firstBrace = Math.min(
    ...[s.indexOf("{"), s.indexOf("[")].filter((i) => i >= 0),
  );
  if (Number.isFinite(firstBrace) && firstBrace > 0) {
    s = s.slice(firstBrace);
  }

  // 3. Si hay texto después del último } o ], cortar ahí
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace >= 0 && lastBrace < s.length - 1) {
    s = s.slice(0, lastBrace + 1);
  }

  // 4. Eliminar trailing commas simples: {"a": 1,} → {"a": 1}
  s = s.replace(/,(\s*[}\]])/g, "$1");

  return s;
}
