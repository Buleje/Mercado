/**
 * ADR-451 — la clase de lectura del resultado y la caja, contra una base falsa.
 *
 * Lo que se fija acá es lo que la función pura no ve: que cada consulta va con el
 * tenant, que lo anulado no llega (despachos anulados, corridas muertas, guías
 * rechazadas o anuladas, adelantos CANCELADO, liquidaciones y entregas anuladas,
 * plantillas de gasto), y que la ventana trae el margen para que la función pura
 * decida el mes (un cargo del 01/10 a las 00:00 UTC).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Where = Record<string, unknown>;

const H = vi.hoisted(() => {
  const llamadas: { modelo: string; metodo: string; args: { where?: Record<string, unknown> } | undefined }[] = [];
  const respuestas: Record<string, (w: Record<string, unknown>) => unknown> = {};
  const modelo = (nombre: string) =>
    new Proxy({}, {
      get: (_t, metodo: string) => async (args: { where?: Record<string, unknown> } | undefined) => {
        llamadas.push({ modelo: nombre, metodo, args });
        const r = respuestas[`${nombre}.${metodo}`];
        if (r) return r(args?.where ?? {});
        if (metodo === "aggregate") return { _sum: {}, _count: 0 };
        if (metodo === "count") return 0;
        if (metodo.startsWith("find") && !metodo.endsWith("Many")) return null;
        return [];
      },
    });
  const prisma = new Proxy({}, { get: (_t, p: string) => (p === "then" ? undefined : modelo(p)) });
  return { llamadas, respuestas, prisma, ganado: vi.fn(), cierres: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({
  getOrSet: (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
  invalidate: () => {},
  invalidateByPrefix: () => {},
  cacheStore: { get: () => null, set: () => {}, del: () => {} },
}));
vi.mock("@/lib/db/rrhh-ganado.db", () => ({ GanadoDB: { periodo: (...a: unknown[]) => H.ganado(...a) } }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: (...a: unknown[]) => H.cierres(...a), closedPeriodOf: async () => null } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { ResultadoNegocioDB } from "@/lib/db/resultado-negocio.db";

const de = (modelo: string, pred: (w: Where) => boolean = () => true) =>
  H.llamadas.filter((c) => c.modelo === modelo && pred((c.args?.where ?? {}) as Where)).map((c) => (c.args?.where ?? {}) as Where);

beforeEach(() => {
  H.llamadas.length = 0;
  for (const k of Object.keys(H.respuestas)) delete H.respuestas[k];
  H.ganado.mockReset();
  H.ganado.mockResolvedValue({ personas: [], total: 0 });
  H.cierres.mockReset();
  H.cierres.mockResolvedValue([]);
});

describe("entradaDelPeriodo: el tenant y lo anulado", () => {
  it("toda consulta va con el tenant; lo anulado no llega a la función pura", async () => {
    await ResultadoNegocioDB.entradaDelPeriodo("t1", "2026-09", "2026-09", "2026-09-29");
    for (const c of H.llamadas) expect(JSON.stringify(c.args), `${c.modelo}.${c.metodo}`).toContain('"tenantId":"t1"');

    // Despachos: sólo los registrados y vivos (los 4 de Blas están anulados).
    expect(de("forestCtpEntry", (w) => w.section === "despacho")[0]).toMatchObject({ tenantId: "t1", section: "despacho", deletedAt: null, status: "registrado" });
    // Compras de madera: sin rechazadas/anuladas y sin la de servicio.
    expect(de("woodEntry")[0]).toMatchObject({ deletedAt: null, status: { notIn: ["rechazado", "anulado"] }, maderaDeTercero: false });
    // Gastos: sin plantillas.
    expect(de("expense")[0]).toMatchObject({ recurring: false });
    // Cuenta forestal: sólo movimientos vivos.
    expect(de("forestCuentaMov")[0]).toMatchObject({ deletedAt: null });
    expect(de("forestFlete")[0]).toMatchObject({ deletedAt: null });
    expect(de("order")[0]).toMatchObject({ deletedAt: null, status: { in: ["confirmado", "en_camino", "entregado"] } });
  });

  it("la ventana trae ±1 día: el mes lo decide la función pura", async () => {
    await ResultadoNegocioDB.entradaDelPeriodo("t1", "2026-09", "2026-09", "2026-09-29");
    const venta = de("sale")[0].createdAt as { gte: Date; lt: Date };
    expect(venta.gte.toISOString()).toBe("2026-08-31T05:00:00.000Z");
    expect(venta.lt.toISOString()).toBe("2026-10-02T05:00:00.000Z");
    const cuenta = de("forestCuentaMov", (w) => Array.isArray(w.OR))[0].OR as Where[];
    const madera = de("forestCuentaMov", (w) => w.concepto === "venta")[0].fecha as { gte: Date };
    expect(madera.gte.toISOString()).toBe("2026-08-31T05:00:00.000Z");
    // Y los cargos fechados después de hoy, para avisar.
    expect(cuenta.some((o) => o.concepto === "aserrio_prestado" && (o.fecha as { gte?: Date }).gte?.toISOString() === "2026-09-29T00:00:00.000Z")).toBe(true);
  });

  it("de la corrida sale el PT y si está viva; el mes del cargo lo corta la función pura", async () => {
    H.respuestas["forestCuentaMov.findMany"] = (w) => w.concepto === "venta" ? [] : [
      { id: "m1", parteId: "p1", parteNombre: "WASACO", fecha: new Date("2026-09-28T00:00:00.000Z"), tipo: "cargo", concepto: "aserrio_prestado", monto: "1268.83", moneda: "PEN", referencia: null, ctpEntryId: "c64", liquidacionId: null, gtfNumber: null },
      { id: "m2", parteId: "p1", parteNombre: "WASACO", fecha: new Date("2026-10-01T00:00:00.000Z"), tipo: "cargo", concepto: "aserrio_prestado", monto: "10", moneda: "PEN", referencia: null, ctpEntryId: "c65", liquidacionId: null, gtfNumber: null },
      { id: "m3", parteId: "p1", parteNombre: "WASACO", fecha: new Date("2026-09-10T00:00:00.000Z"), tipo: "cargo", concepto: "aserrio_prestado", monto: "99", moneda: "PEN", referencia: null, ctpEntryId: "c66", liquidacionId: null, gtfNumber: null },
    ];
    H.respuestas["forestCtpEntry.findMany"] = (w) =>
      w.section === "despacho"
        ? []
        : [
            { id: "c64", lineNo: 64, speciesCommon: "MADERA DURA", quantity: "4.5", unit: "m3", aserrioDetalle: { pt: 2537.44 }, status: "registrado", deletedAt: null },
            { id: "c65", lineNo: 65, speciesCommon: "Tornillo", quantity: null, unit: "m3", aserrioDetalle: null, status: "registrado", deletedAt: null },
            { id: "c66", lineNo: 66, speciesCommon: "Copal", quantity: null, unit: "m3", aserrioDetalle: { pt: 10 }, status: "anulado", deletedAt: null },
          ];
    const r = await ResultadoNegocioDB.resultado("t1", "2026-09", 1, "2026-09-29", { verPlanilla: true });
    const aserrio = r.actual.ingresos.find((x) => x.fuente === "aserrio")!;
    expect(aserrio.monto).toBe(1268.83); // el del 01/10 es de octubre; el de la corrida anulada no suma
    expect(aserrio.pt).toBe(2537.44);
    expect(aserrio.m3).toBe(4.5);
    expect(r.serie).toHaveLength(1);
  });

  it("la planilla se pide por mes con `hoy`; si falla es «—», no 0", async () => {
    H.ganado.mockRejectedValue(new Error("boom"));
    const e = await ResultadoNegocioDB.entradaDelPeriodo("t1", "2026-09", "2026-09", "2026-09-29", { verPlanilla: true });
    expect(H.ganado).toHaveBeenCalledWith("t1", { desde: "2026-09-01", hasta: "2026-09-30", hoy: "2026-09-29" });
    expect(e.planillas["2026-09"]).toBeNull();
  });
});

describe("entradaCaja y pendientes: el tenant y lo anulado", () => {
  it("adelantos sin CANCELADO y en los dos sentidos; liquidaciones y entregas vivas; caja por su registro", async () => {
    await ResultadoNegocioDB.entradaCaja("t1", "2026-09");
    const adel = de("adelanto");
    expect(adel.some((w) => (w.status as Where)?.not === "CANCELADO" && (w.direccion as Where)?.in)).toBe(true);
    expect(de("liquidacionCuenta")[0]).toMatchObject({ tenantId: "t1", anuladaAt: null });
    expect(de("adelantoEntrega")[0]).toMatchObject({ adelanto: { tenantId: "t1" }, anuladaAt: null });
    expect(de("cashMovement")[0]).toMatchObject({ cashRegister: { tenantId: "t1" }, type: { in: ["ingreso", "egreso"] } });
    expect(de("expense")[0]).toMatchObject({ tenantId: "t1", recurring: false });
    expect(de("fiadoCuota")[0]).toMatchObject({ fiado: { tenantId: "t1" } });
  });

  it("pendientes: la cuenta entera (sin fecha), adelantos abiertos de los dos lados", async () => {
    await ResultadoNegocioDB.pendientes("t1", "2026-09-29");
    expect(de("forestCuentaMov")[0]).toEqual({ tenantId: "t1", deletedAt: null });
    expect(de("adelanto")[0]).toMatchObject({ tenantId: "t1", status: "ABIERTO", direccion: { in: ["DADO", "RECIBIDO"] } });
    for (const c of H.llamadas) expect(JSON.stringify(c.args), `${c.modelo}.${c.metodo}`).toContain('"tenantId":"t1"');
  });
});

describe("planilla sólo para quien ve RRHH", () => {
  it("sin permiso no se calcula lo ganado ni se suman los sueldos: la planilla va «—»", async () => {
    const e = await ResultadoNegocioDB.entradaDelPeriodo("t1", "2026-09", "2026-09", "2026-09-29");
    expect(H.ganado).not.toHaveBeenCalled();
    expect(e.planillaOculta).toBe(true);
    const r = await ResultadoNegocioDB.resultado("t1", "2026-09", 1, "2026-09-29", { verPlanilla: false });
    expect(r.actual.costos.find((x) => x.fuente === "planilla")).toMatchObject({ monto: null, certeza: "incompleto", nota: "No tienes acceso a la planilla." });

    const v = await ResultadoNegocioDB.pendientes("t1", "2026-09-29");
    expect(v.planillaPorPagar).toBe("sin_permiso");
    expect(de("expense", (w) => w.category === "personal")).toHaveLength(0);
    expect(H.ganado).not.toHaveBeenCalled();
  });

  it("con permiso sí (planilla por pagar ≈)", async () => {
    H.ganado.mockResolvedValue({ personas: [{ total: 900 }], total: 900 });
    const v = await ResultadoNegocioDB.pendientes("t1", "2026-09-29", { verPlanilla: true });
    expect(v.planillaPorPagar).toEqual({ monto: 900, personas: 1 });
  });
});

describe("revisión ADR-451: la guía entera y la entrega en plata", () => {
  // Una base falsa que SÍ filtra por fecha y por guía, como Postgres.
  const enRango = (d: Date, r?: unknown) => {
    const x = (r ?? {}) as { gte?: Date; lt?: Date; lte?: Date };
    return (!x.gte || d >= x.gte) && (!x.lt || d < x.lt) && (!x.lte || d <= x.lte);
  };
  const enLista = (v: string | null, r?: unknown) => !r || ((r as { in?: string[] }).in ?? []).includes(v ?? "");
  const COMPRAS = [
    { id: "w1", gtfNumber: "G-C", entryDate: new Date("2026-08-10T00:00:00.000Z"), costoTotal: 100, moneda: "PEN", providerName: "X", volumeM3: 1 },
    { id: "w2", gtfNumber: "G-C", entryDate: new Date("2026-09-05T00:00:00.000Z"), costoTotal: 200, moneda: "PEN", providerName: "X", volumeM3: 1 },
  ];
  const VENTAS = [
    { id: "v1", parteId: "p1", parteNombre: "CLIENTE", fecha: new Date("2026-09-15T00:00:00.000Z"), tipo: "cargo", concepto: "venta", monto: 1000, moneda: "PEN", referencia: "G1", ctpEntryId: null, liquidacionId: null, gtfNumber: null },
  ];
  const DESPACHOS = [
    { id: "d1", lineNo: 9, productType: "aserrada", speciesCommon: "Tornillo", gtfNumber: "G1", quantity: 1, moneda: "PEN", valorVenta: 1000, entryDate: new Date("2026-07-20T00:00:00.000Z") },
  ];
  const sembrar = () => {
    H.respuestas["woodEntry.findMany"] = (w) => COMPRAS.filter((c) => enLista(c.gtfNumber, w.gtfNumber) && enRango(c.entryDate, w.entryDate));
    H.respuestas["forestCuentaMov.findMany"] = (w) => {
      if (w.concepto !== "venta") return [];
      const or = (w.OR as Where[] | undefined) ?? null;
      return VENTAS.filter(
        (v) => enRango(v.fecha, w.fecha) && (!or || or.some((o) => (o.referencia && enLista(v.referencia, o.referencia)) || (o.gtfNumber && enLista(v.gtfNumber, o.gtfNumber)))),
      );
    };
    H.respuestas["forestCtpEntry.findMany"] = (w) =>
      w.section === "despacho" ? DESPACHOS.filter((d) => enLista(d.gtfNumber, w.gtfNumber) && enRango(d.entryDate, w.entryDate)) : [];
  };

  it("5. `actual` no cambia con `meses`, y el detalle cierra con su renglón", async () => {
    sembrar();
    const r1 = await ResultadoNegocioDB.resultado("t1", "2026-09", 1, "2026-09-29", { verPlanilla: false });
    const r6 = await ResultadoNegocioDB.resultado("t1", "2026-09", 6, "2026-09-29", { verPlanilla: false });
    expect(r1.actual).toEqual(r6.actual);
    expect(r1.actual.memo.compras).toBe(0); // la guía G-C empezó en agosto
    expect(r6.serie.find((p) => p.mes === "2026-08")).toBeTruthy();
    expect(r1.actual.ingresos.find((x) => x.fuente === "madera_vendida")!.monto).toBe(1000);
    for (const fuente of ["madera_vendida", "costo_madera", "compras_madera"] as const) {
      const d = await ResultadoNegocioDB.detalle("t1", "2026-09", fuente, "2026-09-29", { verPlanilla: false });
      const renglon = fuente === "compras_madera" ? r1.actual.memo.compras : [...r1.actual.ingresos, ...r1.actual.costos].find((x) => x.fuente === fuente)!.monto;
      expect(d.total, fuente).toBe(renglon);
    }
    // La guía entera se pidió por su número, sin tope de fecha.
    expect(de("woodEntry", (w) => Boolean(w.gtfNumber)).some((w) => !("entryDate" in w))).toBe(true);
    expect(de("forestCtpEntry", (w) => Boolean(w.gtfNumber)).some((w) => !("entryDate" in w))).toBe(true);
  });

  it("1. la entrega trae su adelanto (código, dirección, persona) para emparejar su movimiento de caja", async () => {
    H.respuestas["adelantoEntrega.findMany"] = () => [
      { id: "en3", fecha: new Date("2026-09-29T01:37:49Z"), valor: "1200", liquidacionId: null, adelanto: { codigoOperacion: "ADL-2026-0001", direccion: "DADO", beneficiario: { nombre: "MAMA DE ALEX" } } },
    ];
    H.respuestas["cashMovement.findMany"] = () => [
      { id: "cm7", type: "ingreso", amount: "1200", description: "Liquidación de adelanto ADL-2026-0001 · MAMA DE ALEX", createdAt: new Date("2026-09-29T01:37:00Z") },
    ];
    const r = await ResultadoNegocioDB.caja("t1", "2026-09", "2026-09-29", { verPlanilla: false });
    expect(r.caja.totalEntro).toBe(1200);
    expect(r.caja.nuncaCaja.monto).toBe(0);
    // `pago_hecho` se pide junto con los pagos sueltos.
    expect((de("forestCuentaMov", (w) => Array.isArray(w.OR))[0].OR as Where[])[0]).toEqual({ concepto: { in: ["pago", "pago_hecho", "compensacion"] } });
    // Los gastos traen su guía (el de guía sin pagar no salió).
    expect(H.llamadas.find((c) => c.modelo === "expense")?.args).toMatchObject({ select: { gtfNumber: true } });
  });

  it("las etiquetas de la caja siguen empezando como las empareja la función pura", async () => {
    const { etiquetaIngreso, etiquetaRecibido } = await import("@/lib/adelantos/movimiento-caja");
    const { PREFIJO_DEVOLUCION_DADO, PREFIJO_DEVOLUCION_RECIBIDO } = await import("@/lib/finance/resultado-del-negocio");
    expect(etiquetaIngreso("ADL-2026-0001", "X").startsWith(PREFIJO_DEVOLUCION_DADO)).toBe(true);
    expect(etiquetaRecibido("devolucion", "ADL-2026-0025", "X").startsWith(PREFIJO_DEVOLUCION_RECIBIDO)).toBe(true);
    // Y la anulación NO: esa no es una devolución.
    expect(etiquetaRecibido("anulacion", "ADL-2026-0025", "X").startsWith(PREFIJO_DEVOLUCION_RECIBIDO)).toBe(false);
  });

  it("8. lo que viene suma sólo el saldo forestal en soles; lo demás va aparte", async () => {
    H.respuestas["forestCuentaMov.findMany"] = () => [
      { parteId: "p1", parteNombre: "WASACO", tipo: "cargo", monto: "100", fecha: new Date("2026-09-10T00:00:00.000Z"), moneda: "PEN" },
      { parteId: "p2", parteNombre: "GRINGO SAC", tipo: "cargo", monto: "50", fecha: new Date("2026-09-10T00:00:00.000Z"), moneda: "USD" },
    ];
    const v = await ResultadoNegocioDB.pendientes("t1", "2026-09-29");
    expect(v.saldosCuenta).toEqual([{ parteId: "p1", nombre: "WASACO", saldo: 100 }]);
    expect(v.otrasMonedasCuenta).toEqual([{ moneda: "USD", cuantos: 1, total: 50 }]);
  });
});
