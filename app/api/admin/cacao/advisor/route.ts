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

    // Contexto del acopiador: stock disponible + costo de compra vs. referencia.
    // Alimenta la SEÑAL (no solo el mercado) y el prompt de la IA.
    const refKg = market.pricePenPerKg;
    const [buy, inv] = await Promise.all([
      CacaoDB.avgBuyPrice(auth.tenantId).catch((err) => {
        logger.warn("[cacao.advisor] avgBuyPrice falló", { error: String(err) });
        return null;
      }),
      CacaoDB.inventory(auth.tenantId).catch((err) => {
        logger.warn("[cacao.advisor] inventory falló", { error: String(err) });
        return null;
      }),
    ]);
    const miPrecioKg = buy?.avgPrecioPorKg ?? null;
    const stockKg = inv?.kgSecoDisponible ?? 0;
    // spreadPct (UI): mi compra vs. referencia (negativo = comprás barato).
    const spreadPct =
      miPrecioKg != null && refKg != null && refKg > 0
        ? Math.round(((miPrecioKg - refKg) / refKg) * 1000) / 10
        : null;
    // margenPct (asesor): margen bruto sobre TU costo (positivo = buen margen).
    const margenPct =
      miPrecioKg != null && refKg != null && miPrecioKg > 0
        ? Math.round(((refKg - miPrecioKg) / miPrecioKg) * 1000) / 10
        : null;
    const local = { miPrecioKg, kg: buy?.kg ?? 0, lotes: buy?.lotes ?? 0, refKg, spreadPct, stockKg };

    const advisor = cacaoAdvisor({
      value: market.price.value,
      changePct: market.price.changePct,
      weekHigh52: market.price.weekHigh52,
      weekLow52: market.price.weekLow52,
      series: market.price.series,
      news: market.news?.map((n) => ({ title: n.title })) ?? [],
      local: { stockKg, miPrecioKg, refKg, spreadPct: margenPct },
    });

    // Narrativa IA (cacheada por señal). Reutiliza si vigente y misma señal.
    let narrative: string | null = null;
    if (narCache && narCache.signal === advisor.signal && Date.now() - narCache.at < NAR_TTL) {
      narrative = narCache.text;
    } else {
      const titulares = market.news.slice(0, 5).map((n) => `- ${n.title}`).join("\n");
      const m = advisor.metrics;
      const system =
        "Eres asesor de mercado de cacao para un acopiador (comprador-vendedor) en Pucallpa, Perú. " +
        "Hablas claro y directo, en español peruano con TUTEO (puedes/vende/tienes), NUNCA voseo (podés/vendé/tenés). " +
        "PROHIBIDO inventar cifras: usa SOLO los números que te doy. " +
        "IMPORTANTE: respeta la RECOMENDACIÓN calculada y sé coherente con los indicadores — NO digas que el precio está 'barato' o 'bajo' si subió fuerte o está sobrecomprado (RSI alto); si está en la parte baja de su rango de 52 semanas pero viene subiendo, explícalo como que aún está lejos de su máximo del año pero con impulso. " +
        "Responde 2-3 oraciones, sin título ni markdown ni comillas.";
      const t = advisor.tecnico;
      const user =
        `Datos del cacao hoy:\n` +
        `- Precio ICE: USD ${market.price.value}/t (${market.price.changePct ?? 0}% hoy)\n` +
        `- Posición en rango 52 sem: ${m.pos52 ?? "?"}% · drawdown vs. máximo del año: ${t.drawdownPct ?? "?"}%\n` +
        `- Tendencia: 3 meses ${m.trend90 ?? "?"}% · mes ${m.trend30 ?? "?"}% · semana ${m.trend7 ?? "?"}% (${m.velocidadDia ?? "?"}%/día) · volatilidad ${m.volatilidad ?? "?"}%/día\n` +
        `- RSI(14): ${t.rsi ?? "?"}${t.rsiZona && t.rsiZona !== "neutral" ? ` (${t.rsiZona})` : ""} · MACD ${t.macdHist != null ? (t.macdHist > 0 ? "alcista" : "bajista") : "?"} · dirección probable: suba ${advisor.direccion.probabilidadSuba}%\n` +
        (advisor.forecast?.[1] ? `- Proyección lineal a 30 días: USD ${advisor.forecast[1].mid}/t (${advisor.forecast[1].pct}%, rango ${advisor.forecast[1].low}–${advisor.forecast[1].high})\n` : "") +
        (advisor.news ? `- Sesgo de noticias: ${advisor.news.senal}\n` : "") +
        (market.pricePenPerKg ? `- Referencia ≈ S/ ${market.pricePenPerKg}/kg seco\n` : "") +
        (stockKg > 0
          ? `- TU situación: ${stockKg} kg de cacao seco en stock` +
            (miPrecioKg != null ? `, costo promedio S/ ${miPrecioKg}/kg` : "") +
            (margenPct != null ? `, margen ~${margenPct}% sobre tu costo vs. referencia` : "") +
            `\n`
          : `- TU situación: sin stock seco disponible ahora\n`) +
        `- RECOMENDACIÓN calculada (respétala): ${advisor.signal.toUpperCase()} (${advisor.fuerza}, confianza ${advisor.confianza}%)\n\n` +
        `Titulares recientes:\n${titulares || "(sin titulares)"}\n\n` +
        `Explica en 2-3 oraciones, coherente con la recomendación de arriba, qué está pasando con el cacao y qué le conviene hacer a ESTE acopiador y en qué ventana, considerando su stock y su margen sobre el costo. No repitas los números crudos, interprétalos.`;

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
