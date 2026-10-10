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

const { mockCreate, mockFindFirst, mockUpdateMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      create: mockCreate,
      findFirst: mockFindFirst,
      updateMany: mockUpdateMany,
    },
  },
}));

const haceHoras = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

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

describe("NotificationCenterDB.createOrReuse — un aviso por problema (OPER-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const base = {
    tenantId: "t-1",
    type: "ADELANTO_VENCIDO",
    severity: "MEDIUM",
    title: "Adelantos vencidos por cobrar",
    body: "3 personas con saldo vencido: S/ 900.00.",
    actionUrl: "/admin?tab=plata&vista=adelantos",
    actionLabel: "Ver adelantos",
  };

  it("crea si no hay uno igual sin leer", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "n-3" });
    const result = await NotificationCenterDB.createOrReuse({ ...base, entityId: "v-1" });
    expect(result).toEqual({ id: "n-3", created: true, refreshed: false });
    expect(mockCreate).toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("la clave es negocio + tipo + entidad, sin ventana de fecha y el más nuevo primero", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "n" });
    await NotificationCenterDB.createOrReuse({ ...base, tenantId: "t-scope", entityId: "ent-99" });
    const arg = mockFindFirst.mock.calls[0][0];
    expect(arg.where).toEqual({ tenantId: "t-scope", type: "ADELANTO_VENCIDO", entityId: "ent-99", readAt: null });
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
  });

  it("sin entidad la clave es entityId null (no cualquier aviso del tipo)", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "n" });
    await NotificationCenterDB.createOrReuse(base);
    expect(mockFindFirst.mock.calls[0][0].where.entityId).toBeNull();
  });

  it("dentro de la ventana lo reusa sin escribir", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "existing-id", createdAt: haceHoras(23) });
    const result = await NotificationCenterDB.createOrReuse(base);
    expect(result).toEqual({ id: "existing-id", created: false, refreshed: false });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("fuera de la ventana ACTUALIZA el mismo aviso (texto + hora) en vez de crear otro", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "viejo", createdAt: haceHoras(25) });
    mockUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 13 });
    const antes = Date.now();
    const result = await NotificationCenterDB.createOrReuse(base);

    expect(result).toEqual({ id: "viejo", created: true, refreshed: true });
    expect(mockCreate).not.toHaveBeenCalled();
    const [refresco, copias] = mockUpdateMany.mock.calls.map((c) => c[0]);
    expect(refresco.where).toEqual({ id: "viejo", tenantId: "t-1", readAt: null });
    expect(refresco.data).toMatchObject({
      title: base.title,
      body: base.body,
      severity: "MEDIUM",
      actionUrl: "/admin?tab=plata&vista=adelantos",
      actionLabel: "Ver adelantos",
    });
    expect((refresco.data.createdAt as Date).getTime()).toBeGreaterThanOrEqual(antes);
    // Las copias viejas de la misma clave (las 14 de Blas) quedan leídas.
    expect(copias.where).toEqual({
      tenantId: "t-1",
      type: "ADELANTO_VENCIDO",
      entityId: null,
      readAt: null,
      id: { not: "viejo" },
    });
    expect(copias.data.readAt).toBeInstanceOf(Date);
  });

  it("ventana custom: con 1 h, uno de hace 2 h se pone al día", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "x", createdAt: haceHoras(2) });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const result = await NotificationCenterDB.createOrReuse({ ...base, dedupWindowHours: 1 });
    expect(result.refreshed).toBe(true);
  });

  it("si lo leyeron entre la búsqueda y la escritura, crea uno nuevo (no lo des-lee)", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "leido", createdAt: haceHoras(30) });
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    mockCreate.mockResolvedValueOnce({ id: "nuevo" });
    const result = await NotificationCenterDB.createOrReuse(base);
    expect(result).toEqual({ id: "nuevo", created: true, refreshed: false });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });
});
