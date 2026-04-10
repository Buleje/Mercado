import "server-only";

/**
 * lib/ai/daily-insights.ts
 *
 * Genera un resumen inteligente del día con tono informal peruano usando LLM.
 * Compara con el día anterior para resaltar tendencias.
 *
 * Uso fire-and-forget seguro: si la llamada LLM falla, retorna un fallback
 * con los números raw. El cron NUNCA se rompe por esta función.
 *
 * Tier LLM: "cheap" (llama-3.1-8b-instant) — suficiente para texto corto
 * y más rápido que "balanced". Sin tools, sin streaming.
 */

import { callLLM } from "@/lib/llm-router";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DailyInsightsInput {
  /** Datos del día actual */
  hoy: {
    totalVentas: number;
    totalPedidos: number;
    ticketPromedio: number;
    top5Productos: Array<{ nombre: string; cantidad: number }>;
    productosStockBajo: Array<{ name: string; stock?: number; stockMin?: number | null }>;
    diferenciaCaja: number | null;
    tenantName: string;
    fechaTexto: string;
  };
  /** Datos del día anterior (puede ser null si no hay registro previo) */
  ayer: {
    totalVentas: number;
    totalPedidos: number;
    ticketPromedio: number;
  } | null;
}

export interface DailyInsightsResult {
  /** Texto en español informal peruano generado por IA. 3-5 oraciones. */
  summary: string;
  /** Emoji representando el estado del día */
  emoji: string;
  /** Tendencia respecto al día anterior */
  trend: "up" | "down" | "stable";
  /** Si el texto es fallback (sin IA) */
  isFallback: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcularTrend(ventasHoy: number, ventasAyer: number | undefined): "up" | "down" | "stable" {
  if (!ventasAyer || ventasAyer === 0) return "stable";
  const diff = ventasHoy - ventasAyer;
  const pct = diff / ventasAyer;
  if (pct > 0.05) return "up";
  if (pct < -0.05) return "down";
  return "stable";
}

function buildFallbackText(input: DailyInsightsInput): DailyInsightsResult {
  const { hoy, ayer } = input;
  const trend = calcularTrend(hoy.totalVentas, ayer?.totalVentas);

  const trendText = ayer
    ? (() => {
        const diff = hoy.totalVentas - ayer.totalVentas;
        const pct = ayer.totalVentas > 0 ? Math.abs((diff / ayer.totalVentas) * 100).toFixed(0) : null;
        if (trend === "up") return pct ? ` (+${pct}% vs ayer)` : " (más que ayer)";
        if (trend === "down") return pct ? ` (-${pct}% vs ayer)` : " (menos que ayer)";
        return " (similar a ayer)";
      })()
    : "";

  const topProducto = hoy.top5Productos[0];
  const emoji = trend === "up" ? "📈" : trend === "down" ? "📉" : "📊";

  const lines: string[] = [
    `S/ ${hoy.totalVentas.toFixed(2)} en ventas${trendText} · ${hoy.totalPedidos} transacciones · ticket promedio S/ ${hoy.ticketPromedio.toFixed(2)}.`,
  ];
  if (topProducto) {
    lines.push(`Producto estrella: ${topProducto.nombre} (${topProducto.cantidad} uds).`);
  }
  if (hoy.productosStockBajo.length > 0) {
    lines.push(`Ojo: ${hoy.productosStockBajo.length} producto(s) con stock bajo — ${hoy.productosStockBajo.slice(0, 2).map(p => p.name).join(", ")}.`);
  }
  if (hoy.diferenciaCaja !== null && Math.abs(hoy.diferenciaCaja) > 0.01) {
    const signo = hoy.diferenciaCaja > 0 ? "+" : "";
    lines.push(`Diferencia de caja: ${signo}S/ ${hoy.diferenciaCaja.toFixed(2)}.`);
  }

  return {
    summary: lines.join(" "),
    emoji,
    trend,
    isFallback: true,
  };
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Genera un resumen inteligente del día usando LLM.
 *
 * Esta función es SIEMPRE segura: captura cualquier error del LLM y retorna
 * un fallback con texto plano. Nunca lanza excepción hacia el caller.
 */
export async function generateDailyInsights(
  input: DailyInsightsInput,
): Promise<DailyInsightsResult> {
  const { hoy, ayer } = input;

  const trend = calcularTrend(hoy.totalVentas, ayer?.totalVentas);

  // Construir contexto para el prompt
  const comparacion = ayer
    ? `Ayer: S/ ${ayer.totalVentas.toFixed(2)} en ventas, ${ayer.totalPedidos} transacciones, ticket S/ ${ayer.ticketPromedio.toFixed(2)}.`
    : "No hay datos del día anterior para comparar.";

  const topProds = hoy.top5Productos.length > 0
    ? hoy.top5Productos.slice(0, 3).map((p, i) => `${i + 1}. ${p.nombre} (${p.cantidad} uds)`).join(", ")
    : "ninguno registrado";

  const stockAlerta = hoy.productosStockBajo.length > 0
    ? `${hoy.productosStockBajo.length} productos con stock bajo: ${hoy.productosStockBajo.slice(0, 3).map(p => `${p.name} (${p.stock ?? 0} uds)`).join(", ")}.`
    : "sin alertas de stock.";

  const cajaInfo = hoy.diferenciaCaja !== null
    ? `Diferencia de caja: ${hoy.diferenciaCaja >= 0 ? "+" : ""}S/ ${hoy.diferenciaCaja.toFixed(2)}.`
    : "Caja no cerrada.";

  const trendEmoji = trend === "up" ? "📈" : trend === "down" ? "📉" : "📊";

  const systemPrompt = `Eres el asistente de negocio de una bodega familiar en Pucallpa, Perú.
Hablas en español informal peruano, como un empleado de confianza que le da el reporte al dueño cada noche.
Usas "jefe", emojis con moderación, y eres directo y amistoso.
Respondes SOLO con el texto del resumen, sin título, sin formato markdown, sin comillas.
El resumen tiene exactamente 3 a 5 oraciones cortas.`;

  const userPrompt = `Genera el resumen de hoy (${hoy.fechaTexto}) para la bodega "${hoy.tenantName}":

HOY:
- Ventas totales: S/ ${hoy.totalVentas.toFixed(2)}
- Transacciones: ${hoy.totalPedidos}
- Ticket promedio: S/ ${hoy.ticketPromedio.toFixed(2)}
- Top productos: ${topProds}
- Stock bajo: ${stockAlerta}
- ${cajaInfo}

COMPARACIÓN:
- ${comparacion}
- Tendencia: ${trend === "up" ? "SUBIÓ" : trend === "down" ? "BAJÓ" : "ESTABLE"} vs ayer

Resumen informal peruano (3-5 oraciones, máximo 120 palabras):`;

  try {
    const res = await callLLM("cheap", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 200,
      label: "daily-insights",
    });

    if (!res.ok || !res.content) {
      logger.warn("[daily-insights] LLM call failed, usando fallback", {
        error: res.error,
        provider: res.provider,
      });
      return buildFallbackText(input);
    }

    const summaryText = res.content.trim();

    logger.debug("[daily-insights] Resumen generado", {
      provider: res.provider,
      tokens: res.usage?.totalTokens,
      chars: summaryText.length,
    });

    return {
      summary: summaryText,
      emoji: trendEmoji,
      trend,
      isFallback: false,
    };
  } catch (err) {
    logger.warn("[daily-insights] Error inesperado, usando fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    return buildFallbackText(input);
  }
}
