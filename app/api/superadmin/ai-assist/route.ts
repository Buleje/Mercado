import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { smartModel, getActiveProvider } from "@/lib/ai/provider";
import { trackAiUsage } from "@/lib/ai/track-usage";
import { logger } from "@/lib/logger";

/**
 * POST /api/superadmin/ai-assist — Co-piloto IA del superadmin (Brandon
 * 2026-06-19, idea #5). Dado el contexto de un negocio, devuelve un resumen de
 * la situación, una acción recomendada y un mensaje listo para mandarle al
 * dueño. Usa Groq (lib/ai/provider). Si no hay proveedor IA → fallback
 * determinístico honesto (ai:false), nunca un texto inventado de la nada.
 */

const CtxSchema = z.object({
  task: z.literal("tenant-copilot"),
  context: z.object({
    name: z.string().min(1).max(120),
    plan: z.string().max(40).optional(),
    score: z.number().nullable().optional(),
    riskLevel: z.string().max(20).optional(),
    daysSinceLastOrder: z.number().optional(),
    daysSinceLastLogin: z.number().optional(),
    trialDaysLeft: z.number().nullable().optional(),
    ordersTotal: z.number().optional(),
    errorsCount: z.number().optional(),
    missingFeatures: z.array(z.string()).max(20).optional(),
  }),
});

type Ctx = z.infer<typeof CtxSchema>["context"];

function fallback(c: Ctx): { summary: string; action: string; draft: string } {
  const bits: string[] = [];
  if (c.riskLevel && c.riskLevel !== "low") bits.push(`riesgo ${c.riskLevel}`);
  if (c.daysSinceLastOrder != null && c.daysSinceLastOrder >= 7) bits.push(`${c.daysSinceLastOrder} días sin vender`);
  if (c.daysSinceLastLogin != null && c.daysSinceLastLogin >= 7) bits.push(`${c.daysSinceLastLogin} días sin entrar`);
  if (c.trialDaysLeft != null && c.trialDaysLeft <= 7) bits.push(c.trialDaysLeft <= 0 ? "trial vencido" : `trial vence en ${c.trialDaysLeft}d`);
  if (c.errorsCount && c.errorsCount > 0) bits.push(`${c.errorsCount} error(es) en su panel`);
  const summary = bits.length ? `${c.name} tiene ${bits.join(", ")}.` : `${c.name} se ve estable.`;
  const action = c.daysSinceLastOrder != null && c.daysSinceLastOrder >= 7
    ? "Contactá al dueño para entender por qué dejó de vender y ofrecé ayuda concreta."
    : c.missingFeatures && c.missingFeatures.length
      ? `Ofrecé activar ${c.missingFeatures[0]} para que venda más.`
      : "Hacé un check-in amistoso para mantener la relación.";
  const draft = `¡Hola! Te escribo del equipo Buleje 👋. Vi cómo va ${c.name} y quería darte una mano${c.missingFeatures && c.missingFeatures.length ? ` — por ejemplo con ${c.missingFeatures[0]}, que te puede ayudar a vender más` : ""}. ¿Tenés 5 minutos esta semana para que te muestre?`;
  return { summary, action, draft };
}

export async function POST(req: NextRequest) {
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = CtxSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  const c = parsed.data.context;

  // Sin proveedor IA → fallback determinístico honesto.
  if (getActiveProvider() === "none") {
    return NextResponse.json({ ...fallback(c), ai: false }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const prompt = `Sos el copiloto de soporte de Buleje (SaaS para bodegas/negocios en Perú). Te paso el estado de un negocio cliente; ayudá al equipo a retenerlo y ayudarlo.

Negocio: ${c.name}
Plan: ${c.plan ?? "?"}
Health score: ${c.score ?? "?"}/100 (riesgo ${c.riskLevel ?? "?"})
Días sin vender: ${c.daysSinceLastOrder ?? "?"}
Días sin entrar al panel: ${c.daysSinceLastLogin ?? "?"}
Trial: ${c.trialDaysLeft == null ? "no aplica" : c.trialDaysLeft + " días restantes"}
Pedidos totales: ${c.ordersTotal ?? "?"}
Errores en su panel: ${c.errorsCount ?? 0}
Funciones de crecimiento que NO usa: ${c.missingFeatures?.join(", ") || "ninguna detectada"}

Respondé SOLO un JSON (sin texto extra):
{"summary":"<2 frases: qué le pasa al negocio, en criollo>","action":"<1 acción concreta para el equipo>","draft":"<mensaje corto, cálido y tuteo peruano para mandarle al dueño por WhatsApp; máx 3 frases>"}`;

    const { text } = await trackAiUsage(
      { tenantId: "superadmin", feature: "superadmin-copilot", model: "llama-3.3-70b" },
      () => generateText({ model: smartModel, prompt, maxOutputTokens: 600 }),
    );

    // Extraer el JSON aunque venga con texto alrededor.
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const j = JSON.parse(m[0]) as { summary?: string; action?: string; draft?: string };
        if (j.summary && j.action && j.draft) {
          return NextResponse.json({ summary: j.summary, action: j.action, draft: j.draft, ai: true }, { headers: { "Cache-Control": "no-store" } });
        }
      } catch { /* cae al fallback */ }
    }
    return NextResponse.json({ ...fallback(c), ai: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[superadmin/ai-assist] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ...fallback(c), ai: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
