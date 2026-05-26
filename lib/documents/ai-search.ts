import "server-only";
import { logger } from "@/lib/logger";
import { fetchGroqWithRetry } from "@/lib/groq-fetch";

/**
 * ADR-119 — Búsqueda semántica de documentos.
 *
 * El usuario escribe lenguaje natural ("el contrato de alquiler del local")
 * pero el archivo puede llamarse "IMG_2034.pdf". Expandimos la consulta a un
 * set de términos/sinónimos con un LLM barato y dejamos que el caller los OR-ee
 * contra name/ocrText/tags.
 *
 * Provider: usa la infra LLM del proyecto (Vercel AI Gateway / Groq directo vía
 * GROQ_API_KEY) — modelo barato llama-3.1-8b-instant. Best-effort: si no hay
 * key ni gateway o el modelo falla, devuelve la query tokenizada (keyword).
 */
export async function expandSearchTerms(query: string): Promise<string[]> {
  const base = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const fallback = () =>
    Array.from(new Set([query.trim().toLowerCase(), ...base])).filter(Boolean);

  const apiKey = process.env.GROQ_API_KEY;
  const hasGateway = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if ((!apiKey && !hasGateway) || query.trim().length < 3) return fallback();

  try {
    const prompt = [
      "Sos un buscador de documentos de una bodega/empresa peruana.",
      `El usuario busca: "${query.trim()}".`,
      "Devolvé SOLO JSON con sinónimos y palabras clave para buscar en nombres",
      "de archivo y texto OCR (incluí términos peruanos como 'recibo', 'boleta',",
      "'licencia', 'DIGESA', 'alquiler', 'proveedor' cuando apliquen).",
      'Formato: {"terms":["t1","t2","t3","t4","t5"]} — minúsculas, sin tildes, máx 8.',
    ].join("\n");

    const resp = await fetchGroqWithRetry(
      apiKey ?? "",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: "json_object" },
      },
      "doc-search"
    );

    if (!resp.ok || !resp.data) {
      logger.warn("documents.ai.search.llm_fail", { err: resp.error });
      return fallback();
    }

    const content = (resp.data as { choices?: { message?: { content?: string } }[] })
      ?.choices?.[0]?.message?.content;
    const parsed = content ? JSON.parse(content) : {};
    const aiTerms: string[] = Array.isArray(parsed.terms)
      ? parsed.terms
          .filter((t: unknown) => typeof t === "string")
          .map((t: string) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 8)
      : [];

    return Array.from(new Set([...base, ...aiTerms])).slice(0, 12);
  } catch (err) {
    logger.warn("documents.ai.search.exception", { err: String(err) });
    return fallback();
  }
}
