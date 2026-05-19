/**
 * Tests — lib/db/notification-center.db.ts
 *
 * Cubre el patrón createOrReuse idempotente usado por crons periódicos
 * que disparan la misma alerta hasta que el problema se resuelve.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockCreate, mockFindFirst } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      create: mockCreate,
      findFirst: mockFindFirst,
      updateMany: vi.fn(),
    },
  },
}));

import { NotificationCenterDB } from "@/lib/db/notification-center.db";

describe("NotificationCenterDB.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea notification con campos requeridos", async () => {
    mockCreate.mockResolvedValueOnce({ id: "n-1" });
    const result = await NotificationCenterDB.create({
      tenantId: "t-1",
      type: "VENDOR_IDENTITY_ALERT",
      severity: "HIGH",
      title: "RUC NO HABIDO",
      body: "Detalle",
    });
    expect(result).toEqual({ id: "n-1", created: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "t-1",
        type: "VENDOR_IDENTITY_ALERT",
        severity: "HIGH",
        title: "RUC NO HABIDO",
        body: "Detalle",
      },
      select: { id: true },
    });
  });

  it("incluye actionUrl, actionLabel, entityId cuando se pasan", async () => {
    mockCreate.mockResolvedValueOnce({ id: "n-2" });
    await NotificationCenterDB.create({
      tenantId: "t-1",
      type: "X",
      severity: "MEDIUM",
      title: "T",
      body: "B",
      actionUrl: "/admin/x",
      actionLabel: "Ir",
      entityId: "ent-1",
    });
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.data.actionUrl).toBe("/admin/x");
    expect(arg.data.actionLabel).toBe("Ir");
    expect(arg.data.entityId).toBe("ent-1");
  });
});

describe("NotificationCenterDB.createOrReuse — idempotencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea si no existe match en la ventana", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "n-3" });
    const result = await NotificationCenterDB.createOrReuse({
      tenantId: "t-1",
      type: "VENDOR_IDENTITY_ALERT",
      severity: "HIGH",
      title: "Alerta",
      body: "Body",
      entityId: "v-1",
    });
    expect(result).toEqual({ id: "n-3", created: true });
    expect(mockCreate).toHaveBeenCalled();
  });

  it("reusa si ya existe match (no leído + dentro de ventana)", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "existing-id" });
    const result = await NotificationCenterDB.createOrReuse({
      tenantId: "t-1",
      type: "VENDOR_IDENTITY_ALERT",
      severity: "HIGH",
      title: "Alerta",
      body: "Body",
      entityId: "v-1",
    });
    expect(result).toEqual({ id: "existing-id", created: false });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("default dedupWindowHours=24", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "n" });
    await NotificationCenterDB.createOrReuse({
      tenantId: "t-1",
      type: "X",
      severity: "LOW",
      title: "t",
      body: "b",
    });
    const findArg = mockFindFirst.mock.calls[0][0];
    const since = findArg.where.createdAt.gte as Date;
    const ageHours = (Date.now() - since.getTime()) / (60 * 60 * 1000);
    expect(ageHours).toBeGreaterThan(23.9);
    expect(ageHours).toBeLessThan(24.1);
  });

  it("dedupWindowHours custom usa ventana menor", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "n" });
    await NotificationCenterDB.createOrReuse({
      tenantId: "t-1",
      type: "X",
      severity: "LOW",
      title: "t",
      body: "b",
      dedupWindowHours: 1,
    });
    const findArg = mockFindFirst.mock.calls[0][0];
    const since = findArg.where.createdAt.gte as Date;
    const ageHours = (Date.now() - since.getTime()) / (60 * 60 * 1000);
    expect(ageHours).toBeGreaterThan(0.9);
    expect(ageHours).toBeLessThan(1.1);
  });

  it("scopea where con tenantId + type + entityId", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "n" });
    await NotificationCenterDB.createOrReuse({
      tenantId: "t-scope",
      type: "VENDOR_IDENTITY_ALERT",
      severity: "MEDIUM",
      title: "t",
      body: "b",
      entityId: "ent-99",
    });
    const findArg = mockFindFirst.mock.calls[0][0];
    expect(findArg.where.tenantId).toBe("t-scope");
    expect(findArg.where.type).toBe("VENDOR_IDENTITY_ALERT");
    expect(findArg.where.entityId).toBe("ent-99");
    expect(findArg.where.readAt).toBeNull();
  });
});
