import "server-only";
import { logger } from "@/lib/logger";
import { DOC_CATEGORIES } from "@/lib/types/documents";

/**
 * Sugiere categoría + tags para un documento usando heurística + opcional Claude/OpenAI.
 *
 * Estrategia:
 *  1. Heurística por filename + mimeType (siempre corre, gratis).
 *  2. Si hay OPENAI_API_KEY/ANTHROPIC_API_KEY y el doc es PDF/imagen, opcionalmente
 *     llamamos modelo vision con un prompt corto. NO bloquea si la API falla.
 *
 * Devuelve siempre algo — la heurística es el floor.
 */

export interface AiCategorizeInput {
  filename: string;
  mimeType: string;
  size: number;
  /** Opcional — primeros 4KB del archivo si es texto/markdown/csv. */
  textSnippet?: string;
}

export interface AiCategorizeResult {
  category: string;
  tags: string[];
  source: "heuristic" | "ai";
}

const KEYWORD_RULES: { match: RegExp; category: string; tags: string[] }[] = [
  { match: /contrat|acuerdo|convenio|nda/i, category: "contratos", tags: ["legal"] },
  { match: /factura|invoice|boleta|recibo|sunat|ruc|igv/i, category: "facturas", tags: ["sunat"] },
  { match: /manual|guia|instructivo|spec|datasheet/i, category: "manuales", tags: ["referencia"] },
  { match: /foto|photo|imagen|escaneo|escan/i, category: "fotos", tags: ["imagen"] },
  { match: /dni|cv|hoja\s*de\s*vida|certificad/i, category: "personal", tags: ["personal"] },
];

const MIME_RULES: { match: RegExp; category: string; tags: string[] }[] = [
  { match: /^image\//, category: "fotos", tags: ["imagen"] },
  { match: /^application\/pdf$/, category: "otros", tags: ["pdf"] },
  { match: /spreadsheet|excel|csv/, category: "facturas", tags: ["planilla"] },
  { match: /word|document/, category: "otros", tags: ["doc"] },
  { match: /^video\//, category: "otros", tags: ["video"] },
];

export function heuristicCategorize(input: AiCategorizeInput): AiCategorizeResult {
  const tags = new Set<string>();
  let category: string | null = null;

  for (const rule of KEYWORD_RULES) {
    if (rule.match.test(input.filename) || (input.textSnippet && rule.match.test(input.textSnippet))) {
      category = rule.category;
      rule.tags.forEach((t) => tags.add(t));
      break;
    }
  }

  if (!category) {
    for (const rule of MIME_RULES) {
      if (rule.match.test(input.mimeType)) {
        category = rule.category;
        rule.tags.forEach((t) => tags.add(t));
        break;
      }
    }
  }

  // Año actual como tag si el filename lo menciona
  const yearMatch = input.filename.match(/20\d{2}/);
  if (yearMatch) tags.add(yearMatch[0]);

  return {
    category: category ?? "otros",
    tags: Array.from(tags).slice(0, 6),
    source: "heuristic",
  };
}

/**
 * Versión "premium" con LLM cuando hay OPENAI_API_KEY.
 * Si no hay key o falla, cae a heurística.
 */
export async function aiCategorize(input: AiCategorizeInput): Promise<AiCategorizeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !input.textSnippet) {
    return heuristicCategorize(input);
  }

  try {
    const prompt = [
      "Eres un asistente que clasifica documentos de una bodega/empresa peruana.",
      `Tengo un archivo con filename="${input.filename}" mime="${input.mimeType}".`,
      "Primeros caracteres del contenido:",
      input.textSnippet.slice(0, 1500),
      "",
      `Devolvé SOLO JSON: {"category":"<one of: ${DOC_CATEGORIES.join("|")}>", "tags":["tag1","tag2","tag3"]}`,
      "Tags deben ser palabras sueltas en minúscula, máx 5.",
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
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) {
      logger.warn("documents.ai.categorize.http_fail", { status: resp.status });
      return heuristicCategorize(input);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return heuristicCategorize(input);
    const parsed = JSON.parse(content);

    const category: string =
      typeof parsed.category === "string" && DOC_CATEGORIES.includes(parsed.category as never)
        ? parsed.category
        : "otros";
    const tags: string[] = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t: unknown) => typeof t === "string")
          .slice(0, 5)
          .map((t: string) => t.trim().toLowerCase())
      : [];

    return { category, tags, source: "ai" };
  } catch (err) {
    logger.warn("documents.ai.categorize.exception", { err: String(err) });
    return heuristicCategorize(input);
  }
}
