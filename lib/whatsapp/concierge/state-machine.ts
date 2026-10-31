import "server-only";
import type { ConversationContext, ActionResult, ConversationState, Classification } from "./types";
import {
  productQueryHandler,
  cartAddHandler,
  orderStatusHandler,
  humanEscalationHandler,
  fallbackHandler,
  orderCreateHandler,
  orderCancelHandler,
  recommendHandler,
} from "./handlers";
import { extractState } from "./conversation-store";
import { formatError } from "../message-templates";
import { logger } from "@/lib/logger";

// ─── Transition Table ─────────────────────────────────────────────────────────
//
// Maps (currentState, intent) → handler
// "*" means "any state"
//
// Based on ADR-046 §Estados de la maquina

type IntentKey = Classification["intent"];
type StateKey = ConversationState | "*";

interface TransitionEntry {
  handler: (ctx: ConversationContext, c: Classification) => Promise<ActionResult>;
}

// Priority: exact (state, intent) match > ("*", intent) match
const TRANSITIONS: Map<string, TransitionEntry> = new Map([
  // ── Producto ──────────────────────────────────────────────────────────────
  ["idle:precio",          { handler: productQueryHandler }],
  ["browsing:precio",      { handler: productQueryHandler }],
  ["cart:precio",          { handler: productQueryHandler }],
  ["idle:catalogo",        { handler: productQueryHandler }],
  ["browsing:catalogo",    { handler: productQueryHandler }],

  // ── Agregar al carrito ────────────────────────────────────────────────────
  ["idle:pedido",          { handler: cartAddHandler }],
  ["browsing:pedido",      { handler: cartAddHandler }],
  ["cart:pedido",          { handler: cartAddHandler }],

  // ── Confirmar pedido ──────────────────────────────────────────────────────
  ["cart:confirmar",       { handler: orderCreateHandler }],
  ["checkout:confirmar",   { handler: orderCreateHandler }],

  // ── Cancelar pedido ───────────────────────────────────────────────────────
  ["*:cancelar_pedido",    { handler: orderCancelHandler }],  // custom intent not in classifier
  ["cart:pago",            { handler: orderCreateHandler }],  // "pago" in cart → move to checkout

  // ── Estado del pedido ─────────────────────────────────────────────────────
  ["cart:estado",                       { handler: orderStatusHandler }],
  ["checkout:estado",                   { handler: orderStatusHandler }],
  ["awaiting_payment:estado",           { handler: orderStatusHandler }],
  ["awaiting_payment_capture:estado",   { handler: orderStatusHandler }],
  ["completed:estado",                  { handler: orderStatusHandler }],

  // ── Recomendaciones IA cross-tenant ───────────────────────────────────────
  ["*:recomendar",         { handler: recommendHandler }],

  // ── Escalada a humano ─────────────────────────────────────────────────────
  ["*:humano",             { handler: humanEscalationHandler }],

  // ── Saludo / desconocido → welcome menu ──────────────────────────────────
  ["*:saludo",             { handler: fallbackHandler }],
  ["*:desconocido",        { handler: fallbackHandler }],
]);

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Dispatches the classified intent to the appropriate handler based on
 * (currentState, intent) transition rules. Returns a safe ActionResult.
 */
export async function dispatch(
  ctx: ConversationContext,
  classification: Classification,
): Promise<ActionResult> {
  const currentState: StateKey = extractState(ctx.conversation);
  const intent: IntentKey = classification.intent;

  // Try exact match first, then wildcard
  const exactKey = `${currentState}:${intent}`;
  const wildcardKey = `*:${intent}`;

  const entry = TRANSITIONS.get(exactKey) ?? TRANSITIONS.get(wildcardKey);

  if (!entry) {
    // No matching transition — return welcome menu as safe fallback
    return fallbackHandler(ctx, classification);
  }

  try {
    return await entry.handler(ctx, classification);
  } catch (err) {
    // Handlers must NOT throw — belt-and-suspenders: loguear SIEMPRE (antes el
    // error se tragaba silencioso y el crash del handler era indiagnosticable).
    logger.error("[concierge] handler crash", {
      state: currentState,
      intent: classification.intent,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      reply: formatError(
        "Ocurrió un error interno. Escribe *hola* para volver al menú."
      ),
      newState: currentState,
    };
  }
}
