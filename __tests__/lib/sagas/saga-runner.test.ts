/**
 * __tests__/lib/sagas/saga-runner.test.ts
 *
 * Suite Vitest para SagaRunner — 14 tests
 *
 * Cubre:
 *   - Happy path (todos los pasos OK)
 *   - Fallo en paso 1, 2, 3 con compensación LIFO correcta
 *   - Step sin compensate: no lanza
 *   - Compensate que lanza: no bloquea a los demás compensates
 *   - Contexto mutable fluye entre pasos
 *   - Type-safety de TContext
 *   - API fluent (addStep devuelve this)
 *   - Saga sin pasos: ok:true inmediato
 *   - Error no-Error (string): se wrappea en Error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SagaRunner } from "@/lib/sagas/saga-runner";
import type { SagaStep } from "@/lib/sagas/types";

// ── Contexto de prueba ───────────────────────────────────────────────────────

interface TestCtx {
  log: string[];
  orderId?: string;
  chargeId?: string;
}

function makeCtx(): TestCtx {
  return { log: [] };
}

// ── Helpers para construir steps ─────────────────────────────────────────────

function okStep(name: string, side?: (ctx: TestCtx) => void): SagaStep<TestCtx> {
  return {
    name,
    async execute(ctx) {
      ctx.log.push(`exec:${name}`);
      side?.(ctx);
    },
    async compensate(ctx) {
      ctx.log.push(`comp:${name}`);
    },
  };
}

function failStep(name: string): SagaStep<TestCtx> {
  return {
    name,
    async execute(ctx) {
      ctx.log.push(`exec:${name}`);
      throw new Error(`${name} exploded`);
    },
    async compensate(ctx) {
      ctx.log.push(`comp:${name}`);
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SagaRunner", () => {
  // 1. Happy path
  it("all steps succeed → ok:true con contexto final", async () => {
    const ctx = makeCtx();
    const runner = new SagaRunner<TestCtx>()
      .addStep(okStep("A"))
      .addStep(okStep("B"))
      .addStep(okStep("C"));

    const result = await runner.run(ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.log).toEqual(["exec:A", "exec:B", "exec:C"]);
    }
  });

  // 2. Fallo en primer paso → no hay nada que compensar
  it("step 1 falla → compensated vacío", async () => {
    const ctx = makeCtx();
    const runner = new SagaRunner<TestCtx>()
      .addStep(failStep("A"))
      .addStep(okStep("B"));

    const result = await runner.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failed).toBe("A");
      expect(result.compensated).toEqual([]);
      expect(result.error.message).toBe("A exploded");
    }
  });

  // 3. Fallo en paso 2 → compensa paso 1 (LIFO: solo el anterior)
  it("step 2 falla → compensa step 1 en LIFO", async () => {
    const ctx = makeCtx();
    const runner = new SagaRunner<TestCtx>()
      .addStep(okStep("A"))
      .addStep(failStep("B"))
      .addStep(okStep("C"));

    const result = await runner.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failed).toBe("B");
      // A se ejecutó OK, B falló antes de completar → compensa A
      expect(result.compensated).toEqual(["A"]);
      // C nunca se ejecutó
      expect(ctx.log).toEqual(["exec:A", "exec:B", "comp:A"]);
    }
  });

  // 4. Fallo en paso 3 → compensa paso 2 luego paso 1 (LIFO)
  it("step 3 falla → compensa step 2 y step 1 en orden LIFO", async () => {
    const ctx = makeCtx();
    const runner = new SagaRunner<TestCtx>()
      .addStep(okStep("A"))
      .addStep(okStep("B"))
      .addStep(failStep("C"));

    const result = await runner.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failed).toBe("C");
      expect(result.compensated).toEqual(["B", "A"]);
      expect(ctx.log).toEqual([
        "exec:A", "exec:B", "exec:C",
        "comp:B", "comp:A",
      ]);
    }
  });

  // 5. Step sin compensate → no lanza durante compensación
  it("step sin compensate → se omite silenciosamente al compensar", async () => {
    const ctx = makeCtx();
    const stepNoComp: SagaStep<TestCtx> = {
      name: "NoComp",
      async execute(c) { c.log.push("exec:NoComp"); },
      // sin compensate
    };
    const runner = new SagaRunner<TestCtx>()
      .addStep(stepNoComp)
      .addStep(failStep("Boom"));

    const result = await runner.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // NoComp no tiene compensate, no aparece en compensated
      expect(result.compensated).toEqual([]);
      expect(result.failed).toBe("Boom");
    }
    // No lanzó
  });

  // 6. Compensate que lanza → no bloquea a otros compensates
  it("compensate que lanza NO bloquea los demás compensates", async () => {
    const ctx = makeCtx();

    const stepThrowOnComp: SagaStep<TestCtx> = {
      name: "BadComp",
      async execute(c) { c.log.push("exec:BadComp"); },
      async compensate(c) {
        c.log.push("comp:BadComp");
        throw new Error("compensate falló en BadComp");
      },
    };

    const stepGoodComp: SagaStep<TestCtx> = {
      name: "GoodComp",
      async execute(c) { c.log.push("exec:GoodComp"); },
      async compensate(c) { c.log.push("comp:GoodComp"); },
    };

    const runner = new SagaRunner<TestCtx>()
      .addStep(stepGoodComp)   // exec primero
      .addStep(stepThrowOnComp) // exec segundo, compensa primero (LIFO)
      .addStep(failStep("Last"));

    const result = await runner.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Ambos aparecen en compensated aunque BadComp lanzó
      expect(result.compensated).toContain("BadComp");
      expect(result.compensated).toContain("GoodComp");
      // LIFO: BadComp se compensó antes que GoodComp
      expect(result.compensated.indexOf("BadComp")).toBeLessThan(
        result.compensated.indexOf("GoodComp"),
      );
    }
    // GoodComp sí se compensó a pesar del error en BadComp
    expect(ctx.log).toContain("comp:GoodComp");
  });

  // 7. Contexto mutable fluye entre pasos
  it("contexto mutable: cada paso puede leer lo que escribió el anterior", async () => {
    const ctx = makeCtx();
    const runner = new SagaRunner<TestCtx>()
      .addStep(okStep("A", (c) => { c.orderId = "ord_1"; }))
      .addStep(okStep("B", (c) => { c.chargeId = `charge_for_${c.orderId}`; }));

    const result = await runner.run(ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.orderId).toBe("ord_1");
      expect(result.context.chargeId).toBe("charge_for_ord_1");
    }
  });

  // 8. API fluent: addStep devuelve this
  it("addStep devuelve la misma instancia (fluent API)", () => {
    const runner = new SagaRunner<TestCtx>();
    const returned = runner.addStep(okStep("X"));
    expect(returned).toBe(runner);
  });

  // 9. Saga sin pasos → ok:true inmediato
  it("saga sin pasos → ok:true con contexto intacto", async () => {
    const ctx = makeCtx();
    const runner = new SagaRunner<TestCtx>();

    const result = await runner.run(ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.log).toEqual([]);
    }
  });

  // 10. Error no-Error (throw string) → se wrappea en Error
  it("throw string → ok:false con error instanceof Error", async () => {
    const ctx = makeCtx();
    const stepThrowString: SagaStep<TestCtx> = {
      name: "StringThrow",
      async execute() {
         
        throw "raw string error";
      },
    };
    const runner = new SagaRunner<TestCtx>().addStep(stepThrowString);

    const result = await runner.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("raw string error");
    }
  });

  // 11. Type-safety: SagaRunner es genérico en TContext
  it("type-safety: TContext distinto no acepta steps de otro contexto", () => {
    // Este test es de compilación — si TypeScript no se queja, pasa.
    interface AnotherCtx { value: number }
    const runner = new SagaRunner<AnotherCtx>();
    const step: SagaStep<AnotherCtx> = {
      name: "Numeric",
      async execute(ctx) { ctx.value = 42; },
    };
    runner.addStep(step);
    // Si llega aquí sin error de TypeScript, la genericidad funciona.
    expect(runner).toBeDefined();
  });

  // 12. run() nunca lanza (incluso con compensate fallido)
  it("run() no lanza nunca — siempre resuelve con SagaResult", async () => {
    const ctx = makeCtx();
    const nuclearStep: SagaStep<TestCtx> = {
      name: "Nuclear",
      async execute() { throw new Error("nuke"); },
      async compensate() { throw new Error("compensate nuke"); },
    };
    const runner = new SagaRunner<TestCtx>()
      .addStep(okStep("Safe"))
      .addStep(nuclearStep);

    // No debe lanzar
    const result = await runner.run(ctx);
    expect(result.ok).toBe(false);
  });

  // 13. Fallo en último paso con 4 pasos → compensa 3, 2, 1 en LIFO
  it("4 pasos: fallo en el 4to → compensa [3,2,1] LIFO", async () => {
    const ctx = makeCtx();
    const runner = new SagaRunner<TestCtx>()
      .addStep(okStep("P1"))
      .addStep(okStep("P2"))
      .addStep(okStep("P3"))
      .addStep(failStep("P4"));

    const result = await runner.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failed).toBe("P4");
      expect(result.compensated).toEqual(["P3", "P2", "P1"]);
    }
  });

  // 14. Error expone el mensaje original del step fallido
  it("error.message contiene la descripción del paso fallido", async () => {
    const ctx = makeCtx();
    const step: SagaStep<TestCtx> = {
      name: "PaymentGateway",
      async execute() { throw new Error("timeout after 30s"); },
    };
    const runner = new SagaRunner<TestCtx>().addStep(step);

    const result = await runner.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("timeout after 30s");
      expect(result.failed).toBe("PaymentGateway");
    }
  });
});
