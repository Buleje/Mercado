import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { smartModel, getActiveProvider } from "@/lib/ai/provider";
import { cleanJSONResponse } from "@/lib/ai-json-parser";
import { logger } from "@/lib/logger";
import type { DbDocument } from "@/lib/types/documents";

/**
 * POST /api/admin/documents/assistant — asistente de documentos.
 * Recibe una pregunta en lenguaje natural, arma un índice compacto de los docs del
 * tenant (nombre + categoría + tags + IA-tags + snippet de OCR) y le pide a la IA una
 * respuesta + los documentos relevantes. Sin IA configurada → fallback por keywords.
 */
const Body = z.object({
  question: z.string().min(2).max(500),
  history: z.array(z.object({ q: z.string().max(500), a: z.string().max(1500) })).max(6).optional(),
});
const AnswerSchema = z.object({
  answer: z.string(),
  docRefs: z.array(z.number().int().min(0)).max(5),
});

type MatchedDoc = { id: string; name: string; category: string };

function keywordFallback(docs: DbDocument[], question: string): { answer: string; matchedDocs: MatchedDoc[] } {
  const terms = question.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const scored = docs
    .map((d) => {
      const hay = `${d.name} ${d.category} ${d.tags.join(" ")} ${d.aiTags.join(" ")} ${d.ocrText ?? ""}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return {
    answer: scored.length
      ? `Encontré ${scored.length} documento(s) que coinciden con tu búsqueda. (La IA no está configurada; usé coincidencia por palabras.)`
      : "No encontré documentos que coincidan. Probá describiéndolo con otras palabras.",
    matchedDocs: scored.map((x) => ({ id: x.d.id, name: x.d.name, category: x.d.category })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "documents:assistant");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const question = parsed.data.question.trim();

    const all = await DocumentsDB.list(auth.tenantId, {});
    const docs = all.slice(0, 120);

    if (docs.length === 0) {
      return NextResponse.json({ answer: "Todavía no tenés documentos cargados. Subí algunos y volvé a preguntarme.", matchedDocs: [], source: "empty" });
    }

    if (getActiveProvider() === "none") {
      return NextResponse.json({ ...keywordFallback(docs, question), source: "keyword" });
    }

    const index = docs
      .map((d, i) => {
        const content = (d.ocrText ?? "").replace(/\s+/g, " ").slice(0, 600);
        const tags = [...d.tags, ...d.aiTags].join(", ");
        return `[${i}] "${d.name}" · categoría: ${d.category}${tags ? ` · etiquetas: ${tags}` : ""}${d.expiresAt ? ` · vence: ${d.expiresAt.slice(0, 10)}` : ""}${content ? ` · contenido: ${content}` : ""}`;
      })
      .join("\n");

    const prompt = `Sos el asistente de documentos de una bodega/negocio peruano.

Índice de sus documentos (cada uno con su número [i]):
${index}

${(parsed.data.history ?? []).length ? `Conversación previa (usala para resolver referencias como "ese", "y el vencimiento", "el anterior"):\n${(parsed.data.history ?? []).map((h) => `Usuario: ${h.q}\nAsistente: ${h.a}`).join("\n")}\n\n` : ""}El usuario pregunta ahora: "${question}"

Devolvé SOLO un objeto JSON válido (sin markdown, sin texto extra) con esta forma exacta:
{"answer": "<respuesta en español, tuteo peruano, breve y concreta; si la respuesta está en el contenido de un documento, usala>", "docRefs": [<números [i] de los documentos más relevantes, máximo 5, el más relevante primero; vacío si ninguno aplica>]}`;

    try {
      const { text } = await generateText({ model: smartModel, prompt, temperature: 0.2 });
      const parsed = AnswerSchema.safeParse(JSON.parse(cleanJSONResponse(text)));
      if (!parsed.success) throw new Error("bad_ai_shape");
      const matchedDocs = parsed.data.docRefs
        .map((i) => docs[i])
        .filter((d): d is DbDocument => !!d)
        .map((d) => ({ id: d.id, name: d.name, category: d.category }));
      return NextResponse.json({ answer: parsed.data.answer, matchedDocs, source: "ai" });
    } catch (err) {
      logger.warn("documents.assistant.ai_fail", { err: err instanceof Error ? err.message : String(err) });
      return NextResponse.json({ ...keywordFallback(docs, question), source: "keyword-fallback" });
    }
  } catch (e) {
    logger.error("[documents.assistant] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
