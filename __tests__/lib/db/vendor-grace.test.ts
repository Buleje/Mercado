/**
 * Tests — lib/db/vendor-grace.db.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const cacheMap = new Map<string, unknown>();
vi.mock("@/lib/cache", () => ({
  cacheStore: {
    get: vi.fn((key: string) => cacheMap.get(key) ?? null),
    set: vi.fn((key: string, value: unknown) => {
      cacheMap.set(key, value);
    }),
    del: vi.fn((key: string) => {
      cacheMap.delete(key);
    }),
  },
}));

import { VendorGraceDB } from "@/lib/db/vendor-grace.db";

describe("VendorGraceDB.set + get", () => {
  beforeEach(() => {
    cacheMap.clear();
    vi.clearAllMocks();
  });

  it("persiste grace y calcula until automáticamente", async () => {
    const record = await VendorGraceDB.set("t-1", {
      vendorId: "v-1",
      kind: "ruc-changed",
      graceDays: 7,
      acknowledgedBy: "admin",
    });
    expect(record.vendorId).toBe("v-1");
    expect(record.graceDays).toBe(7);
    expect(record.acknowledgedBy).toBe("admin");
    const untilMs = new Date(record.until).getTime();
    const expectedMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(untilMs).toBeGreaterThan(expectedMs - 5000);
    expect(untilMs).toBeLessThan(expectedMs + 5000);
  });

  it("get devuelve el grace persistido", async () => {
    await VendorGraceDB.set("t-1", {
      vendorId: "v-1",
      kind: "ruc-not-found",
      graceDays: 3,
      acknowledgedBy: "owner",
    });
    const got = VendorGraceDB.get("t-1");
    expect(got).not.toBeNull();
    expect(got?.vendorId).toBe("v-1");
    expect(got?.kind).toBe("ruc-not-found");
  });

  it("get retorna null si no hay grace", () => {
    expect(VendorGraceDB.get("t-empty")).toBeNull();
  });

  it("set sobreescribe grace previo (último gana)", async () => {
    await VendorGraceDB.set("t-1", {
      vendorId: "v-1",
      kind: "ruc-changed",
      graceDays: 3,
      acknowledgedBy: "a1",
    });
    await VendorGraceDB.set("t-1", {
      vendorId: "v-1",
      kind: "ruc-changed",
      graceDays: 14,
      acknowledgedBy: "a2",
    });
    const got = VendorGraceDB.get("t-1");
    expect(got?.graceDays).toBe(14);
    expect(got?.acknowledgedBy).toBe("a2");
  });

  it("reason opcional se persiste si se pasa", async () => {
    const r = await VendorGraceDB.set("t-1", {
      vendorId: "v-1",
      kind: "ruc-changed",
      graceDays: 7,
      reason: "Cita SUNAT lunes",
      acknowledgedBy: "admin",
    });
    expect(r.reason).toBe("Cita SUNAT lunes");
  });
});

describe("VendorGraceDB.shouldSkip", () => {
  beforeEach(() => {
    cacheMap.clear();
    vi.clearAllMocks();
  });

  it("false si no hay grace", () => {
    expect(VendorGraceDB.shouldSkip("t-1", "v-1", "ruc-changed")).toBe(false);
  });

  it("true si grace activo matchea vendorId + kind", async () => {
    await VendorGraceDB.set("t-1", {
      vendorId: "v-1",
      kind: "ruc-changed",
      graceDays: 7,
      acknowledgedBy: "admin",
    });
    expect(VendorGraceDB.shouldSkip("t-1", "v-1", "ruc-changed")).toBe(true);
  });

  it("false si grace activo pero kind diferente", async () => {
    await VendorGraceDB.set("t-1", {
      vendorId: "v-1",
      kind: "ruc-changed",
      graceDays: 7,
      acknowledgedBy: "admin",
    });
    expect(VendorGraceDB.shouldSkip("t-1", "v-1", "dni-not-found")).toBe(false);
  });

  it("false si vendorId diferente", async () => {
    await VendorGraceDB.set("t-1", {
      vendorId: "v-1",
      kind: "ruc-changed",
      graceDays: 7,
      acknowledgedBy: "admin",
    });
    expect(VendorGraceDB.shouldSkip("t-1", "v-other", "ruc-changed")).toBe(false);
  });

  it("false si grace expiró (until < now)", async () => {
    cacheMap.set("vendor-identity-grace:t-1", {
      vendorId: "v-1",
      kind: "ruc-changed",
      until: new Date(Date.now() - 1000).toISOString(), // ya expiró
      graceDays: 7,
      acknowledgedBy: "admin",
      acknowledgedAt: new Date().toISOString(),
    });
    expect(VendorGraceDB.shouldSkip("t-1", "v-1", "ruc-changed")).toBe(false);
  });
});

describe("VendorGraceDB.clear", () => {
  beforeEach(() => {
    cacheMap.clear();
    vi.clearAllMocks();
  });

  it("borra el grace activo", async () => {
    await VendorGraceDB.set("t-1", {
      vendorId: "v-1",
      kind: "ruc-changed",
      graceDays: 7,
      acknowledgedBy: "admin",
    });
    VendorGraceDB.clear("t-1");
    expect(VendorGraceDB.get("t-1")).toBeNull();
  });
});
