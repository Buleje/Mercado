import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  class EspecieCatalogoError extends Error {}
  const trozas: { id: string; woodEntryId: string; orden: number }[] = [];
  return {
    EspecieCatalogoError,
    trozas,
    tenant: { value: null as { id: string; slug: string; name: string } | null },
    lotes: { value: [] as { notes?: string }[] },
    ingresosPrevios: { value: 0 },
    TenantsDB: { getBasicById: vi.fn() },
    WoodEntriesDB: { create: vi.fn(), listPorGuia: vi.fn(), trozasDelPatio: vi.fn() },
    ForestLoteAserrioDB: { list: vi.fn(), create: vi.fn(), consumirEnPatio: vi.fn() },
    ForestCtpDB: { declararProduccion: vi.fn(), create: vi.fn() },
    ForestEspeciesDB: { agregar: vi.fn() },
    ForestPlanDB: { crearPlanConEspecies: vi.fn() },
    ForestDirectorioDB: { guardarParte: vi.fn() },
    ForestCubicacionesDB: { save: vi.fn() },
    ForestCuentaDB: { guardar: vi.fn() },
  };
});

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: m.TenantsDB }));
vi.mock("@/lib/db/wood-entries.db", () => ({ WoodEntriesDB: m.WoodEntriesDB }));
vi.mock("@/lib/db/forest-lote-aserrio.db", () => ({ ForestLoteAserrioDB: m.ForestLoteAserrioDB }));
vi.mock("@/lib/db/forest-ctp.db", () => ({ ForestCtpDB: m.ForestCtpDB }));
vi.mock("@/lib/db/forest-especies.db", () => ({ ForestEspeciesDB: m.ForestEspeciesDB, EspecieCatalogoError: m.EspecieCatalogoError }));
vi.mock("@/lib/db/forest-plan.db", () => ({ ForestPlanDB: m.ForestPlanDB }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: m.ForestDirectorioDB }));
vi.mock("@/lib/db/forest-cubicaciones.db", () => ({ ForestCubicacionesDB: m.ForestCubicacionesDB }));
vi.mock("@/lib/db/forest-cuenta.db", () => ({ ForestCuentaDB: m.ForestCuentaDB }));

import { sembrarDemoAserradero, DemoAserraderoError } from "@/lib/onboarding/demo-aserradero";
import { MARCA_DEMO, cifrasPaquete, esTenantDemo, planDemoAserradero, verificarCuadre } from "@/lib/onboarding/demo-aserradero-datos";
import { pieTablarRolloDe } from "@/lib/forestal/loctp-catalogos";

const DEMO = { id: "cdemo000000000000000001", slug: "demo-aserradero", name: "Demo" };
const HOY = new Date("2026-11-04T15:00:00Z");

const escrituras = () =>
  [
    m.WoodEntriesDB.create, m.ForestLoteAserrioDB.create, m.ForestLoteAserrioDB.consumirEnPatio, m.ForestCtpDB.declararProduccion,
    m.ForestCtpDB.create, m.ForestEspeciesDB.agregar, m.ForestPlanDB.crearPlanConEspecies, m.ForestDirectorioDB.guardarParte,
    m.ForestCubicacionesDB.save, m.ForestCuentaDB.guardar,
  ].reduce((s, f) => s + f.mock.calls.length, 0);

beforeEach(() => {
  vi.clearAllMocks();
  m.trozas.length = 0;
  m.tenant.value = DEMO;
  m.lotes.value = [];
  m.ingresosPrevios.value = 0;
  m.TenantsDB.getBasicById.mockImplementation(async () => m.tenant.value);
  m.ForestLoteAserrioDB.list.mockImplementation(async () => m.lotes.value);
  m.WoodEntriesDB.listPorGuia.mockImplementation(async () => ({ guias: [], total: m.ingresosPrevios.value, lineas: 0 }));
  let n = 0;
  m.WoodEntriesDB.create.mockImplementation(async (_t: string, input: { trozas: { orden: number }[] }) => {
    const id = `we-${++n}`;
    for (const t of input.trozas) m.trozas.push({ id: `${id}-t${t.orden}`, woodEntryId: id, orden: t.orden });
    return { id };
  });
  m.WoodEntriesDB.trozasDelPatio.mockImplementation(async () => [...m.trozas]);
  m.ForestLoteAserrioDB.create.mockImplementation(async () => ({ id: `lote-${++n}` }));
  m.ForestLoteAserrioDB.consumirEnPatio.mockImplementation(async (_t: string, i: { trozaIds: string[] }) => ({
    corrida: { id: `corr-${++n}`, lineNo: n }, piezas: i.trozaIds.length, volumenM3: 0, rechazadas: [],
  }));
  m.ForestCtpDB.create.mockResolvedValue({ id: "desp-1" });
  m.ForestDirectorioDB.guardarParte.mockImplementation(async (_t: string, p: { nombre: string }) => ({ id: `parte-${p.nombre.length}` }));
});

describe("sembrarDemoAserradero · guardas", () => {
  it.each([["cmpxiv6p4000bohvzwl6bnfpv"], ["main"], [""]])("nunca siembra en %s (ni lo busca)", async (id) => {
    await expect(sembrarDemoAserradero(id, { hoy: HOY })).rejects.toMatchObject({ codigo: "TENANT_PROHIBIDO" });
    expect(m.TenantsDB.getBasicById).not.toHaveBeenCalled();
    expect(escrituras()).toBe(0);
  });

  it("un negocio sin slug demo- se rechaza", async () => {
    m.tenant.value = { id: "cotro", slug: "aserradero-real", name: "X" };
    await expect(sembrarDemoAserradero("cotro", { hoy: HOY })).rejects.toBeInstanceOf(DemoAserraderoError);
    expect(escrituras()).toBe(0);
  });

  it("un negocio demo con un ingreso previo aborta sin escribir", async () => {
    m.ingresosPrevios.value = 1;
    await expect(sembrarDemoAserradero(DEMO.id, { hoy: HOY })).rejects.toMatchObject({ codigo: "CON_DATOS" });
    expect(escrituras()).toBe(0);
  });

  it("un negocio demo con un lote ajeno aborta sin escribir", async () => {
    m.lotes.value = [{ notes: "lote cargado a mano" }];
    await expect(sembrarDemoAserradero(DEMO.id, { hoy: HOY })).rejects.toMatchObject({ codigo: "CON_DATOS" });
    expect(escrituras()).toBe(0);
  });

  it("esTenantDemo: el slug tiene que ser demo-<algo> y nunca Blas/main", () => {
    expect(esTenantDemo({ id: "c1", slug: "demo-x" })).toBe(true);
    expect(esTenantDemo({ id: "c1", slug: "demo-" })).toBe(false);
    expect(esTenantDemo({ id: "main", slug: "demo-x" })).toBe(false);
    expect(esTenantDemo(null)).toBe(false);
  });
});

describe("sembrarDemoAserradero · idempotencia y recorrido", () => {
  it("si ya hay un lote con la marca, sale sin escribir", async () => {
    m.lotes.value = [{ notes: `Lote demo · ${MARCA_DEMO}` }];
    const r = await sembrarDemoAserradero(DEMO.id, { hoy: HOY });
    expect(r.yaSembrado).toBe(true);
    expect(escrituras()).toBe(0);
  });

  it("siembra el recorrido completo con las cifras del plan", async () => {
    const r = await sembrarDemoAserradero(DEMO.id, { hoy: HOY });
    expect(r.yaSembrado).toBe(false);
    expect(r.filas).toEqual({ especies: 2, partes: 2, planes: 1, ingresos: 2, trozas: 11, lotes: 2, corridas: 2, despachos: 1, cubicaciones: 1, movimientos: 2 });
    for (const call of [...m.WoodEntriesDB.create.mock.calls, ...m.ForestCtpDB.create.mock.calls]) expect(call[0]).toBe(DEMO.id);
    // Consume sólo las primeras trozas de SU ingreso.
    const [tornillo, cumala] = m.ForestLoteAserrioDB.consumirEnPatio.mock.calls.map((c) => c[1].trozaIds as string[]);
    expect(tornillo).toEqual(["we-1-t1", "we-1-t2", "we-1-t3", "we-1-t4"]);
    expect(cumala).toEqual(["we-2-t1", "we-2-t2", "we-2-t3"]);
    // El despacho sale de la corrida del tornillo y no supera lo producido.
    const desp = m.ForestCtpDB.create.mock.calls[0][1];
    const corridaTornillo = m.ForestCtpDB.declararProduccion.mock.calls[0][1];
    expect(desp.origenes).toEqual([{ produccionEntryId: corridaTornillo, quantity: r.plan.despacho.m3 }]);
    expect(desp.quantity).toBeLessThanOrEqual(m.ForestCtpDB.declararProduccion.mock.calls[0][2].quantity);
    // El cliente queda debiendo (cargo − abono > 0).
    const [cargo, abono] = m.ForestCuentaDB.guardar.mock.calls.map((c) => c[1]);
    expect(cargo).toMatchObject({ tipo: "cargo", concepto: "venta", monto: 2520 });
    expect(abono).toMatchObject({ tipo: "abono", concepto: "pago", monto: 1000 });
  });

  it("una especie que ya está en el catálogo no corta la siembra", async () => {
    m.ForestEspeciesDB.agregar.mockRejectedValueOnce(new m.EspecieCatalogoError("ya existe"));
    const r = await sembrarDemoAserradero(DEMO.id, { hoy: HOY });
    expect(r.filas.especies).toBe(1);
    expect(r.filas.despachos).toBe(1);
  });
});

describe("planDemoAserradero · cifras que cuadran", () => {
  const plan = planDemoAserradero(HOY);

  it("verificarCuadre no encuentra nada", () => {
    expect(verificarCuadre(plan)).toEqual([]);
  });

  it("saldo = ingreso − consumo y PT de rollo = m³ × 56 % × 424", () => {
    for (const e of plan.especies) {
      expect(e.saldoM3).toBeCloseTo(e.ingresoM3 - e.consumoM3, 3);
      expect(e.ingresoPtRollo).toBe(Math.round(e.ingresoM3 * 0.56 * 424));
      expect(e.ingresoPtRollo).toBe(pieTablarRolloDe(e.ingresoM3));
      expect(e.producidoM3).toBeLessThanOrEqual(e.consumoM3 * 0.75);
    }
  });

  it("aserrada: m³ = Σ PT ÷ 424 redondeado una vez por paquete", () => {
    expect(cifrasPaquete({ cantidad: 60, espesorPulg: 2, anchoPulg: 6, largoPies: 10 })).toEqual({ pt: 600, m3: 1.415 });
    expect(cifrasPaquete({ cantidad: 80, espesorPulg: 1, anchoPulg: 8, largoPies: 8 })).toEqual({ pt: 426.67, m3: 1.006 });
    expect(plan.despacho).toMatchObject({ pt: 600, m3: 1.415, montoVenta: 2520, debe: 1520 });
  });

  it("las fechas quedan al mediodía UTC y en orden ingreso < consumo < despacho", () => {
    expect(plan.fechas.ingreso.getUTCHours()).toBe(12);
    expect(plan.fechas.ingreso < plan.fechas.consumo && plan.fechas.consumo < plan.fechas.despacho).toBe(true);
  });
});
