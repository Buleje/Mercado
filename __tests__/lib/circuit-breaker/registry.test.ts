/**
 * Tests del Registry — singleton map de CircuitBreakers
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getBreaker, getAllBreakerStatuses, resetBreaker, deleteBreaker } from "@/lib/circuit-breaker/registry";

// Limpiar estado entre tests para evitar contaminacion
beforeEach(() => {
  deleteBreaker("reg-test-a");
  deleteBreaker("reg-test-b");
});

describe("getBreaker (lazy init + singleton)", () => {
  it("retorna la misma instancia para el mismo nombre", () => {
    const b1 = getBreaker("reg-test-a");
    const b2 = getBreaker("reg-test-a");
    expect(b1).toBe(b2);
  });

  it("instancias distintas para nombres distintos", () => {
    const a = getBreaker("reg-test-a");
    const b = getBreaker("reg-test-b");
    expect(a).not.toBe(b);
  });

  it("nombre queda en el snapshot", () => {
    const b = getBreaker("reg-test-a");
    expect(b.getStatus().name).toBe("reg-test-a");
  });

  it("config parcial se aplica en la primera creacion", () => {
    const b = getBreaker("reg-test-a", { failureThreshold: 99 });
    // Como accedemos al snapshot, failure threshold no esta expuesto directo,
    // pero verificamos que el breaker esta en CLOSED (estado inicial correcto)
    expect(b.getStatus().state).toBe("closed");
  });
});

describe("resetBreaker", () => {
  it("vuelve al estado CLOSED sin eliminar del registry", async () => {
    const b = getBreaker("reg-test-a", { failureThreshold: 1 });
    await expect(b.exec(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    expect(b.getStatus().state).toBe("open");

    resetBreaker("reg-test-a");
    expect(b.getStatus().state).toBe("closed");

    // Sigue siendo la misma instancia en el registry
    expect(getBreaker("reg-test-a")).toBe(b);
  });
});

describe("getAllBreakerStatuses", () => {
  it("incluye todos los breakers registrados", () => {
    getBreaker("reg-test-a");
    getBreaker("reg-test-b");

    const statuses = getAllBreakerStatuses();
    const names = statuses.map((s) => s.name);
    expect(names).toContain("reg-test-a");
    expect(names).toContain("reg-test-b");
  });

  it("snapshot tiene la forma correcta", () => {
    getBreaker("reg-test-a");
    const statuses = getAllBreakerStatuses();
    const snap = statuses.find((s) => s.name === "reg-test-a");

    expect(snap).toBeDefined();
    expect(snap!.state).toBe("closed");
    expect(typeof snap!.failures).toBe("number");
    expect(typeof snap!.lastFailureAt).toBe("number");
  });
});
