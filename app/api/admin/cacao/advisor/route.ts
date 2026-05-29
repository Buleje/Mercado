import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { getCacaoMarket } from "@/lib/cacao/cacao-market";
import { cacaoAdvisor } from "@/lib/cacao/cacao-advisor";
import { CacaoDB } from "@/lib/db/cacao.db";
import { callLLM } from "@/lib/llm-router";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/cacao/advisor — Asesor híbrido (ADR-128).
 * Señal determinística (vender/aguantar) + narrativa IA grounded en los datos
 * reales + noticias. Narrativa cacheada (2h, por señal) para acotar costo IA.
 * Si la IA falla, devuelve solo la señal (best-effort).
 */

let narCache: { at: number; signal: string; text: string } | null = null;
const NAR_TTL = 2 * 60 * 60 * 1000; // 2h

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "cacao-advisor");
  if (rl) return rl;
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:agricola:cacao-acopio");
  if (!ok) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

  try {
    const market = await getCacaoMarket();
    if (!market.price) return NextResponse.json({ advisor: null, narrative: null });

    const advisor = cacaoAdvisor({
      value: market.price.value,
      changePct: market.price.changePct,
      weekHigh52: market.price.weekHigh52,
      weekLow52: market.price.weekLow52,
      series: market.price.series,
    });

    // Comparación: mi precio de compra (seco) vs referencia internacional S//kg.
    const buy = await CacaoDB.avgBuyPrice(auth.tenantId).catch(() => null);
    const refKg = market.pricePenPerKg;
    const local = buy && buy.avgPrecioPorKg != null
      ? {
          miPrecioKg: buy.avgPrecioPorKg,
          kg: buy.kg,
          lotes: buy.lotes,
          refKg,
          spreadPct: refKg ? Math.round(((buy.avgPrecioPorKg - refKg) / refKg) * 1000) / 10 : null,
        }
      : { miPrecioKg: null, kg: 0, lotes: buy?.lotes ?? 0, refKg, spreadPct: null };

    // Narrativa IA (cacheada por señal). Reutiliza si vigente y misma señal.
    let narrative: string | null = null;
    if (narCache && narCache.signal === advisor.signal && Date.now() - narCache.at < NAR_TTL) {
      narrative = narCache.text;
    } else {
      const titulares = market.news.slice(0, 5).map((n) => `- ${n.title}`).join("\n");
      const m = advisor.metrics;
      const system =
        "Eres asesor de mercado de cacao para un acopiador (comprador-vendedor) en Pucallpa, Perú. " +
        "Hablas claro, directo y en español peruano, sin jerga financiera. " +
        "PROHIBIDO inventar cifras: usa SOLO los números que te doy. " +
        "Responde 2-3 oraciones, sin título ni markdown ni comillas.";
      const user =
        `Datos del cacao hoy:\n` +
        `- Precio ICE: USD ${market.price.value}/t (${market.price.changePct ?? 0}% hoy)\n` +
        `- Posición en rango 52 sem: ${m.pos52 ?? "?"}%\n` +
        `- Tendencia ~mes: ${m.trend30 ?? "?"}% · semana: ${m.trend7 ?? "?"}% · volatilidad: ${m.volatilidad ?? "?"}%/día\n` +
        (market.pricePenPerKg ? `- Referencia ≈ S/ ${market.pricePenPerKg}/kg seco\n` : "") +
        `- Señal calculada: ${advisor.signal.toUpperCase()} (${advisor.fuerza})\n\n` +
        `Titulares recientes:\n${titulares || "(sin titulares)"}\n\n` +
        `Explica en 2-3 oraciones qué está pasando con el cacao y qué le conviene hacer al acopiador (vender, aguantar, acopiar). No repitas los números crudos, interprétalos.`;

      const res = await callLLM("cheap", {
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.6,
        maxTokens: 220,
        label: "cacao-advisor",
      });
      if (res.ok && res.content) {
        narrative = res.content.trim();
        narCache = { at: Date.now(), signal: advisor.signal, text: narrative };
      } else {
        logger.warn("[cacao.advisor] LLM no disponible, solo señal", { error: res.error });
      }
    }

    return NextResponse.json({ advisor, narrative, local, generatedAt: market.generatedAt });
  } catch (err) {
    logger.error("[cacao.advisor.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
