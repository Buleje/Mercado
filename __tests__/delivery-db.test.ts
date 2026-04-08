/**
 * lib/db/delivery.db.ts — unit tests
 *
 * Cubre las 3 DB classes del Bloque D1:
 *   - DeliveryTrackingDB      (4 tests)
 *   - DeliveryRoutesDB        (4 tests)
 *   - DeliveryRouteStopsDB    (5 tests)
 *   - Multi-tenant isolation  (2 tests)
 *
 * Total: 15 tests. Todo en-memoria (mock de prisma + cache).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Mock del logger (no queremos ruido) ─────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Mock de cache (getOrSet simplemente llama al fn) ────────────────────────
const { mockInvalidateByPrefix } = vi.hoisted(() => ({
  mockInvalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/cache", () => ({
  getOrSet: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidateByPrefix: mockInvalidateByPrefix,
}));

// ─── Mock de prisma (raw queries) ────────────────────────────────────────────
const {
  mockExecuteRawUnsafe,
  mockQueryRawUnsafe,
  mockTransaction,
} = vi.hoisted(() => ({
  mockExecuteRawUnsafe: vi.fn(),
  mockQueryRawUnsafe: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $queryRawUnsafe: mockQueryRawUnsafe,
    $transaction: mockTransaction,
  },
}));

// Importar DESPUÉS de los mocks
import {
  DeliveryTrackingDB,
  DeliveryRoutesDB,
  DeliveryRouteStopsDB,
} from "@/lib/db/delivery.db";

// Constantes de prueba
const T1 = "tenant-main";
const T2 = "tenant-demo";
const ORDER_ID = "MKT-ABC123";
const ROUTE_ID = "route-1";
const STOP_ID = "stop-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteRawUnsafe.mockResolvedValue(1);
  mockQueryRawUnsafe.mockResolvedValue([]);
  // Para transacciones: pasar un "tx" fake con los mismos mocks
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      $executeRawUnsafe: mockExecuteRawUnsafe,
      $queryRawUnsafe: mockQueryRawUnsafe,
    }),
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// DeliveryTrackingDB
// ═════════════════════════════════════════════════════════════════════════════

describe("DeliveryTrackingDB.add", () => {
  it("inserta un evento con los campos mínimos", async () => {
    const result = await DeliveryTrackingDB.add({
      tenantId: T1,
      orderId: ORDER_ID,
      status: "preparing",
    });

    expect(result.tenantId).toBe(T1);
    expect(result.orderId).toBe(ORDER_ID);
    expect(result.status).toBe("preparing");
    expect(result.actorType).toBe("system"); // default
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/i); // UUID
    // Primer INSERT es el evento, no hay cascada a Order porque 'preparing' no es terminal
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("propaga status a Order cuando es 'delivered'", async () => {
    await DeliveryTrackingDB.add({
      tenantId: T1,
      orderId: ORDER_ID,
      status: "delivered",
      actorType: "driver",
    });

    // 1 INSERT en DeliveryTracking + 1 UPDATE en Order
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(2);
    const secondCallSql = String(mockExecuteRawUnsafe.mock.calls[1]?.[0] ?? "");
    expect(secondCallSql).toContain(`UPDATE "Order"`);
    expect(secondCallSql).toContain(`"deliveryStatus"`);
    expect(secondCallSql).toContain(`"deliveredAt"`);
  });

  it("invalida cache después de agregar", async () => {
    await DeliveryTrackingDB.add({
      tenantId: T1,
      orderId: ORDER_ID,
      status: "in_transit",
    });

    expect(mockInvalidateByPrefix).toHaveBeenCalledWith(
      `delivery:tracking:${T1}:${ORDER_ID}`,
    );
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith(
      `delivery:tracking:latest:${T1}`,
    );
  });
});

describe("DeliveryTrackingDB.listByOrder", () => {
  it("mapea las filas de Postgres a DbDeliveryTracking", async () => {
    const fakeRow = {
      id: "ev-1",
      tenantId: T1,
      orderId: ORDER_ID,
      status: "in_transit",
      description: "En camino",
      lat: -8.3833,
      lng: -74.5333,
      distanceM: 1200,
      etaMinutes: 5,
      actorId: "driver-1",
      actorType: "driver",
      photoUrl: null,
      metadataJson: null,
      createdAt: new Date("2026-04-08T12:00:00Z"),
    };
    mockQueryRawUnsafe.mockResolvedValueOnce([fakeRow]);

    const result = await DeliveryTrackingDB.listByOrder(T1, ORDER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("ev-1");
    expect(result[0]!.createdAt).toBe("2026-04-08T12:00:00.000Z"); // serialized
    // El query usa el tenantId como parámetro
    const calledSql = String(mockQueryRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(calledSql).toContain(`"tenantId" = $1`);
    expect(mockQueryRawUnsafe.mock.calls[0]?.[1]).toBe(T1);
    expect(mockQueryRawUnsafe.mock.calls[0]?.[2]).toBe(ORDER_ID);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DeliveryRoutesDB
// ═════════════════════════════════════════════════════════════════════════════

describe("DeliveryRoutesDB.create", () => {
  it("crea una ruta con defaults y retorna el objeto completo", async () => {
    const plannedAt = "2026-04-08T08:00:00Z";
    const result = await DeliveryRoutesDB.create({
      tenantId: T1,
      storeId: "store-1",
      driverId: "driver-1",
      driverName: "Juan Pérez",
      plannedStartAt: plannedAt,
    });

    expect(result.status).toBe("planned");
    expect(result.vehicleType).toBe("moto"); // default
    expect(result.totalStops).toBe(0);
    expect(result.completedStops).toBe(0);
    expect(result.optimizedByAi).toBe(false);
    expect(result.plannedStartAt).toBe("2026-04-08T08:00:00.000Z");
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("invalida cache de rutas después de crear", async () => {
    await DeliveryRoutesDB.create({
      tenantId: T1,
      storeId: "store-1",
      driverId: "driver-1",
      driverName: "Juan",
      plannedStartAt: new Date(),
    });
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith(`delivery:routes:${T1}`);
  });
});

describe("DeliveryRoutesDB.setStatus", () => {
  it("actualiza el status y dispara invalidate", async () => {
    await DeliveryRoutesDB.setStatus(T1, ROUTE_ID, "in_progress");

    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = String(mockExecuteRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"status" = $1`);
    expect(sql).toContain(`"actualStartAt"`); // se setea en in_progress
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith(`delivery:routes:${T1}`);
  });

  it("setea completedAt cuando el status final es 'completed'", async () => {
    await DeliveryRoutesDB.setStatus(T1, ROUTE_ID, "completed");
    const sql = String(mockExecuteRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"completedAt"`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DeliveryRouteStopsDB
// ═════════════════════════════════════════════════════════════════════════════

describe("DeliveryRouteStopsDB.addStop", () => {
  it("calcula la siguiente sequence y bumpea totalStops en transacción", async () => {
    // Simular que ya hay 2 paradas → la próxima es 3
    mockQueryRawUnsafe.mockResolvedValueOnce([{ next: 3 }]);

    const result = await DeliveryRouteStopsDB.addStop({
      tenantId: T1,
      routeId: ROUTE_ID,
      orderId: ORDER_ID,
      address: "Jr. Progreso 123",
      customerName: "María López",
    });

    expect(result.sequence).toBe(3);
    expect(result.status).toBe("pending");
    // Dentro de la transacción hubo: SELECT MAX (query) + INSERT + UPDATE totalStops
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(2); // INSERT + UPDATE
  });

  it("arranca en sequence=1 si la ruta está vacía", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ next: 1 }]);
    const result = await DeliveryRouteStopsDB.addStop({
      tenantId: T1,
      routeId: ROUTE_ID,
      orderId: ORDER_ID,
      address: "Jr. Inmaculada 456",
      customerName: "Carlos Ruiz",
    });
    expect(result.sequence).toBe(1);
  });
});

describe("DeliveryRouteStopsDB.markStop", () => {
  it("incrementa completedStops cuando el status cambia a 'delivered'", async () => {
    // Primer query: leer la parada existente (status previo = pending)
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { routeId: ROUTE_ID, orderId: ORDER_ID, status: "pending" },
    ]);
    // Segundo query (fuera de tx): leer el orderId para cascada
    mockQueryRawUnsafe.mockResolvedValueOnce([{ orderId: ORDER_ID }]);

    await DeliveryRouteStopsDB.markStop({
      tenantId: T1,
      stopId: STOP_ID,
      status: "delivered",
      proofPhotoUrl: "https://example.com/proof.jpg",
    });

    // Dentro tx: UPDATE stop + UPDATE route.completedStops
    // Fuera tx: INSERT DeliveryTracking + UPDATE Order (cascada)
    expect(mockExecuteRawUnsafe.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith(`delivery:stops:${T1}`);
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith(`delivery:routes:${T1}`);
  });

  it("NO incrementa completedStops si la parada ya estaba 'delivered' antes", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { routeId: ROUTE_ID, orderId: ORDER_ID, status: "delivered" },
    ]);
    mockQueryRawUnsafe.mockResolvedValueOnce([{ orderId: ORDER_ID }]);

    await DeliveryRouteStopsDB.markStop({
      tenantId: T1,
      stopId: STOP_ID,
      status: "delivered",
    });

    // Solo debe haber 1 UPDATE stop dentro de la transacción, NO el bump
    // (contamos las llamadas dentro de la transacción: 1 UPDATE stop).
    // Fuera de tx: el DeliveryTracking.add se ejecuta igual.
    // Verificamos que no haya ningún SQL de UPDATE con completedStops + 1
    const updateCalls = mockExecuteRawUnsafe.mock.calls.filter((call) => {
      const sql = String(call[0] ?? "");
      return sql.includes(`"completedStops" = "completedStops" + 1`);
    });
    expect(updateCalls).toHaveLength(0);
  });

  it("lanza error si la parada no existe", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]); // stop no encontrada

    await expect(
      DeliveryRouteStopsDB.markStop({
        tenantId: T1,
        stopId: "no-existe",
        status: "delivered",
      }),
    ).rejects.toThrow(/no existe/);
  });
});

describe("DeliveryRouteStopsDB.listByRoute", () => {
  it("mapea paradas de Postgres y ordena por sequence", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      {
        id: "s1",
        tenantId: T1,
        routeId: ROUTE_ID,
        orderId: "o1",
        sequence: 1,
        status: "pending",
        address: "Jr. Centenario 100",
        addressDetail: null,
        lat: null,
        lng: null,
        customerName: "Ana",
        customerPhone: null,
        estimatedArrivalAt: null,
        actualArrivalAt: null,
        completedAt: null,
        failureReason: null,
        proofPhotoUrl: null,
        proofSignatureUrl: null,
        notes: null,
        createdAt: new Date("2026-04-08T10:00:00Z"),
        updatedAt: new Date("2026-04-08T10:00:00Z"),
      },
    ]);

    const result = await DeliveryRouteStopsDB.listByRoute(T1, ROUTE_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.sequence).toBe(1);
    expect(result[0]!.status).toBe("pending");
    // El SQL usa ORDER BY sequence ASC
    const sql = String(mockQueryRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`ORDER BY "sequence" ASC`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Multi-tenant isolation
// ═════════════════════════════════════════════════════════════════════════════

describe("Multi-tenant isolation", () => {
  it("listByOrder nunca cruza tenants — tenantId siempre va como $1", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]);
    await DeliveryTrackingDB.listByOrder(T1, ORDER_ID);
    expect(mockQueryRawUnsafe.mock.calls[0]?.[1]).toBe(T1);

    mockQueryRawUnsafe.mockClear();
    mockQueryRawUnsafe.mockResolvedValueOnce([]);
    await DeliveryTrackingDB.listByOrder(T2, ORDER_ID);
    expect(mockQueryRawUnsafe.mock.calls[0]?.[1]).toBe(T2);
  });

  it("setStatus filtra por tenantId en el WHERE", async () => {
    await DeliveryRoutesDB.setStatus(T1, ROUTE_ID, "cancelled");
    const sql = String(mockExecuteRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"tenantId" = $4`);
    // El 4to argumento posicional del executeRawUnsafe debe ser el tenantId
    expect(mockExecuteRawUnsafe.mock.calls[0]?.[4]).toBe(T1);
  });
});
