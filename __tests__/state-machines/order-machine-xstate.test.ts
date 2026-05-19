/**
 * __tests__/state-machines/order-machine-xstate.test.ts
 *
 * Tests del XState machine real (no solo isValidTransition).
 *
 * Cobertura complementaria a order-machine.test.ts:
 *  - Actor real (createActor) recorriendo todos los flujos válidos
 *  - Estado "preparando" (intermedio entre confirmado y en_camino)
 *  - Context updates en transiciones (confirmedBy, cancelReason, etc.)
 *  - Final states (entregado/cancelado no aceptan más eventos)
 */

import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { orderMachine, type OrderContext } from "@/lib/state-machines/order-machine";

const INPUT = { orderId: "order-test-1", tenantId: "tenant-test" };

function start() {
  const actor = createActor(orderMachine, { input: INPUT });
  actor.start();
  return actor;
}

// ─── Estado inicial ───────────────────────────────────────────────────────────

describe("orderMachine — estado inicial", () => {
  it("arranca en 'pendiente'", () => {
    const actor = start();
    expect(actor.getSnapshot().value).toBe("pendiente");
    actor.stop();
  });

  it("context contiene orderId + tenantId del input", () => {
    const actor = start();
    const ctx = actor.getSnapshot().context as OrderContext;
    expect(ctx.orderId).toBe("order-test-1");
    expect(ctx.tenantId).toBe("tenant-test");
    actor.stop();
  });

  it("context arranca sin actores asignados (todos undefined)", () => {
    const actor = start();
    const ctx = actor.getSnapshot().context as OrderContext;
    expect(ctx.confirmedBy).toBeUndefined();
    expect(ctx.dispatchedBy).toBeUndefined();
    expect(ctx.cancelledBy).toBeUndefined();
    actor.stop();
  });
});

// ─── Flow feliz completo: pendiente → confirmado → preparando → en_camino → entregado ──

describe("orderMachine — happy path completo (con preparando intermedio)", () => {
  it("recorre pendiente → confirmado → preparando → en_camino → entregado", () => {
    const actor = start();

    actor.send({ type: "CONFIRM", by: "admin1" });
    expect(actor.getSnapshot().value).toBe("confirmado");

    actor.send({ type: "START_PREP", by: "kitchen-staff" });
    expect(actor.getSnapshot().value).toBe("preparando");

    actor.send({ type: "DISPATCH", by: "rider-3", courier: "Carlos" });
    expect(actor.getSnapshot().value).toBe("en_camino");

    actor.send({ type: "DELIVER", by: "rider-3", proofUrl: "https://photo.jpg" });
    expect(actor.getSnapshot().value).toBe("entregado");

    actor.stop();
  });

  it("shortcut directo: pendiente → confirmado → en_camino (skip preparando)", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "admin1" });
    actor.send({ type: "DISPATCH", by: "rider-1", courier: "Maria" });
    expect(actor.getSnapshot().value).toBe("en_camino");
    actor.stop();
  });
});

// ─── Context updates en transiciones ──────────────────────────────────────────

describe("orderMachine — context updates al transitar", () => {
  it("CONFIRM setea confirmedBy en context", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "supervisor-pucallpa" });
    const ctx = actor.getSnapshot().context as OrderContext;
    expect(ctx.confirmedBy).toBe("supervisor-pucallpa");
    actor.stop();
  });

  it("DISPATCH setea dispatchedBy + dispatchedAt + courier", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "admin" });
    const beforeMs = Date.now();
    actor.send({ type: "DISPATCH", by: "boss", courier: "moto-7" });
    const afterMs = Date.now();

    const ctx = actor.getSnapshot().context as OrderContext;
    expect(ctx.dispatchedBy).toBe("boss");
    expect(ctx.courier).toBe("moto-7");
    expect(ctx.dispatchedAt).toBeDefined();
    const dispatchedMs = new Date(ctx.dispatchedAt!).getTime();
    expect(dispatchedMs).toBeGreaterThanOrEqual(beforeMs);
    expect(dispatchedMs).toBeLessThanOrEqual(afterMs);
    actor.stop();
  });

  it("DELIVER setea deliveredBy + deliveredAt + proofUrl", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "a" });
    actor.send({ type: "DISPATCH", by: "b" });
    actor.send({
      type: "DELIVER",
      by: "rider-X",
      proofUrl: "https://storage/proof.jpg",
    });
    const ctx = actor.getSnapshot().context as OrderContext;
    expect(ctx.deliveredBy).toBe("rider-X");
    expect(ctx.proofUrl).toBe("https://storage/proof.jpg");
    expect(ctx.deliveredAt).toBeDefined();
    actor.stop();
  });

  it("CANCEL setea cancelledBy + cancelledAt + cancelReason", () => {
    const actor = start();
    actor.send({
      type: "CANCEL",
      by: "cliente-994123",
      reason: "Ya no necesito el pedido",
    });
    const ctx = actor.getSnapshot().context as OrderContext;
    expect(ctx.cancelledBy).toBe("cliente-994123");
    expect(ctx.cancelReason).toBe("Ya no necesito el pedido");
    expect(ctx.cancelledAt).toBeDefined();
    actor.stop();
  });

  it("DISPATCH SIN courier: campo courier queda undefined (opcional)", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "a" });
    actor.send({ type: "DISPATCH", by: "b" }); // sin courier
    const ctx = actor.getSnapshot().context as OrderContext;
    expect(ctx.courier).toBeUndefined();
    actor.stop();
  });
});

// ─── Cancelaciones desde distintos estados ────────────────────────────────────

describe("orderMachine — cancelaciones permitidas en cada estado", () => {
  it("CANCEL desde pendiente", () => {
    const actor = start();
    actor.send({ type: "CANCEL", by: "x", reason: "test" });
    expect(actor.getSnapshot().value).toBe("cancelado");
    actor.stop();
  });

  it("CANCEL desde confirmado", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "a" });
    actor.send({ type: "CANCEL", by: "b", reason: "out of stock" });
    expect(actor.getSnapshot().value).toBe("cancelado");
    actor.stop();
  });

  it("CANCEL desde preparando", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "a" });
    actor.send({ type: "START_PREP", by: "kitchen" });
    actor.send({ type: "CANCEL", by: "manager", reason: "cliente arrepentido" });
    expect(actor.getSnapshot().value).toBe("cancelado");
    actor.stop();
  });

  it("CANCEL desde en_camino", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "a" });
    actor.send({ type: "DISPATCH", by: "b" });
    actor.send({ type: "CANCEL", by: "c", reason: "cliente no contesta" });
    expect(actor.getSnapshot().value).toBe("cancelado");
    actor.stop();
  });
});

// ─── Final states: no aceptan eventos ─────────────────────────────────────────

describe("orderMachine — final states son inmutables", () => {
  it("entregado: ignora CANCEL (no transita)", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "a" });
    actor.send({ type: "DISPATCH", by: "b" });
    actor.send({ type: "DELIVER", by: "c" });
    expect(actor.getSnapshot().value).toBe("entregado");

    // Intentar cancelar después de entregado
    actor.send({ type: "CANCEL", by: "x", reason: "no" });
    expect(actor.getSnapshot().value).toBe("entregado"); // sin cambio
    actor.stop();
  });

  it("entregado: ignora CONFIRM/DISPATCH/DELIVER (re-entrant noop)", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "a" });
    actor.send({ type: "DISPATCH", by: "b" });
    actor.send({ type: "DELIVER", by: "c" });

    actor.send({ type: "CONFIRM", by: "x" });
    actor.send({ type: "DISPATCH", by: "x" });
    actor.send({ type: "DELIVER", by: "x" });
    expect(actor.getSnapshot().value).toBe("entregado");
    actor.stop();
  });

  it("cancelado: ignora todos los eventos (inmutable)", () => {
    const actor = start();
    actor.send({ type: "CANCEL", by: "a", reason: "anulado" });
    expect(actor.getSnapshot().value).toBe("cancelado");

    actor.send({ type: "CONFIRM", by: "x" });
    actor.send({ type: "DISPATCH", by: "x" });
    actor.send({ type: "DELIVER", by: "x" });
    expect(actor.getSnapshot().value).toBe("cancelado");
    actor.stop();
  });
});

// ─── Eventos en estado inválido — no transitan ────────────────────────────────

describe("orderMachine — eventos en estado inválido (silent ignore)", () => {
  it("pendiente NO acepta START_PREP (necesita CONFIRM primero)", () => {
    const actor = start();
    actor.send({ type: "START_PREP", by: "x" });
    expect(actor.getSnapshot().value).toBe("pendiente");
    actor.stop();
  });

  it("pendiente NO acepta DELIVER (skip estados)", () => {
    const actor = start();
    actor.send({ type: "DELIVER", by: "x" });
    expect(actor.getSnapshot().value).toBe("pendiente");
    actor.stop();
  });

  it("preparando NO acepta DELIVER directo (necesita DISPATCH primero)", () => {
    const actor = start();
    actor.send({ type: "CONFIRM", by: "a" });
    actor.send({ type: "START_PREP", by: "k" });
    actor.send({ type: "DELIVER", by: "x" });
    expect(actor.getSnapshot().value).toBe("preparando");
    actor.stop();
  });
});

// ─── isValidTransition: cobertura de "preparando" (faltaba en test original) ──

describe("isValidTransition — estado 'preparando' (NUEVO)", () => {
  it("preparando + DISPATCH → válido", async () => {
    const { isValidTransition } = await import("@/lib/state-machines/order-machine");
    expect(isValidTransition("preparando", "DISPATCH")).toBe(true);
  });

  it("preparando + CANCEL → válido", async () => {
    const { isValidTransition } = await import("@/lib/state-machines/order-machine");
    expect(isValidTransition("preparando", "CANCEL")).toBe(true);
  });

  it("preparando + CONFIRM → inválido (ya confirmado)", async () => {
    const { isValidTransition } = await import("@/lib/state-machines/order-machine");
    expect(isValidTransition("preparando", "CONFIRM")).toBe(false);
  });

  it("preparando + DELIVER → inválido (debe DISPATCH primero)", async () => {
    const { isValidTransition } = await import("@/lib/state-machines/order-machine");
    expect(isValidTransition("preparando", "DELIVER")).toBe(false);
  });

  it("confirmado + START_PREP → válido (transición a preparando)", async () => {
    const { isValidTransition } = await import("@/lib/state-machines/order-machine");
    expect(isValidTransition("confirmado", "START_PREP")).toBe(true);
  });
});
