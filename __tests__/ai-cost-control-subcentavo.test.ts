// @vitest-environment node
/**
 * El tope y el medidor de IA tienen que ver los gastos de menos de un centavo.
 *
 * Leer un papel cuesta como máximo US$0,0029 (2.900 tokens a US$0,000001). Antes
 * `recordSpend`/`canSpend` redondeaban a centavos enteros: hasta 4.999 tokens se
 * guardaban 0 centavos, «IA este mes» no se movía y el tope nunca frenaba.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/db/tenant-billing.db", () => ({
  TenantBillingDB: { getPlan: vi.fn(async () => "free") },
}));

/** Upstash falso: guarda lo que devolvería la REST API (INCRBYFLOAT deja texto). */
const almacen = new Map<string, string>();
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async get(k: string) {
      return almacen.has(k) ? almacen.get(k) : null;
    }
    async incrbyfloat(k: string, v: number) {
      const n = Number(almacen.get(k) ?? 0) + v;
      almacen.set(k, String(n));
      return n;
    }
    async incrby() {
      throw new Error("incrby redondea: no se usa");
    }
    async expire() {
      return 1;
    }
  },
}));

const PAPEL_USD = 0.0029;

async function cargar(conRedis: boolean) {
  vi.resetModules();
  if (conRedis) {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://falso.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "x");
  } else {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  }
  return (await import("@/lib/ai/cost-control")).aiCostGuard;
}

describe.each([
  ["en memoria", false],
  ["con Redis", true],
])("aiCostGuard sub-centavo (%s)", (_n, conRedis) => {
  beforeEach(() => {
    almacen.clear();
    vi.unstubAllEnvs();
  });

  it("10 papeles suman ≈ US$0,029 en el medidor", async () => {
    const guard = await cargar(conRedis);
    for (let i = 0; i < 10; i++) await guard.recordSpend("t-sub", PAPEL_USD);
    const { spentUsd } = await guard.getUsage("t-sub");
    expect(spentUsd).toBeCloseTo(0.029, 6);
  });

  it("200 papeles agotan el tope de free (US$0,50) y canSpend frena", async () => {
    const guard = await cargar(conRedis);
    expect(await guard.canSpend("t-tope", PAPEL_USD)).toBe(true);
    for (let i = 0; i < 200; i++) await guard.recordSpend("t-tope", PAPEL_USD);
    expect(await guard.canSpend("t-tope", PAPEL_USD)).toBe(false);
  });

  it("el estimado sub-centavo pesa: 49,9 centavos gastados + 0,29 de estimado > 50", async () => {
    const guard = await cargar(conRedis);
    await guard.recordSpend("t-borde", 0.499);
    expect(await guard.canSpend("t-borde", PAPEL_USD)).toBe(false);
    expect(await guard.canSpend("t-borde", 0.0005)).toBe(true);
  });
});
