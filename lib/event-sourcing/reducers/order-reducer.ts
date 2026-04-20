/**
 * lib/event-sourcing/reducers/order-reducer.ts
 *
 * Demo reducer that reconstructs OrderState from an event stream.
 *
 * Supported event types:
 *  - OrderCreated       → initializes the order
 *  - OrderCancelled     → marks status = "cancelled"
 *  - OrderPaid          → marks status = "paid", records payment reference
 *  - OrderShipped       → marks status = "shipped", records tracking code
 *  - OrderItemAdded     → appends an item
 *  - OrderItemRemoved   → removes an item by productId
 *
 * Unknown event types are silently ignored (open/closed principle):
 * new event types can be added without breaking existing snapshots.
 */

import type { EventLogEntry, EventReducer } from "../types";

// ── State shape ───────────────────────────────────────────────────────────────

export type OrderStatus =
  | "draft"
  | "pending"
  | "paid"
  | "shipped"
  | "cancelled";

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPricePen: number;
}

export interface OrderState {
  orderId: string;
  customerId: string;
  status: OrderStatus;
  totalPen: number;
  items: OrderItem[];
  paymentRef: string | null;
  trackingCode: string | null;
  cancelReason: string | null;
}

// ── Initial state ─────────────────────────────────────────────────────────────

export const INITIAL_ORDER_STATE: OrderState = {
  orderId: "",
  customerId: "",
  status: "draft",
  totalPen: 0,
  items: [],
  paymentRef: null,
  trackingCode: null,
  cancelReason: null,
};

// ── Payload shapes (narrowed from event.payload) ──────────────────────────────

interface OrderCreatedPayload {
  orderId: string;
  customerId: string;
  totalPen: number;
  items?: OrderItem[];
}

interface OrderCancelledPayload {
  reason?: string;
}

interface OrderPaidPayload {
  paymentRef: string;
  totalPen?: number;
}

interface OrderShippedPayload {
  trackingCode: string;
}

interface OrderItemAddedPayload {
  item: OrderItem;
}

interface OrderItemRemovedPayload {
  productId: string;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

/**
 * Pure reducer: returns a NEW OrderState after applying one event.
 * Never mutates the incoming state.
 *
 * @param state   Current state (seed = INITIAL_ORDER_STATE)
 * @param event   EventLogEntry from the store
 * @returns       Next state
 */
export const orderReducer: EventReducer<OrderState> = (
  state: OrderState,
  event: EventLogEntry,
): OrderState => {
  switch (event.eventType) {
    case "OrderCreated": {
      const p = event.payload as unknown as OrderCreatedPayload;
      return {
        ...state,
        orderId: p.orderId,
        customerId: p.customerId,
        totalPen: p.totalPen,
        status: "pending",
        items: p.items ?? [],
      };
    }

    case "OrderCancelled": {
      const p = event.payload as unknown as OrderCancelledPayload;
      return {
        ...state,
        status: "cancelled",
        cancelReason: p.reason ?? null,
      };
    }

    case "OrderPaid": {
      const p = event.payload as unknown as OrderPaidPayload;
      return {
        ...state,
        status: "paid",
        paymentRef: p.paymentRef,
        totalPen: p.totalPen ?? state.totalPen,
      };
    }

    case "OrderShipped": {
      const p = event.payload as unknown as OrderShippedPayload;
      return {
        ...state,
        status: "shipped",
        trackingCode: p.trackingCode,
      };
    }

    case "OrderItemAdded": {
      const p = event.payload as unknown as OrderItemAddedPayload;
      return {
        ...state,
        items: [...state.items, p.item],
      };
    }

    case "OrderItemRemoved": {
      const p = event.payload as unknown as OrderItemRemovedPayload;
      return {
        ...state,
        items: state.items.filter((i) => i.productId !== p.productId),
      };
    }

    default:
      // Unknown event — return state unchanged (forward-compatibility)
      return state;
  }
};
