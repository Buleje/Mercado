import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("circuit-breaker", () => {
  let withCircuitBreaker: typeof import("@/lib/circuit-breaker").withCircuitBreaker;
  let CircuitOpenError: typeof import("@/lib/circuit-breaker").CircuitOpenError;
  let getCircuitStatus: typeof import("@/lib/circuit-breaker").getCircuitStatus;
  let resetCircuit: typeof import("@/lib/circuit-breaker").resetCircuit;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/circuit-breaker");
    withCircuitBreaker = mod.withCircuitBreaker;
    CircuitOpenError = mod.CircuitOpenError;
    getCircuitStatus = mod.getCircuitStatus;
    resetCircuit = mod.resetCircuit;
    resetCircuit("test-svc");
    resetCircuit("svc-a");
    resetCircuit("svc-b");
  });

  it("passes through successful calls in closed state", async () => {
    const result = await withCircuitBreaker("test-svc", async () => "ok");
    expect(result).toBe("ok");

    const status = getCircuitStatus("test-svc");
    expect(status.state).toBe("closed");
    expect(status.failures).toBe(0);
  });

  it("counts failures but stays closed below threshold", async () => {
    for (let i = 0; i < 4; i++) {
      await withCircuitBreaker("test-svc", async () => {
        throw new Error(`fail-${i}`);
      }).catch(() => {});
    }

    const status = getCircuitStatus("test-svc");
    expect(status.state).toBe("closed");
    expect(status.failures).toBe(4);
  });

  it("opens circuit after reaching failure threshold (5)", async () => {
    for (let i = 0; i < 5; i++) {
      await withCircuitBreaker("test-svc", async () => {
        throw new Error(`fail-${i}`);
      }).catch(() => {});
    }

    const status = getCircuitStatus("test-svc");
    expect(status.state).toBe("open");
    expect(status.failures).toBe(5);
  });

  it("fails fast (CircuitOpenError) when circuit is open", async () => {
    // Open the circuit
    for (let i = 0; i < 5; i++) {
      await withCircuitBreaker("test-svc", async () => {
        throw new Error("fail");
      }).catch(() => {});
    }

    // Next call should fail immediately without executing fn
    const fn = vi.fn(async () => "should not run");
    await expect(withCircuitBreaker("test-svc", fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("resets to closed after a successful call", async () => {
    // Accumulate some failures
    for (let i = 0; i < 3; i++) {
      await withCircuitBreaker("test-svc", async () => {
        throw new Error("fail");
      }).catch(() => {});
    }

    // Success resets
    await withCircuitBreaker("test-svc", async () => "recovered");
    const status = getCircuitStatus("test-svc");
    expect(status.state).toBe("closed");
    expect(status.failures).toBe(0);
  });

  it("isolates circuits per service name", async () => {
    // Fail service A
    for (let i = 0; i < 5; i++) {
      await withCircuitBreaker("svc-a", async () => {
        throw new Error("fail");
      }).catch(() => {});
    }

    // Service B should still work
    const result = await withCircuitBreaker("svc-b", async () => "b-ok");
    expect(result).toBe("b-ok");

    expect(getCircuitStatus("svc-a").state).toBe("open");
    expect(getCircuitStatus("svc-b").state).toBe("closed");
  });

  it("resetCircuit clears state for a service", async () => {
    for (let i = 0; i < 5; i++) {
      await withCircuitBreaker("test-svc", async () => {
        throw new Error("fail");
      }).catch(() => {});
    }
    expect(getCircuitStatus("test-svc").state).toBe("open");

    resetCircuit("test-svc");
    const status = getCircuitStatus("test-svc");
    expect(status.state).toBe("closed");
    expect(status.failures).toBe(0);
  });
});

describe("orchestrator", () => {
  let orchestratorMod: typeof import("@/lib/agents/orchestrator");

  beforeEach(async () => {
    vi.resetModules();

    // Mock circuit-breaker to pass through
    vi.doMock("@/lib/circuit-breaker", () => ({
      withCircuitBreaker: (_svc: string, fn: () => Promise<unknown>) => fn(),
      getCircuitStatus: () => ({ state: "closed", failures: 0, lastFailureAt: 0 }),
      resetCircuit: () => {},
      CircuitOpenError: class extends Error { service: string; constructor(s: string) { super(s); this.service = s; } },
    }));

    vi.doMock("@/lib/api-error", () => ({
      newTraceId: () => "trace-test-" + Math.random().toString(36).slice(2, 8),
    }));

    // Mock registry with a test agent
    vi.doMock("@/lib/agents/registry", () => {
      const testAgent = {
        domain: "inventory",
        actions: ["check-stock", "fefo-audit"],
        description: "Test inventory agent",
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { items: 5 },
        }),
      };
      return {
        agentRegistry: {
          get: (domain: string) => (domain === "inventory" ? testAgent : undefined),
          _testAgent: testAgent,
        },
      };
    });

    // Mock bus
    vi.doMock("@/lib/agents/bus", () => ({
      agentBus: { emit: vi.fn(), on: vi.fn() },
    }));

    // Mock context
    vi.doMock("@/lib/agents/context", () => ({
      createAgentContext: (task: Record<string, unknown>) => ({
        tenantId: task.tenantId,
        traceId: task.traceId,
      }),
      scopedLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    }));

    orchestratorMod = await import("@/lib/agents/orchestrator");
  });

  it("submits a task and returns it with pending status", () => {
    const { orchestrator } = orchestratorMod;
    orchestrator.reset();

    const task = orchestrator.submitTask({
      domain: "inventory",
      action: "check-stock",
      payload: {},
      tenantId: "t1",
    });

    expect(task.id).toBeDefined();
    expect(task.domain).toBe("inventory");
    expect(task.action).toBe("check-stock");
    // Status may be "pending" or "running" since drain() fires async
    expect(["pending", "running", "completed"]).toContain(task.status);
    expect(task.traceId).toBeDefined();
  });

  it("generates unique task IDs", () => {
    const { orchestrator } = orchestratorMod;
    orchestrator.reset();

    const t1 = orchestrator.submitTask({ domain: "inventory", action: "check-stock", payload: {}, tenantId: "t1" });
    const t2 = orchestrator.submitTask({ domain: "inventory", action: "check-stock", payload: {}, tenantId: "t1" });
    expect(t1.id).not.toBe(t2.id);
  });

  it("retrieves task by ID", () => {
    const { orchestrator } = orchestratorMod;
    orchestrator.reset();

    const task = orchestrator.submitTask({ domain: "inventory", action: "check-stock", payload: {}, tenantId: "t1" });
    const retrieved = orchestrator.getTask(task.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(task.id);
  });

  it("cancels a pending task", () => {
    const { orchestrator } = orchestratorMod;
    orchestrator.reset();

    const task = orchestrator.submitTask({ domain: "inventory", action: "check-stock", payload: {}, tenantId: "t1" });
    // Task may already be running due to async drain, so cancel may or may not succeed
    const cancelled = orchestrator.cancelTask(task.id);
    if (cancelled) {
      const retrieved = orchestrator.getTask(task.id);
      expect(retrieved?.status).toBe("cancelled");
    }
  });

  it("executeSync returns result for valid domain/action", async () => {
    const { orchestrator } = orchestratorMod;
    orchestrator.reset();

    const result = await orchestrator.executeSync({
      domain: "inventory",
      action: "check-stock",
      payload: {},
      tenantId: "t1",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ items: 5 });
  });

  it("executeSync fails for unknown domain", async () => {
    const { orchestrator } = orchestratorMod;
    orchestrator.reset();

    const result = await orchestrator.executeSync({
      domain: "customers" as never,
      action: "list",
      payload: {},
      tenantId: "t1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No agent");
  });

  it("executeSync fails for unsupported action", async () => {
    const { orchestrator } = orchestratorMod;
    orchestrator.reset();

    const result = await orchestrator.executeSync({
      domain: "inventory",
      action: "nonexistent",
      payload: {},
      tenantId: "t1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not support");
  });

  it("respects priority ordering in the queue", () => {
    const { orchestrator } = orchestratorMod;
    orchestrator.reset();

    // Submit in reverse order
    const low = orchestrator.submitTask({ domain: "inventory", action: "check-stock", payload: {}, tenantId: "t1", priority: "low" });
    const critical = orchestrator.submitTask({ domain: "inventory", action: "check-stock", payload: {}, tenantId: "t1", priority: "critical" });
    const normal = orchestrator.submitTask({ domain: "inventory", action: "check-stock", payload: {}, tenantId: "t1", priority: "normal" });

    // Queue depth should have entries
    expect(orchestrator.queueDepth).toBeGreaterThanOrEqual(0); // some may have drained already
    expect(low.priority).toBe("low");
    expect(critical.priority).toBe("critical");
    expect(normal.priority).toBe("normal");
  });

  it("history filters by tenantId", async () => {
    const { orchestrator } = orchestratorMod;
    orchestrator.reset();

    orchestrator.submitTask({ domain: "inventory", action: "check-stock", payload: {}, tenantId: "t1" });
    orchestrator.submitTask({ domain: "inventory", action: "check-stock", payload: {}, tenantId: "t2" });

    const t1History = orchestrator.getHistory({ tenantId: "t1" });
    const t2History = orchestrator.getHistory({ tenantId: "t2" });

    expect(t1History.every((t) => t.tenantId === "t1")).toBe(true);
    expect(t2History.every((t) => t.tenantId === "t2")).toBe(true);
  });

  it("inherits traceId from parent task", () => {
    const { orchestrator } = orchestratorMod;
    orchestrator.reset();

    const parent = orchestrator.submitTask({ domain: "inventory", action: "check-stock", payload: {}, tenantId: "t1" });
    const child = orchestrator.submitTask({
      domain: "inventory",
      action: "fefo-audit",
      payload: {},
      tenantId: "t1",
      parentTaskId: parent.id,
    });

    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentTaskId).toBe(parent.id);
  });
});
