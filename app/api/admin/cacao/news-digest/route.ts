import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { getCacaoMarket } from "@/lib/cacao/cacao-market";
import { callLLM } from "@/lib/llm-router";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/cacao/news-digest — resumen IA del día de las noticias del cacao.
 * 2 oraciones grounded en los titulares (getCacaoMarket). Cacheado 2h por set de
 * titulares para acotar costo IA. Si la IA falla, devuelve digest: null.
 */
let cache: { at: number; key: string; digest: string } | null = null;
const TTL = 2 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "cacao-news-digest");
  if (rl) return rl;
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:agricola:cacao-acopio");
  if (!ok) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

  try {
    const market = await getCacaoMarket();
    const titles = market.news.slice(0, 8).map((n) => n.title);
    if (titles.length === 0) return NextResponse.json({ digest: null });

    const key = titles.slice(0, 5).join("|");
    if (cache && cache.key === key && Date.now() - cache.at < TTL)
      return NextResponse.json({ digest: cache.digest, generatedAt: new Date(cache.at).toISOString() });

    const system =
      "Eres analista de mercado de cacao para un acopiador en Perú. Resume en 2 oraciones, " +
      "claro y directo en español peruano, qué dicen HOY estas noticias EN CONJUNTO y hacia " +
      "dónde apuntan para el precio del cacao (alza, baja o lateral). Sin markdown ni comillas. " +
      "No inventes datos que no estén en los titulares.";
    const user = `Titulares de hoy:\n${titles.map((t) => `- ${t}`).join("\n")}`;

    const res = await callLLM("cheap", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.5,
      maxTokens: 160,
      label: "cacao-news-digest",
    });
    if (res.ok && res.content) {
      const digest = res.content.trim();
      cache = { at: Date.now(), key, digest };
      return NextResponse.json({ digest, generatedAt: new Date().toISOString() });
    }
    logger.warn("[cacao.news-digest] LLM no disponible", { error: res.error });
    return NextResponse.json({ digest: null });
  } catch (err) {
    logger.error("[cacao.news-digest.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
