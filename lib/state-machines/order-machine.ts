/**
 * lib/state-machines/order-machine.ts
 *
 * ADR-045 — State machine explícita para Order (XState v5).
 *
 * Estados canónicos (coinciden con OrderStatus en lib/db/misc.db.ts):
 *   pendiente → confirmado → en_camino → entregado
 *                  ↘           ↘           ↘
 *                 cancelado   cancelado  (terminal)
 *
 * Por qué XState:
 *   - La state machine actual de Order está IMPLÍCITA en lib/db/orders.db.ts
 *     (condicionales sueltos + updates sin guardas). Esto causa bugs invisibles:
 *     pedidos que saltan estados, cancelaciones sobre entregados, race conditions.
 *   - XState hace las transiciones DECLARATIVAS, testables y visualizables
 *     (https://stately.ai/viz).
 *
 * Integración sugerida (en otro sprint):
 *   1. OrdersDB.updateStatus(tenantId, orderId, event) → interpret(orderMachine)
 *   2. Rechazar cualquier transición que no esté en la máquina (fail-loud)
 *   3. Emitir ActivityLog con el evento + from/to para audit trail
 *   4. Tests: 1 por transición válida + 1 por transición inválida
 *
 * Este archivo define la máquina SIN tocar orders.db.ts. Es un módulo paralelo
 * que puede adoptarse incrementalmente.
 *
 * Dependencia: npm i xstate (v5+)
 */

import { createMachine } from "xstate";

// ── Tipos ─────────────────────────────────────────────────────────────────

export type OrderEvent =
  | { type: "CONFIRM"; by: string }
  | { type: "START_PREP"; by: string }
  | { type: "DISPATCH"; by: string; courier?: string }
  | { type: "DELIVER"; by: string; proofUrl?: string }
  | { type: "CANCEL"; by: string; reason: string };

export interface OrderContext {
  orderId: string;
  tenantId: string;
  confirmedBy?: string;
  dispatchedBy?: string;
  dispatchedAt?: string;
  courier?: string;
  deliveredBy?: string;
  deliveredAt?: string;
  proofUrl?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

// ── Máquina ───────────────────────────────────────────────────────────────

export const orderMachine = createMachine({
  id: "order",
  initial: "pendiente",
  types: {} as {
    context: OrderContext;
    events: OrderEvent;
  },
  context: ({ input }: { input: Pick<OrderContext, "orderId" | "tenantId"> }) => ({
    orderId: input.orderId,
    tenantId: input.tenantId,
  }),
  states: {
    pendiente: {
      on: {
        CONFIRM: {
          target: "confirmado",
          actions: ({ context, event }) => {
            context.confirmedBy = event.by;
          },
        },
        CANCEL: {
          target: "cancelado",
          actions: ({ context, event }) => {
            context.cancelledBy = event.by;
            context.cancelledAt = new Date().toISOString();
            context.cancelReason = event.reason;
          },
        },
      },
    },
    confirmado: {
      on: {
        START_PREP: {
          target: "preparando",
          actions: () => {
            // Transición declarativa: confirmado → preparando.
          },
        },
        DISPATCH: {
          // Permitido saltar preparando si el dueño asigna delivery directamente
          target: "en_camino",
          actions: ({ context, event }) => {
            context.dispatchedBy = event.by;
            context.dispatchedAt = new Date().toISOString();
            context.courier = event.courier;
          },
        },
        CANCEL: {
          target: "cancelado",
          actions: ({ context, event }) => {
            context.cancelledBy = event.by;
            context.cancelledAt = new Date().toISOString();
            context.cancelReason = event.reason;
          },
        },
      },
    },
    preparando: {
      on: {
        DISPATCH: {
          target: "en_camino",
          actions: ({ context, event }) => {
            context.dispatchedBy = event.by;
            context.dispatchedAt = new Date().toISOString();
            context.courier = event.courier;
          },
        },
        CANCEL: {
          target: "cancelado",
          actions: ({ context, event }) => {
            context.cancelledBy = event.by;
            context.cancelledAt = new Date().toISOString();
            context.cancelReason = event.reason;
          },
        },
      },
    },
    en_camino: {
      on: {
        DELIVER: {
          target: "entregado",
          actions: ({ context, event }) => {
            context.deliveredBy = event.by;
            context.deliveredAt = new Date().toISOString();
            context.proofUrl = event.proofUrl;
          },
        },
        CANCEL: {
          // Permitido hasta que esté "entregado" — devuelve a pendiente con motivo
          target: "cancelado",
          actions: ({ context, event }) => {
            context.cancelledBy = event.by;
            context.cancelledAt = new Date().toISOString();
            context.cancelReason = event.reason;
          },
        },
      },
    },
    entregado: {
      type: "final",
    },
    cancelado: {
      type: "final",
    },
  },
});

export type OrderState =
  | "pendiente"
  | "confirmado"
  | "preparando"
  | "en_camino"
  | "entregado"
  | "cancelado";

/**
 * Validador puro: ¿es legal transitar `from` → `to` con este evento?
 * Úsalo antes de hacer el UPDATE en lib/db/orders.db.ts para fail-loud.
 */
export function isValidTransition(
  from: OrderState,
  event: OrderEvent["type"],
): boolean {
  const transitions: Record<OrderState, Partial<Record<OrderEvent["type"], OrderState>>> = {
    pendiente: { CONFIRM: "confirmado", CANCEL: "cancelado" },
    confirmado: {
      START_PREP: "preparando",
      DISPATCH: "en_camino", // shortcut: dueño puede asignar delivery directo
      CANCEL: "cancelado",
    },
    preparando: { DISPATCH: "en_camino", CANCEL: "cancelado" },
    en_camino: { DELIVER: "entregado", CANCEL: "cancelado" },
    entregado: {},
    cancelado: {},
  };
  return Boolean(transitions[from][event]);
}

/**
 * Helper: valida una transición o lanza con mensaje descriptivo.
 * Uso: assertTransition("entregado", "CANCEL") → throws
 */
export function assertTransition(
  from: OrderState,
  event: OrderEvent["type"],
): void {
  if (!isValidTransition(from, event)) {
    throw new Error(
      `[order-machine] Transición inválida: ${from} + ${event}. ` +
        `Revisa la máquina en lib/state-machines/order-machine.ts`,
    );
  }
}
