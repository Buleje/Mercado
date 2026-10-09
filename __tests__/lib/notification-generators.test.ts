/**
 * Tests — lib/notification-generators.ts (INTEG-01, 09-10).
 * Las lecturas van por AvisosCampanaDB con el tenantId del negocio que se
 * recorre, cada aviso por createOrReuse con una clave estable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// El servidor corre en UTC; esta PC, en Lima (con Lima el bug de calendario no se ve).
const { db, createOrReuse, cuotas } = vi.hoisted(() => ({
  _tz: (process.env.TZ = "UTC"),
  db: {
    fiadosVencidos: vi.fn(),
    stockBajo: vi.fn(),
    turnosAbiertosAntesDe: vi.fn(),
    cuentasPorPagarHasta: vi.fn(),
    cajasCerradasConDiferencia: vi.fn(),
    resumenesDiariosDesde: vi.fn(),
    clientesVipConUltimaActividad: vi.fn(),
    bajadasDePrecio: vi.fn(),
    ventasYGastos: vi.fn(),
    productosBajoCosto: vi.fn(),
    ventasParaAgradecer: vi.fn(),
  },
  createOrReuse: vi.fn(),
  cuotas: vi.fn(),
}));

vi.mock("@/lib/db/avisos-campana.db", () => ({ AvisosCampanaDB: db }));
vi.mock("@/lib/db/notification-center.db", () => ({ NotificationCenterDB: { createOrReuse } }));
vi.mock("@/lib/db/prestamos.db", () => ({ PrestamosDB: { getCuotasProximas: cuotas } }));

import { generateNotifications } from "@/lib/notification-generators";

const AHORA = new Date("2026-10-09T15:00:00Z");

function sinNada() {
  db.fiadosVencidos.mockResolvedValue([]);
  db.stockBajo.mockResolvedValue({ total: 0, agotados: 0, muestra: [] });
  db.turnosAbiertosAntesDe.mockResolvedValue([]);
  db.cuentasPorPagarHasta.mockResolvedValue([]);
  db.cajasCerradasConDiferencia.mockResolvedValue([]);
  db.resumenesDiariosDesde.mockResolvedValue([]);
  db.clientesVipConUltimaActividad.mockResolvedValue([]);
  db.bajadasDePrecio.mockResolvedValue([]);
  db.ventasYGastos.mockResolvedValue({ ventas: 0, gastos: 0 });
  db.productosBajoCosto.mockResolvedValue([]);
  db.ventasParaAgradecer.mockResolvedValue([]);
  cuotas.mockResolvedValue({ vencidas: [], proximas: [] });
}

const avisos = () => createOrReuse.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  sinNada();
  createOrReuse.mockResolvedValue({ id: "n", created: true, refreshed: false });
});

describe("generateNotifications", () => {
  it("lee y escribe sólo en el negocio que recibe (nada de «main» fijo)", async () => {
    db.fiadosVencidos.mockResolvedValue([{ id: "f1", cliente: "Rosa", saldo: 40 }]);
    await generateNotifications("t-blas", { ahora: AHORA });
    for (const fn of Object.values(db)) expect(fn.mock.calls[0][0]).toBe("t-blas");
    expect(cuotas).toHaveBeenCalledWith("t-blas", 2);
    expect(avisos().every((a) => a.tenantId === "t-blas")).toBe(true);
  });

  it("caja descuadrada: aviso con lo que falta y la caja como entidad", async () => {
    db.cajasCerradasConDiferencia.mockResolvedValue([
      { id: "caja-1", difference: -40, closedAt: new Date("2026-10-07T02:00:00Z") },
      { id: "caja-2", difference: 10, closedAt: AHORA },
    ]);
    const r = await generateNotifications("t-1", { ahora: AHORA });
    expect(avisos()).toHaveLength(1);
    const a = avisos()[0];
    expect(a).toMatchObject({ type: "DIFERENCIA_CAJA", entityId: "caja-1", severity: "MEDIUM", dedupWindowHours: 20 });
    // 02:00 UTC del 07 = 21:00 del 06 en Lima.
    expect(a.title).toContain("faltan S/ 40.00");
    expect(a.body).toContain("6/10/2026");
    expect(r).toEqual({ nuevos: 1, porTipo: { DIFERENCIA_CAJA: 1 }, fallos: [] });
  });

  it("stock bajo: UN aviso con el conteo, no uno por producto", async () => {
    db.stockBajo.mockResolvedValue({
      total: 7,
      agotados: 2,
      muestra: [{ id: 1, name: "Arroz", stock: 0 }, { id: 2, name: "Azúcar", stock: 3 }],
    });
    await generateNotifications("t-1", { ahora: AHORA });
    expect(avisos()).toHaveLength(1);
    expect(avisos()[0]).toMatchObject({
      type: "STOCK_CRITICO",
      severity: "HIGH",
      entityId: "stock-bajo",
      title: "7 productos con stock bajo",
    });
    expect(avisos()[0].body).toBe("2 agotados. Arroz (0), Azúcar (3) y 5 más.");
  });

  it("cliente inactivo: la clave es el teléfono, sin la fecha (se actualiza, no se duplica)", async () => {
    db.clientesVipConUltimaActividad.mockResolvedValue([
      { phone: "+51987", name: "Rosa", totalSpent: 900, ultimaActividad: new Date("2026-09-01T12:00:00Z") },
      { phone: "999", name: "Juan", totalSpent: 600, ultimaActividad: new Date("2026-10-08T12:00:00Z") },
      { phone: "111", name: "Ana", totalSpent: 550, ultimaActividad: null },
    ]);
    await generateNotifications("t-1", { ahora: AHORA });
    const inactivos = avisos();
    expect(inactivos.map((a) => a.entityId)).toEqual(["+51987", "111"]);
    expect(inactivos[0].body).toContain("no compra hace 38 días");
    expect(inactivos[0].actionUrl).toBe("/admin?tab=crm&phone=%2B51987");
    expect(inactivos[1].body).toContain("no tiene compras registradas");
  });

  it("cuenta sólo los avisos nuevos (los reusados no)", async () => {
    db.fiadosVencidos.mockResolvedValue([
      { id: "f1", cliente: "Rosa", saldo: 40 },
      { id: "f2", cliente: "Luis", saldo: 12.5 },
    ]);
    createOrReuse
      .mockResolvedValueOnce({ id: "a", created: true, refreshed: false })
      .mockResolvedValueOnce({ id: "b", created: false, refreshed: false });
    const r = await generateNotifications("t-1", { ahora: AHORA });
    expect(r.nuevos).toBe(1);
    expect(avisos()[1]).toMatchObject({ entityId: "f2", body: "Debe S/ 12.50 y ya pasó la fecha de pago." });
  });

  it("una revisión que falla no corta las demás y queda en `fallos`", async () => {
    db.fiadosVencidos.mockRejectedValue(new Error("relation does not exist"));
    db.productosBajoCosto.mockResolvedValue([{ id: 9, name: "Leche", price: 3, costPrice: 3.5 }]);
    const r = await generateNotifications("t-1", { ahora: AHORA });
    expect(r.fallos).toEqual(["FIADO_VENCIDO"]);
    expect(avisos()[0]).toMatchObject({ type: "MARGEN_NEGATIVO", entityId: "9" });
  });

  it("el cierre del día guardado como medianoche UTC dice SU día, no el anterior", async () => {
    db.resumenesDiariosDesde.mockResolvedValue([
      { fecha: new Date("2026-10-09T00:00:00.000Z"), diferenciaCaja: -30, creadoPor: "Ana" },
    ]);
    await generateNotifications("t-1", { ahora: AHORA });
    expect(avisos()[0].body).toBe("Resumen del 9/10/2026, lo hizo Ana.");
  });

  it("cuota: fecha de calendario en UTC; un instante con hora, en Lima", async () => {
    const cuota = { nombre: "BCP", numeroCuota: 3, monto: 100, moneda: "PEN" };
    cuotas.mockResolvedValue({
      vencidas: [],
      proximas: [
        { ...cuota, cuotaId: "c1", fechaVence: "2026-10-11T00:00:00.000Z" },
        { ...cuota, cuotaId: "c2", fechaVence: "2026-10-11T02:00:00.000Z" },
      ],
    });
    await generateNotifications("t-1", { ahora: AHORA });
    expect(avisos()[0].body).toBe("Cuota 3 de S/ 100.00 vence el 11 de octubre.");
    // 02:00 UTC del 11 = 21:00 del 10 en Lima.
    expect(avisos()[1].body).toBe("Cuota 3 de S/ 100.00 vence el 10 de octubre.");
  });

  it("flujo de caja: el mes y el día son los de Lima, no los del servidor", async () => {
    // 03:00 UTC del 1/11 = 22:00 del 31/10 en Lima: todavía es octubre, día 31.
    const finDeMes = new Date("2026-11-01T03:00:00.000Z");
    db.ventasYGastos.mockResolvedValue({ ventas: 100, gastos: 3100 });
    await generateNotifications("t-1", { ahora: finDeMes });
    expect(db.ventasYGastos.mock.calls[0][2]).toEqual(new Date("2026-10-01T05:00:00.000Z"));
    // 3100 / 31 días × 7 = 700 → 2 × (100 − 700) = −1200.
    expect(avisos()[0]).toMatchObject({ type: "FLUJO_CAJA_CRITICO", severity: "HIGH" });
    expect(avisos()[0].body).toContain("S/ -1200");
  });

  it("el agradecimiento lleva el nombre del negocio, no «Buleje»", async () => {
    db.ventasParaAgradecer.mockResolvedValue([{ id: "s1", total: 80, phone: "51987654321", cliente: "Rosa" }]);
    await generateNotifications("t-1", { ahora: AHORA, nombreNegocio: "Bodega Lucía" });
    expect(decodeURIComponent(avisos()[0].actionUrl)).toContain("en Bodega Lucía");
  });
});
