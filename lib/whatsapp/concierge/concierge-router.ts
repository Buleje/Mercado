import "server-only";

// Import ADR-043 classifier WITHOUT modifying the file (ADR-046 constraint)
import { classifyWhatsappIntent, shouldTrustAi } from "../ai-intent";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

import {
  getConversation,
  upsertConversation,
  extractState,
  extractCartItems,
} from "./conversation-store";
import { dispatch } from "./state-machine";
import { buildConciergeResponse } from "./response-formatter";
import { asesoraHandler } from "./handlers/asesora.handler";
import { SettingsDB } from "@/lib/db/settings.db";
import { setBotPaused } from "@/lib/db/whatsapp-messages.db";
import { leerAjusteAsistente, type LecturaAsistente } from "../asistente-negocio";
import type { Classification, ConversationContext, ConciergeResponse } from "./types";

/**
 * La asistente del negocio (Settings › whatsappAsistente). Si la lectura falla,
 * lo de siempre: menú genérico y SIN cruzar tiendas (lo seguro).
 */
async function leerAsistente(tenantId: string): Promise<LecturaAsistente> {
  try {
    return leerAjusteAsistente(await SettingsDB.getFeatureFlags(tenantId));
  } catch (err) {
    logger.warn("[concierge-router] no se pudo leer la asistente del negocio — menú genérico", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { activo: false, cruzarTiendas: false };
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * handleIncomingMessage — the single entry point for the concierge engine.
 *
 * Flow:
 *  1. Load conversation context from DB (null = first message or expired)
 *  2. Classify message with AI (ADR-043)
 *  3. If confidence < 0.6 → fallback to welcome menu without state change
 *  4. Dispatch to handler via state machine
 *  5. Persist new state + cart
 *  6. Fire-and-forget audit log
 *  7. Return formatted response
 *
 * Never throws — all errors produce a friendly reply.
 */
export async function handleIncomingMessage(
  tenantId: string,
  phone: string,
  message: string,
): Promise<ConciergeResponse> {
  // ── Guard: message too long (test case #11) ──────────────────────────────
  if (message.trim().length > 500) {
    return {
      reply:
        "Tu mensaje es muy largo. Por favor escribe en frases cortas, por ejemplo:\n" +
        "_\"Quiero 2 kg de arroz\"_ o _\"Cuánto cuesta la leche\"_",
      state: "idle",
      escalated: false,
    };
  }

  // ── Load conversation ────────────────────────────────────────────────────
  const conversation = await getConversation(tenantId, phone);
  const currentState = extractState(conversation);

  // ── La asistente del negocio: con ella activa no hay clasificador ni menú ──
  const asistente = await leerAsistente(tenantId);

  // ── Classify with AI ─────────────────────────────────────────────────────
  let classification: Classification = { intent: "desconocido", confidence: 0 };
  if (!asistente.activo) {
    classification = await classifyWhatsappIntent(message);
    // If AI returns low confidence → fallback to welcome menu (test case #13)
    if (!shouldTrustAi(classification)) {
      classification = { intent: "desconocido", confidence: 0 };
    }
  }

  // ── Build context ────────────────────────────────────────────────────────
  const ctx: ConversationContext = {
    tenantId,
    phone,
    message,
    conversation,
    asistente,
  };

  // ── Dispatch: la asesora del negocio, o la máquina de estados ────────────
  let result;
  try {
    result = asistente.activo
      ? await asesoraHandler(ctx, classification)
      : await dispatch(ctx, classification);
  } catch (err) {
    logger.error("[concierge-router] dispatch crashed", {
      tenantId,
      phone,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      reply:
        "Lo siento, ocurrió un error. Escribe *hola* para volver al menú o espera un momento.",
      state: currentState,
      escalated: false,
    };
  }

  // ── Persist updated state ────────────────────────────────────────────────
  const newState = result.newState ?? currentState;
  const newCart = result.updatedCartItems ?? extractCartItems(conversation);

  await upsertConversation(tenantId, phone, newState, newCart);

  // ── Traspaso de la asesora: el bot se calla en este hilo ─────────────────
  // Hasta que alguien lo reanude en Mensajes › WhatsApp (botón «Reanudar bot»).
  if (asistente.activo && result.shouldEscalate && asistente.pausarAlTraspasar) {
    try {
      await setBotPaused(tenantId, phone, true);
    } catch (err) {
      logger.error("[concierge-router] no se pudo pausar el bot tras el traspaso", {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Fire-and-forget audit log (CLAUDE.md rule #7) ────────────────────────
  logActivity(
    "whatsapp.message",
    "WhatsAppConversation",
    JSON.stringify({
      intent: asistente.activo ? "asesora" : classification.intent,
      escalated: result.shouldEscalate ?? false,
      state: newState,
      reply: result.reply.slice(0, 80),
    }),
    phone,
    phone,
    undefined,
    tenantId,
  ).catch((err) => {
    logger.warn("[concierge-router] logActivity falló", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // ── Build and return response ────────────────────────────────────────────
  return buildConciergeResponse(result, currentState);
}
