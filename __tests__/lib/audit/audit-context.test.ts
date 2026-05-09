/**
 * Tests del helper AsyncLocalStorage para audit context (Ley 29733).
 *
 * Valida que getAuditContext() retorne el IP+userId+requestId propagados
 * desde runWithAuditContext, incluso a través de múltiples niveles de
 * funciones async anidadas (que es como llega a la extension Prisma).
 */
import { describe, it, expect } from "vitest";
import {
  runWithAuditContext,
  withAuditContext,
  getAuditContext,
} from "@/lib/audit/audit-context";

function buildReq(headers: Record<string, string>) {
  return {
    headers: {
      get: (n: string) => headers[n.toLowerCase()] ?? null,
    },
  };
}

describe("audit-context", () => {
  it("getAuditContext devuelve null fuera de un wrapper", () => {
    expect(getAuditContext()).toBeNull();
  });

  it("runWithAuditContext propaga IP desde X-Forwarded-For", async () => {
    const req = buildReq({ "x-forwarded-for": "192.168.1.42" });
    let captured: ReturnType<typeof getAuditContext> = null;

    await runWithAuditContext(req, "user-A", async () => {
      captured = getAuditContext();
    });

    expect(captured).not.toBeNull();
    expect(captured!.ipAddress).toBe("192.168.1.42");
    expect(captured!.userId).toBe("user-A");
    expect(captured!.requestId).toBeNull();
  });

  it("propaga IP a través de múltiples niveles async (la situación real de Prisma extension)", async () => {
    const req = buildReq({
      "x-forwarded-for": "10.0.0.1",
      "x-request-id": "req-xyz",
    });

    let deeplyCaptured: ReturnType<typeof getAuditContext> = null;

    async function level3() {
      deeplyCaptured = getAuditContext();
    }
    async function level2() {
      await Promise.resolve();
      await level3();
    }
    async function level1() {
      await Promise.resolve();
      await level2();
    }

    await runWithAuditContext(req, "deep-user", () => level1());

    expect(deeplyCaptured).not.toBeNull();
    expect(deeplyCaptured!.ipAddress).toBe("10.0.0.1");
    expect(deeplyCaptured!.userId).toBe("deep-user");
    expect(deeplyCaptured!.requestId).toBe("req-xyz");
  });

  it("contextos paralelos no se mezclan", async () => {
    const reqA = buildReq({ "x-forwarded-for": "1.1.1.1" });
    const reqB = buildReq({ "x-forwarded-for": "2.2.2.2" });

    const [a, b] = await Promise.all([
      runWithAuditContext(reqA, "user-A", async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getAuditContext()?.ipAddress ?? null;
      }),
      runWithAuditContext(reqB, "user-B", async () => {
        await new Promise((r) => setTimeout(r, 2));
        return getAuditContext()?.ipAddress ?? null;
      }),
    ]);

    expect(a).toBe("1.1.1.1");
    expect(b).toBe("2.2.2.2");
  });

  it("withAuditContext funciona con ctx pre-armado (cron jobs)", async () => {
    let captured: ReturnType<typeof getAuditContext> = null;

    await withAuditContext(
      { ipAddress: null, userId: "cron", requestId: "cron-12345" },
      async () => {
        captured = getAuditContext();
      },
    );

    expect(captured).toEqual({
      ipAddress: null,
      userId: "cron",
      requestId: "cron-12345",
    });
  });
});
