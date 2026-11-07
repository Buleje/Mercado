import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { chatModel, chatModelId, getActiveProvider } from "@/lib/ai/provider";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { calculateCostUsd, trackAiUsage } from "@/lib/ai/track-usage";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import {
  applyRateLimit,
  createDistributedRateLimiter,
  type DistributedRateLimiter,
} from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { WhatsAppMessagesDB } from "@/lib/db/whatsapp-messages.db";

/**
 * POST /api/admin/whatsapp/suggest — respuestas sugeridas por IA para el
 * operador (estilo Smart Reply). La IA lee el hilo de WhatsApp y propone 3
 * respuestas cortas; el humano elige/edita/envía — NUNCA se manda sola.
 * Mismo patrón que el suggest del chat interno (chatModel + fallback).
 */

const GENERIC_SUGGESTIONS = [
  "¡Hola! ¿En qué te puedo ayudar? 😊",
  "Claro, dime nomás y lo vemos.",
  "Gracias por escribir. Ya te confirmo.",
];

const BodySchema = z.object({ phone: z.string().regex(/^\d{8,15}$/) });

/**
 * Quién atiende la bandeja de WhatsApp: el módulo `comunicaciones` de
 * `lib/module-permissions.ts` (cajero, tienda_owner y la gerencia). Antes
 * bastaba cualquier sesión del panel (almacenero, analista, repartidor…).
 */
const ROLES: readonly AdminRole[] = ["admin", "owner", "manager", "tienda_owner", "cajero"];

/**
 * Tope de gasto de IA (17-10). Dos frenos, los dos por NEGOCIO:
 *  - el presupuesto mensual del plan (`aiCostGuard`, el mismo de los demás
 *    lectores con IA): se reserva lo que cuesta como mucho una sugerencia;
 *  - SUGERENCIAS_POR_DIA en 24 h (Upstash, compartido entre instancias): un
 *    día de clics no se come el mes entero.
 * Al llegar a cualquiera de los dos se devuelven las respuestas genéricas
 * (`source: "tope"`): el operador sigue contestando, sin gastar.
 */
const SUGERENCIAS_POR_DIA = 150;
/** 14 mensajes × 400 caracteres + instrucciones ≈ 2.500 tokens de entrada; salida tope 400. */
const COSTO_MAXIMO_USD = calculateCostUsd(chatModelId, { promptTokens: 2500, completionTokens: 400 });

let _topeDiario: DistributedRateLimiter | null = null;
function topeDiario(): DistributedRateLimiter {
  _topeDiario ??= createDistributedRateLimiter({
    key: "ia:wa-sugerir:dia",
    maxRequests: SUGERENCIAS_POR_DIA,
    windowMs: 24 * 60 * 60 * 1000,
  });
  return _topeDiario;
}

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  // 17-10: era STRICT por IP (10 cada 15 min) antes del login, compartido por
  // todos los que atienden la bandeja desde la misma bodega. Ahora por negocio
  // + usuario, MODERATE (20 cada 5 min): un clic por respuesta sugerida.
  const _rl = applyRateLimit(req, "MODERATE", `admin-whatsapp-suggest:${auth.tenantId}:${auth.username}`);
  if (_rl) return _rl;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "phone requerido" }, { status: 400 });
  }

  if (getActiveProvider() === "none") {
    return NextResponse.json({ suggestions: GENERIC_SUGGESTIONS, source: "fallback" });
  }

  try {
    const messages = await WhatsAppMessagesDB.listMessages(auth.tenantId, parsed.data.phone);
    const recent = messages.filter((m) => m.body.trim()).slice(-14);
    if (recent.length === 0) {
      return NextResponse.json({ suggestions: GENERIC_SUGGESTIONS, source: "fallback" });
    }

    const transcript = recent
      .map((m) => {
        const who =
          m.direction === "in" ? "Cliente" : m.sentBy === "ai" ? "Negocio (bot)" : "Negocio";
        return `${who}: ${m.body.slice(0, 400)}`;
      })
      .join("\n");

    const prompt = `Eres el dueño de un negocio en Perú atendiendo a un cliente por WhatsApp. Conversación reciente:

${transcript}

Genera 3 respuestas CORTAS y distintas que el NEGOCIO podría mandar ahora, según el último mensaje del cliente.

Devuelve EXCLUSIVAMENTE un JSON válido: {"suggestions":["r1","r2","r3"]}

Reglas:
- Español de Perú, cálido y directo (tuteo). Máx 120 caracteres por respuesta, listas para enviarse tal cual.
- 3 ángulos distintos (confirmar, dar el dato pedido, ofrecer alternativa/siguiente paso).
- No inventes precios, stock ni horarios que no estén en la conversación; si falta un dato, deja la respuesta abierta.
- Máximo 1 emoji por respuesta. Solo el JSON, sin markdown.`;

    if (
      !(await aiCostGuard.canSpend(auth.tenantId, COSTO_MAXIMO_USD)) ||
      !(await topeDiario().check(auth.tenantId))
    ) {
      logger.warn("[admin/whatsapp/suggest] tope de IA del negocio", { tenantId: auth.tenantId });
      return NextResponse.json({ suggestions: GENERIC_SUGGESTIONS, source: "tope" });
    }
    // trackAiUsage registra el gasto REAL (tokens del SDK) en el presupuesto.
    const result = await trackAiUsage(
      { tenantId: auth.tenantId, feature: "whatsapp-suggest", model: chatModelId },
      () =>
        generateText({
          model: chatModel,
          prompt,
          maxOutputTokens: 400,
          temperature: 0.7,
        }),
    );

    const cleaned = result.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
    let suggestions: string[] = [];
    try {
      const json = JSON.parse(cleaned) as { suggestions?: unknown };
      if (Array.isArray(json.suggestions)) {
        suggestions = json.suggestions
          .map((s) => String(s).trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, 3);
      }
    } catch {
      /* el modelo no devolvió JSON — genéricas */
    }

    if (suggestions.length === 0) {
      return NextResponse.json({ suggestions: GENERIC_SUGGESTIONS, source: "fallback" });
    }
    return NextResponse.json({ suggestions, source: "ai" });
  } catch (err) {
    logger.error("[admin/whatsapp/suggest] failed", {
      tenantId: auth.tenantId,
      err: String(err),
    });
    return NextResponse.json({ suggestions: GENERIC_SUGGESTIONS, source: "fallback" });
  }
}
