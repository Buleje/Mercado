// @vitest-environment node
/**
 * Lo que queda por acreditar de un documento (F12/M55, 17-10) y las reglas por motivo (F11):
 * la vista previa del asistente usa la misma cuenta que el tope del POST, y 01/02/06 van por
 * TODO lo que queda, ni más ni menos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { importeDeLineas, lineasAjustables, ofrecerDevueltoEnCaja, remanenteDocumento } from "@/lib/notas-credito/remanente";
import { cerrarPorTodo, descripcionArmada, reglaMotivo } from "@/lib/notas-credito/motivos";

const h = vi.hoisted(() => ({
  getSale: vi.fn(),
  getOrder: vi.fn(),
  sumVenta: vi.fn(),
  sumPedido: vi.fn(),
  create: vi.fn(),
  porDocumento: vi.fn(),
  devoluciones: vi.fn(),
  estadoCaja: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(() => Promise.resolve({ role: "admin", username: "qa", tenantId: "tenant-a" })),
}));
vi.mock("@/lib/db", () => ({
  NotasCreditoDB: {
    // Doble de `crearEnFila` (alta bajo candado, 17-10): lo acreditado sale de los mocks de suma.
    crearEnFila: async (t: string, doc: { saleId?: string; orderId?: string }, armar: (ya: { venta: number; pedido: number }) => { ok: boolean; datos?: object; error?: unknown }) => {
      const r = armar({ venta: doc.saleId ? await h.sumVenta(t, doc.saleId) : 0, pedido: doc.orderId ? await h.sumPedido(t, doc.orderId) : 0 });
      if (!r.ok) return r;
      return { ok: true, nota: await h.create(t, { ...r.datos, numero: await Promise.resolve("NC01-0001") }) };
    },
    getAll: vi.fn(),
    porDocumento: h.porDocumento,
    devolucionesDeVenta: h.devoluciones,
  },
}));
vi.mock("@/lib/db/sales.db", () => ({ SalesDB: { getById: h.getSale } }));
vi.mock("@/lib/db/orders.db", () => ({ OrdersDB: { getById: h.getOrder } }));
vi.mock("@/lib/db/devoluciones-pos.db", () => ({ DevolucionesPosDB: { estado: h.estadoCaja } }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: vi.fn(() => Promise.resolve({ taxRate: 18 })) } }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterDocument: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

describe("remanenteDocumento (puro)", () => {
  it("las anuladas no restan y lo que queda nunca es negativo", () => {
    const r = remanenteDocumento(50, [{ total: 10, status: "EMITIDA" }, { total: 30, status: "ANULADA" }, { total: 5, status: "BORRADOR" }], 0.18);
    expect(r).toMatchObject({ acreditadoConIgv: 15, disponibleConIgv: 35, disponibleBase: 29.66, notasActivas: 2 });
    expect(remanenteDocumento(10, [{ total: 12, status: "EMITIDA" }], 0.18).disponibleConIgv).toBe(0);
  });
});

describe("lineasAjustables (puro)", () => {
  it("venta QA bc19cbe5: S/ 24,90 con S/ 24,80 de trueque se acredita a S/ 0,10, no a 24,90", () => {
    const [l] = lineasAjustables(0.1, [{ productId: 1, nombre: "Arroz", cantidad: 1, precio: 24.9 }], { 1: 1 });
    expect(l).toMatchObject({ precioLista: 24.9, precioCobrado: 0.1, vendidas: 1, devueltasEnCaja: 1 });
  });

  it("el mismo producto en dos líneas: lo devuelto en Caja se cuenta desde la primera", () => {
    const ls = lineasAjustables(30, [
      { productId: 7, nombre: "Leche", cantidad: 2, precio: 5 },
      { productId: 7, nombre: "Leche", cantidad: 4, precio: 5 },
    ], { 7: 3 });
    expect(ls.map((l) => l.devueltasEnCaja)).toEqual([2, 1]);
  });
});

describe("importeDeLineas (puro)", () => {
  const lineas = [
    { vendidas: 1, precioCobrado: 3.34 },
    { vendidas: 1, precioCobrado: 3.34 },
    { vendidas: 1, precioCobrado: 3.34 },
  ];
  it("todas las unidades = exactamente lo que queda (3 × 3,34 = 10,02 se pasaba de 10,00)", () => {
    expect(importeDeLineas(lineas, [1, 1, 1], 10)).toBe(10);
  });
  it("una parte suma sus líneas y nunca pasa de lo que queda", () => {
    expect(importeDeLineas(lineas, [1, 0, 0], 10)).toBe(3.34);
    expect(importeDeLineas(lineas, [1, 1, 0], 5)).toBe(5);
    expect(importeDeLineas(lineas, [9, 0, 0], 10)).toBe(3.34);
  });
});

describe("ofrecerDevueltoEnCaja (puro): «Lo devuelto en Caja» no vuelve a proponer lo ya acreditado", () => {
  const devuelta = [{ devueltasEnCaja: 1 }, { devueltasEnCaja: 0 }];
  it("Caja devolvió S/ 11,80 y no hay notas: se ofrece", () => {
    expect(ofrecerDevueltoEnCaja(devuelta, 0, 11.8)).toBe(true);
  });
  it("una nota ya acreditó esos S/ 11,80: se esconde (antes volvía a proponer la misma unidad)", () => {
    expect(ofrecerDevueltoEnCaja(devuelta, 11.8, 11.8)).toBe(false);
    expect(ofrecerDevueltoEnCaja(devuelta, 23.6, 11.8)).toBe(false);
  });
  it("lo acreditado no llega a lo devuelto (1 céntimo menos): se ofrece", () => {
    expect(ofrecerDevueltoEnCaja(devuelta, 11.79, 11.8)).toBe(true);
  });
  it("sin unidades devueltas en Caja no hay nada que ofrecer", () => {
    expect(ofrecerDevueltoEnCaja([{ devueltasEnCaja: 0 }], 0, 11.8)).toBe(false);
  });
});

describe("motivos (puro)", () => {
  it("01/02/06 por todo y con documento; 03 por descripción; 07 por líneas", () => {
    expect(reglaMotivo("06")).toMatchObject({ forma: "todo", requiereDocumento: true });
    expect(reglaMotivo("03").forma).toBe("descripcion");
    expect(reglaMotivo("07").forma).toBe("lineas");
    expect(reglaMotivo("13").forma).toBe("importe");
  });
  it("03 arma «Decía · debe decir»; 02 deja los dos RUC", () => {
    expect(descripcionArmada("03", { libre: "", decia: "Arroz 1kg", debeDecir: "Arroz 5kg" })).toBe("Decía «Arroz 1kg» · debe decir «Arroz 5kg»");
    expect(descripcionArmada("02", { libre: "Error al tipear", rucMal: "20100000001", rucBien: "20100000002" }))
      .toBe("Error al tipear. RUC que salió 20100000001 · RUC correcto 20100000002");
  });
  it("cerrarPorTodo: por base 1 céntimo corto cierra exacto; una parte es error", () => {
    expect(cerrarPorTodo({ desglose: { monto: 8.47, igv: 1.52, total: 9.99 }, disponibleConIgv: 10, porBase: true }))
      .toEqual({ ok: true, desglose: { monto: 8.47, igv: 1.53, total: 10 } });
    expect(cerrarPorTodo({ desglose: { monto: 8.47, igv: 1.52, total: 9.99 }, disponibleConIgv: 10, porBase: false }).ok).toBe(false);
    expect(cerrarPorTodo({ desglose: { monto: 4.24, igv: 0.76, total: 5 }, disponibleConIgv: 10, porBase: true }).ok).toBe(false);
  });
});

const post = (body: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/notas-credito", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motivoCodigo: "07", motivoDesc: "Devolución", ...body }),
  });

describe("POST /api/notas-credito: reglas por motivo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.sumVenta.mockResolvedValue(0);
    h.sumPedido.mockResolvedValue(0);
    h.getSale.mockResolvedValue({ id: "v1", total: 10 });
    h.create.mockImplementation((_t: string, d: Record<string, unknown>) => Promise.resolve({ id: "nc1", ...d }));
  });

  it("motivo fuera del catálogo de SUNAT: 400 sin crear", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await POST(post({ saleId: "v1", monto: 1, motivoCodigo: "99" }));
    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("06 sin documento: 400 (no hay qué devolver entero)", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await POST(post({ monto: 5, motivoCodigo: "06" }));
    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("06 por una parte del documento: 400 con lo que queda", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await POST(post({ saleId: "v1", totalConIgv: 5, motivoCodigo: "06" }));
    expect(res.status).toBe(400);
    expect((await res.json()).disponibleConIgv).toBe(10);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("06 por base de S/ 10,00 (8,47 + 1,52 = 9,99) cierra exacto en 10,00", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await POST(post({ saleId: "v1", monto: 8.47, motivoCodigo: "06" }));
    expect(res.status).toBe(201);
    expect(h.create.mock.calls[0][1]).toMatchObject({ monto: 8.47, igv: 1.53, total: 10 });
  });

  it("01 con S/ 4 ya acreditado va por los 6 que quedan", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    h.sumVenta.mockResolvedValue(4);
    const res = await POST(post({ saleId: "v1", totalConIgv: 6, motivoCodigo: "01" }));
    expect(res.status).toBe(201);
    expect(h.create.mock.calls[0][1]).toMatchObject({ total: 6 });
  });

  it("07 parcial sigue pasando", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await POST(post({ saleId: "v1", totalConIgv: 3 }));
    expect(res.status).toBe(201);
  });
});

const get = (qs: string) => new NextRequest(`http://localhost/api/notas-credito/remanente${qs}`);

describe("GET /api/notas-credito/remanente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.porDocumento.mockResolvedValue([]);
    h.devoluciones.mockResolvedValue([]);
    h.estadoCaja.mockResolvedValue(null);
  });

  it("sin saleId ni orderId: 400", async () => {
    const { GET } = await import("@/app/api/notas-credito/remanente/route");
    expect((await GET(get(""))).status).toBe(400);
  });

  it("venta de otro tenant o inexistente: 404", async () => {
    const { GET } = await import("@/app/api/notas-credito/remanente/route");
    h.getSale.mockResolvedValue(null);
    expect((await GET(get("?saleId=x"))).status).toBe(404);
    expect(h.getSale).toHaveBeenCalledWith("tenant-a", "x");
  });

  it("venta con una nota emitida, otra anulada y una devolución en Caja", async () => {
    const { GET } = await import("@/app/api/notas-credito/remanente/route");
    h.getSale.mockResolvedValue({
      id: "v1", total: 20, createdAt: "2026-10-15T15:00:00.000Z", comprobanteTipo: "boleta",
      items: [{ productId: 1, name: "Arroz", price: 10, quantity: 2 }],
    });
    h.porDocumento.mockResolvedValue([
      { id: "a", total: 5, status: "EMITIDA" },
      { id: "b", total: 15, status: "ANULADA" },
    ]);
    h.estadoCaja.mockResolvedValue({ cobrado: 20, yaReembolsado: 10, queda: 10, yaDevuelto: { 1: 1 } });
    const res = await GET(get("?saleId=v1"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(h.porDocumento).toHaveBeenCalledWith("tenant-a", { saleId: "v1" });
    expect(j.remanente).toMatchObject({ totalDocumento: 20, acreditadoConIgv: 5, disponibleConIgv: 15, notasActivas: 1 });
    expect(j.lineas[0]).toMatchObject({ vendidas: 2, devueltasEnCaja: 1, precioCobrado: 10 });
    expect(j.reembolsadoEnCaja).toBe(10);
    expect(j.tasa).toBeCloseTo(0.18);
  });
});
