import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { ForestCtpFichaDB } from "@/lib/db/forest-ctp-ficha.db";
import { estadoVencimiento } from "@/lib/forestal/ctp-ficha-types";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/ctp/ask — Asistente del Libro CTP.
 * POST { question } → { answer }. La IA responde SOLO con el resumen real del
 * libro (existencias, ingresos, cumplimiento, habilitación) que se arma acá en
 * el server; nunca inventa datos. Guard: spec + auth + rate-limit STRICT +
 * aiCostGuard (una consulta ~$0.003).
 */

const ASK_COST_USD = 0.003;
const Schema = z.object({ question: z.string().trim().min(3).max(500) });

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

/** Arma el contexto textual del libro (all-time) que la IA puede citar. */
async function buildContext(tenantId: string): Promise<string> {
  const [saldos, stats, traza, ficha] = await Promise.all([
    ForestCtpDB.saldos(tenantId),
    WoodEntriesDB.stats(tenantId),
    ForestCtpDespachoDB.trazabilidadDelPeriodo(tenantId),
    ForestCtpFichaDB.get(tenantId),
  ]);
  const existencias = saldos.porEspecie
    .map((e) => `- ${e.especie}${e.cites ? " (CITES)" : ""}: ingresado ${e.ingresoM3} m³, consumido ${e.consumidoM3} m³, saldo ${e.saldoM3} m³`)
    .join("\n") || "  (sin materia prima registrada)";
  const productos = saldos.productos
    .map((p) => `- ${p.producto}: producido ${p.producido}, despachado ${p.despachado}, stock ${p.stock}`)
    .join("\n") || "  (sin productos transformados)";
  const vencidos = [
    ...ficha.titulos.filter((t) => estadoVencimiento(t.vencimiento) === "vencido").map((t) => `título ${t.codigo || t.tipo}`),
    ...ficha.citesPermisos.filter((p) => estadoVencimiento(p.vencimiento) === "vencido").map((p) => `permiso CITES ${p.especie}`),
  ];
  return [
    `CTP: ${ficha.nombreCtp || "sin nombre"} · Código ${ficha.codigoCtp || "sin código"} · RUC ${ficha.ruc || "sin RUC"}`,
    `Ingresos de materia prima: ${stats.totalCount} guías, ${stats.totalVolumeM3} m³ totales. Especies CITES: ${stats.citesCount}. Fuera de plazo (>2 días hábiles): ${stats.lateCount}. Pendientes de validar: ${stats.byStatus.pendiente}.`,
    `EXISTENCIAS de materia prima por especie (saldo = lo que queda):\n${existencias}`,
    `STOCK de productos transformados:\n${productos}`,
    `Despachos SIN cadena de custodia completa (no pueden certificar): ${traza.incompletos} de ${traza.total}${traza.lineas.length ? ` (líneas #${traza.lineas.join(", #")})` : ""}.`,
    `Documentos habilitantes VENCIDOS: ${vencidos.length ? vencidos.join(", ") : "ninguno"}.`,
  ].join("\n\n");
}

async function askLLM(context: string, question: string): Promise<string | null> {
  const system =
    "Sos el asistente del Libro de Operaciones de un aserradero (Centro de Transformación Primaria) en Perú. " +
    "Respondé la pregunta del operador USANDO ÚNICAMENTE los datos del libro que te paso. Sé breve, concreto y en español peruano. " +
    "Si el dato exacto no está en los datos, decí que no figura en el libro — NUNCA inventes cifras. No des consejos legales.";
  const prompt = `Datos del libro:\n${context}\n\nPregunta: ${question}`;

  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (openai) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  }
  if (anthropic) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text?.trim() ?? null;
  }
  return null;
}

/** GET → { available } : ¿hay API key de IA configurada? El widget lo usa para
 *  ocultarse en vez de mostrar una función rota (QA 2026-07-17). */
export const GET = withApiHandler("forestal-ctp-ask-status", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ available: Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) });
});

export const POST = withApiHandler("forestal-ctp-ask", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "STRICT", "ctp-ask");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const canSpend = await aiCostGuard.canSpend(auth.tenantId, ASK_COST_USD);
  if (!canSpend) {
    return NextResponse.json({ error: "budget_exceeded", message: "Presupuesto de IA agotado este mes." }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", message: parsed.error.issues[0]?.message }, { status: 422 });

  try {
    const context = await buildContext(auth.tenantId);
    const answer = await askLLM(context, parsed.data.question);
    if (!answer) {
      return NextResponse.json({ error: "ai_unavailable", message: "El asistente no está disponible (falta API key o el modelo no respondió)." }, { status: 502 });
    }
    await aiCostGuard.recordSpend(auth.tenantId, ASK_COST_USD);
    return NextResponse.json({ answer });
  } catch (err) {
    logger.error("[ctp.ask] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
