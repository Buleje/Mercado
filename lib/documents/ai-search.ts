import "server-only";
import { logger } from "@/lib/logger";

/**
 * ADR-119 — Búsqueda semántica de documentos.
 *
 * El usuario escribe lenguaje natural ("el contrato de alquiler del local")
 * pero el archivo puede llamarse "IMG_2034.pdf". Expandimos la consulta a un
 * set de términos/sinónimos con un LLM barato y dejamos que el caller los OR-ee
 * contra name/ocrText/tags.
 *
 * Best-effort: si no hay API key o el modelo falla, devolvemos solo la query
 * original tokenizada — degradación elegante a keyword search.
 */
export async function expandSearchTerms(query: string): Promise<string[]> {
  const base = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || query.trim().length < 3) {
    return Array.from(new Set([query.trim().toLowerCase(), ...base])).filter(Boolean);
  }

  try {
    const prompt = [
      "Sos un buscador de documentos de una bodega/empresa peruana.",
      `El usuario busca: "${query.trim()}".`,
      "Devolvé SOLO JSON con sinónimos y palabras clave para buscar en nombres",
      "de archivo y texto OCR (incluí términos peruanos como 'recibo', 'boleta',",
      "'licencia', 'DIGESA', 'alquiler', 'proveedor' cuando apliquen).",
      'Formato: {"terms":["t1","t2","t3","t4","t5"]} — minúsculas, sin tildes, máx 8.',
    ].join("\n");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      logger.warn("documents.ai.search.http_fail", { status: resp.status });
      return base.length ? base : [query.trim().toLowerCase()];
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
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
    return base.length ? base : [query.trim().toLowerCase()];
  }
}
