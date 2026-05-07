import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SalesDB, ProductsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
import { safeParseJSON } from "@/lib/ai-json-parser";
import { callLLM } from "@/lib/llm-router";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Schema estructurado del output — ADR 009 (prompt-based JSON enforcement).
// Si el LLM devuelve algo que no matchee este schema, caemos al fallback
// con arrays vacíos en vez de romper el endpoint.
const DemandPredictionSchema = z.object({
  predictions: z
    .array(
      z.object({
        productName: z.string(),
        currentStock: z.number(),
        estimatedDaysLeft: z.number(),
        recommendation: z.string(),
      }),
    )
    .default([]),
  peakDays: z.array(z.string()).default([]),
  purchaseSuggestions: z
    .array(
      z.object({
        product: z.string(),
        suggestedQuantity: z.number(),
        urgency: z.enum(["alta", "media", "baja"]),
      }),
    )
    .default([]),
  summary: z.string(),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "demand-prediction"); if (_rl) return _rl;
  // Only admin can access demand prediction (sensitive business intelligence)
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // ADR-010: router LLM hace el chequeo de API key internamente.
  // Si ningún provider está disponible, callLLM devuelve ok=false con error.

  const { period } = await req.json().catch(() => ({ period: "mes" }));

  // Gather data
  const [sales, products] = await Promise.all([SalesDB.getAll(auth.tenantId), ProductsDB.getAll(auth.tenantId)]);

  const now = new Date();
  const cutoff = new Date(now);
  if (period === "semana") cutoff.setDate(cutoff.getDate() - 7);
  else if (period === "mes") cutoff.setMonth(cutoff.getMonth() - 1);
  else cutoff.setMonth(cutoff.getMonth() - 3);

  const recentSales = sales.filter(s => new Date(s.createdAt) >= cutoff);

  // Aggregate product sales
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const sale of recentSales) {
    for (const item of sale.items) {
      const key = String(item.productId);
      if (!productSales[key]) productSales[key] = { name: item.name, qty: 0, revenue: 0 };
      productSales[key].qty += item.quantity;
      productSales[key].revenue += item.price * item.quantity;
    }
  }

  const topProducts = Object.entries(productSales)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 20)
    .map(([id, d]) => {
      const prod = products.find(p => p.id === Number(id));
      return { id, name: d.name, qtySold: d.qty, revenue: d.revenue, stock: prod?.stock ?? 0, stockMin: prod?.stockMin ?? 0 };
    });

  const lowStock = products.filter(p => p.stock != null && p.stockMin != null && p.stock <= p.stockMin)
    .map(p => ({ name: p.name, stock: p.stock, stockMin: p.stockMin }));

  const prompt = `Eres un analista de inventario para una bodega (tienda de abarrotes) en Pucallpa, Perú.

Datos del período (${period}):
- Total ventas: ${recentSales.length}
- Productos más vendidos: ${JSON.stringify(topProducts)}
- Productos con stock bajo: ${JSON.stringify(lowStock)}

Genera un análisis JSON con:
{
  "predictions": [{"productName": "...", "currentStock": N, "estimatedDaysLeft": N, "recommendation": "..."}],
  "peakDays": ["lunes", ...],
  "purchaseSuggestions": [{"product": "...", "suggestedQuantity": N, "urgency": "alta|media|baja"}],
  "summary": "Resumen general de 2-3 oraciones"
}

Responde SOLO el JSON, sin markdown.`;

  // ADR-010: router LLM balanced tier (Groq llama-3.3-70b con fallback a
  // llama-4-scout). Forecast numérico — temperatura baja del Excel #7.
  const res = await callLLM("balanced", {
    messages: [{ role: "user", content: prompt }],
    temperature: AI_TEMPERATURES.forecast,
    maxTokens: 2000,
    label: "demand-prediction",
  });

  if (!res.ok) return NextResponse.json({ error: res.error ?? "Error IA" }, { status: 502 });

  const text = res.content ?? "";

  // ADR 009: parse defensivo con schema Zod. Si el LLM falla el formato,
  // degradamos a un response de estructura vacía con el texto crudo como
  // summary, para que el frontend al menos muestre algo.
  const parsed = safeParseJSON(text, DemandPredictionSchema);
  if (!parsed.ok) {
    logger.warn("[demand-prediction] malformed JSON from LLM", {
      error: parsed.error,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({
      summary: text,
      predictions: [],
      peakDays: [],
      purchaseSuggestions: [],
      _malformed: true,
    });
  }
  return NextResponse.json(parsed.data);
}
