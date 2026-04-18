/**
 * lib/db/socio-buleje.db.ts — unit tests (ADR-078)
 *
 * Cobertura:
 *   1. earnCashback — suma al balance previo y snapshot correcto.
 *   2. redeemCashback — falla si balance insuficiente.
 *   3. redeemCashback — no permite en status cancelled/paused/past_due.
 *   4. Ledger consistency: balanceAfter[n] === sum(amount[0..n]).
 *   5. subscribe — primera vez crea trial + cycle waived (S/0).
 *   6. subscribe — reactivación crea cycle pending (S/19 o S/189).
 *   7. cancel — default marca cancelAtPeriodEnd; immediate marca cancelled.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => undefined),
}));
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidateByPrefix: vi.fn(),
  invalidate: vi.fn(),
}));

// ── Mock Prisma ──────────────────────────────────────────────────────────────

type Entry = {
  id: string;
  membershipId: string;
  tenantId: string;
  userId: string;
  orderId: string | null;
  type: "earned" | "redeemed" | "expired" | "bonus" | "adjustment";
  amountSoles: number;
  description: string;
  balanceAfter: number;
  createdAt: Date;
};

type Membership = {
  id: string;
  tenantId: string;
  userId: string;
  plan: "monthly" | "annual";
  status: "trial" | "active" | "past_due" | "paused" | "cancelled";
  startedAt: Date;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type TestStoreShape = {
  memberships: Membership[];
  cycles: unknown[];
  entries: Entry[];
};

const { mockPrisma } = vi.hoisted(() => {
  const state = { memberships: [] as Membership[], cycles: [] as unknown[], entries: [] as Entry[] };
  // @ts-expect-error — expose state for test reset
  globalThis.__socioTestState = state;
  return {
    mockPrisma: {
      socioMembership: {
        findUnique: vi.fn(
          async (args: { where: { tenantId_userId: { tenantId: string; userId: string } } }) =>
            state.memberships.find(
              (m) =>
                m.tenantId === args.where.tenantId_userId.tenantId &&
                m.userId === args.where.tenantId_userId.userId,
            ) ?? null,
        ),
        findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
          const w = args.where;
          return (
            state.memberships.find(
              (m) =>
                (w.id ? m.id === w.id : true) && (w.tenantId ? m.tenantId === w.tenantId : true),
            ) ?? null
          );
        }),
        findMany: vi.fn(async () => state.memberships),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const m: Membership = {
            id: `mem_${state.memberships.length + 1}`,
            tenantId: args.data.tenantId as string,
            userId: args.data.userId as string,
            plan: args.data.plan as "monthly" | "annual",
            status: args.data.status as Membership["status"],
            startedAt: (args.data.startedAt as Date) ?? new Date(),
            currentPeriodEnd: args.data.currentPeriodEnd as Date,
            trialEndsAt: (args.data.trialEndsAt as Date) ?? null,
            cancelledAt: null,
            cancelReason: null,
            cancelAtPeriodEnd: (args.data.cancelAtPeriodEnd as boolean) ?? false,
            autoRenew: (args.data.autoRenew as boolean) ?? true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          state.memberships.push(m);
          return m;
        }),
        update: vi.fn(
          async (args: {
            where: { tenantId_userId: { tenantId: string; userId: string } };
            data: Partial<Membership>;
          }) => {
            const idx = state.memberships.findIndex(
              (m) =>
                m.tenantId === args.where.tenantId_userId.tenantId &&
                m.userId === args.where.tenantId_userId.userId,
            );
            if (idx === -1) throw new Error("not found");
            state.memberships[idx] = {
              ...state.memberships[idx],
              ...args.data,
              updatedAt: new Date(),
            };
            return state.memberships[idx];
          },
        ),
        count: vi.fn(async () => state.memberships.length),
        groupBy: vi.fn(async () => [
          { status: "active", _count: { _all: state.memberships.filter((m) => m.status === "active").length } },
          { status: "trial", _count: { _all: state.memberships.filter((m) => m.status === "trial").length } },
        ]),
      },
      socioBillingCycle: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const c = { id: `cyc_${state.cycles.length + 1}`, ...args.data, createdAt: new Date() };
          state.cycles.push(c);
          return c;
        }),
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => state.cycles),
        aggregate: vi.fn(async () => ({ _sum: { amountSoles: 0 } })),
        groupBy: vi.fn(async () => []),
      },
      socioCashbackEntry: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          // Usar microsegundos monotónicos para evitar ties de createdAt.
          const now = new Date(Date.now() + state.entries.length);
          const e: Entry = {
            id: `ent_${state.entries.length + 1}`,
            membershipId: args.data.membershipId as string,
            tenantId: args.data.tenantId as string,
            userId: args.data.userId as string,
            orderId: (args.data.orderId as string) ?? null,
            type: args.data.type as Entry["type"],
            amountSoles: args.data.amountSoles as number,
            description: args.data.description as string,
            balanceAfter: args.data.balanceAfter as number,
            createdAt: (args.data.createdAt as Date) ?? now,
          };
          state.entries.push(e);
          return e;
        }),
        findFirst: vi.fn(
          async (args: {
            where: { tenantId: string; userId: string };
            orderBy?: unknown;
            select?: unknown;
          }) => {
            // Ultima entry insertada para ese (tenant,user) — equivalente a ORDER BY createdAt DESC.
            for (let i = state.entries.length - 1; i >= 0; i -= 1) {
              const e = state.entries[i];
              if (e.tenantId === args.where.tenantId && e.userId === args.where.userId) {
                return e;
              }
            }
            return null;
          },
        ),
        findMany: vi.fn(async () => state.entries),
        groupBy: vi.fn(async () => []),
      },
      // Raw queries.
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const s = strings.join("?");
        if (s.includes("FOR UPDATE")) {
          const [tenantId, userId] = values as [string, string];
          const m = state.memberships.find(
            (m) => m.tenantId === tenantId && m.userId === userId,
          );
          return m ? [{ id: m.id, status: m.status }] : [];
        }
        // stats liability query
        return [{ total: "0" }];
      }),
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockPrisma),
      ),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { SocioBulejeDB, SocioInsufficientBalanceError, SocioInactiveError } from "@/lib/db/socio-buleje.db";

const TENANT = "tenant-test";
const USER = "user-1";

beforeEach(() => {
  // @ts-expect-error — read the hoisted state
  const s = globalThis.__socioTestState as TestStoreShape;
  s.memberships.length = 0;
  s.cycles.length = 0;
  s.entries.length = 0;
  vi.clearAllMocks();
});

// Helpers to seed state
function seedActiveMembership(): Membership {
  // @ts-expect-error — read the hoisted state
  const s = globalThis.__socioTestState as TestStoreShape;
  const m: Membership = {
    id: "mem_1",
    tenantId: TENANT,
    userId: USER,
    plan: "monthly",
    status: "active",
    startedAt: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    trialEndsAt: null,
    cancelledAt: null,
    cancelReason: null,
    cancelAtPeriodEnd: false,
    autoRenew: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  s.memberships.push(m);
  return m;
}

describe("SocioBulejeDB — subscribe", () => {
  it("crea membership en trial con cycle waived la primera vez", async () => {
    const out = await SocioBulejeDB.subscribe(TENANT, USER, "monthly");
    expect(out.status).toBe("trial");
    // @ts-expect-error — hoisted state for test reset
    const s = globalThis.__socioTestState as TestStoreShape;
    expect(s.cycles).toHaveLength(1);
    expect((s.cycles[0] as { amountSoles: number; status: string }).amountSoles).toBe(0);
    expect((s.cycles[0] as { status: string }).status).toBe("waived");
  });

  it("reactiva ex-socio con cycle pending S/189 si annual", async () => {
    seedActiveMembership();
    // @ts-expect-error — hoisted state for test reset
    const s = globalThis.__socioTestState as TestStoreShape;
    s.memberships[0].status = "cancelled";
    const out = await SocioBulejeDB.subscribe(TENANT, USER, "annual");
    expect(out.status).toBe("active");
    expect(s.cycles).toHaveLength(1);
    expect((s.cycles[0] as { amountSoles: number; status: string }).amountSoles).toBe(189);
    expect((s.cycles[0] as { status: string }).status).toBe("pending");
  });
});

describe("SocioBulejeDB — cancel / resume", () => {
  it("cancel default setea cancelAtPeriodEnd=true sin cambiar status", async () => {
    seedActiveMembership();
    const out = await SocioBulejeDB.cancel(TENANT, USER, "too expensive");
    expect(out?.cancelAtPeriodEnd).toBe(true);
    expect(out?.status).toBe("active");
    expect(out?.cancelReason).toBe("too expensive");
  });

  it("cancel immediate setea status=cancelled y cancelledAt", async () => {
    seedActiveMembership();
    const out = await SocioBulejeDB.cancel(TENANT, USER, "fraud", true);
    expect(out?.status).toBe("cancelled");
    expect(out?.cancelledAt).not.toBeNull();
  });
});

describe("SocioBulejeDB — cashback ledger", () => {
  it("earnCashback suma al balance previo y snapshot correcto", async () => {
    seedActiveMembership();
    const e1 = await SocioBulejeDB.earnCashback(TENANT, USER, "ord_1", 5, "compra 1");
    expect(e1.amountSoles).toBe(5);
    expect(e1.balanceAfter).toBe(5);

    const e2 = await SocioBulejeDB.earnCashback(TENANT, USER, "ord_2", 3.25, "compra 2");
    expect(e2.balanceAfter).toBeCloseTo(8.25, 2);
  });

  it("ledger consistency: balanceAfter[n] === sum(amount[0..n])", async () => {
    seedActiveMembership();
    await SocioBulejeDB.earnCashback(TENANT, USER, null, 10, "+10");
    await SocioBulejeDB.earnCashback(TENANT, USER, null, 3.5, "+3.5");
    await SocioBulejeDB.redeemCashback(TENANT, USER, null, 2);
    await SocioBulejeDB.earnCashback(TENANT, USER, null, 1.25, "+1.25");

    // @ts-expect-error — hoisted state for test reset
    const s = globalThis.__socioTestState as TestStoreShape;
    let running = 0;
    for (const e of s.entries) {
      running = Number((running + e.amountSoles).toFixed(2));
      expect(e.balanceAfter).toBeCloseTo(running, 2);
    }
    expect(running).toBeCloseTo(12.75, 2);
  });

  it("redeemCashback falla si balance insuficiente", async () => {
    seedActiveMembership();
    await SocioBulejeDB.earnCashback(TENANT, USER, null, 3, "+3");
    await expect(
      SocioBulejeDB.redeemCashback(TENANT, USER, null, 5),
    ).rejects.toBeInstanceOf(SocioInsufficientBalanceError);
  });

  it("redeemCashback falla si status=cancelled", async () => {
    const m = seedActiveMembership();
    // @ts-expect-error — hoisted state for test reset
    const s = globalThis.__socioTestState as TestStoreShape;
    s.memberships[0].status = "cancelled";
    // mock: FOR UPDATE refleja el status actual, así que debería tirar SocioInactiveError
    await expect(
      SocioBulejeDB.redeemCashback(TENANT, USER, null, 1),
    ).rejects.toBeInstanceOf(SocioInactiveError);
    void m;
  });

  it("redeemCashback falla si status=past_due", async () => {
    seedActiveMembership();
    // @ts-expect-error — hoisted state for test reset
    const s = globalThis.__socioTestState as TestStoreShape;
    s.memberships[0].status = "past_due";
    await expect(
      SocioBulejeDB.redeemCashback(TENANT, USER, null, 1),
    ).rejects.toBeInstanceOf(SocioInactiveError);
  });

  it("getCashbackBalance = último balanceAfter", async () => {
    seedActiveMembership();
    await SocioBulejeDB.earnCashback(TENANT, USER, null, 7.7, "+7.7");
    const balance = await SocioBulejeDB.getCashbackBalance(TENANT, USER);
    expect(balance).toBeCloseTo(7.7, 2);
  });

  it("getCashbackBalance = 0 si no hay entries", async () => {
    seedActiveMembership();
    const balance = await SocioBulejeDB.getCashbackBalance(TENANT, USER);
    expect(balance).toBe(0);
  });
});
