/**
 * La tasa de un préstamo es MENSUAL (11-10, Brandon: «que la tasa mensual se
 * cobre como mensual»). Hasta hoy el servidor la dividía entre 12: S/ 1.000 al
 * 2 % en 3 cuotas daba S/ 334,45 por cuota en vez de S/ 346,75.
 *
 * Sistema francés: cuota = P·i / (1 − (1 + i)^−n), i mensual. Todo en céntimos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  capitalPendiente,
  cuotaFijaFrancesCentimos,
  fechaDeCuota,
  fechaDelFormulario,
  generarCuotas,
  tablaDeAmortizacion,
  tasaMensualDecimal,
} from "@/lib/prestamos/amortizacion";

const mockPrestamoCreate = vi.fn();
const mockPrestamoFindFirst = vi.fn();
const mockPrestamoUpdateMany = vi.fn();
const mockCuotaDeleteMany = vi.fn();
const mockCuotaCreateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prestamo: {
      create: (...a: unknown[]) => mockPrestamoCreate(...a),
      findFirst: (...a: unknown[]) => mockPrestamoFindFirst(...a),
      updateMany: (...a: unknown[]) => mockPrestamoUpdateMany(...a),
    },
    prestamoCuota: {
      deleteMany: (...a: unknown[]) => mockCuotaDeleteMany(...a),
      createMany: (...a: unknown[]) => mockCuotaCreateMany(...a),
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { PrestamosDB } from "@/lib/db/prestamos.db";

const INICIO = new Date("2026-10-11T12:00:00.000Z");
const centimos = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0);

beforeEach(() => vi.clearAllMocks());

describe("tasa mensual — cronograma", () => {
  it("2 (por ciento mensual) = 0,02 al mes, no 0,02/12", () => {
    expect(tasaMensualDecimal(2)).toBe(0.02);
    expect(tasaMensualDecimal(0)).toBe(0);
    expect(tasaMensualDecimal(-1)).toBe(0);
    expect(tasaMensualDecimal(Number.NaN)).toBe(0);
  });

  it("S/ 1.000 al 2 % mensual en 3 cuotas (francés) → S/ 346,75 por cuota, no 334,45", () => {
    expect(cuotaFijaFrancesCentimos(100000, 0.02, 3)).toBe(34675);
    const c = generarCuotas(1000, 2, 3, "FRANCES", 0, INICIO);
    expect(c.map((x) => x.monto)).toEqual([346.75, 346.75, 346.77]);
    expect(c.map((x) => x.interes)).toEqual([20, 13.47, 6.8]);
    expect(c[0].monto).not.toBe(334.45);
    // El capital devuelto es exactamente lo prestado; la última cuota cierra el redondeo.
    expect(centimos(c.map((x) => x.capital))).toBe(100000);
    for (const x of c) expect(Math.round(x.monto * 100)).toBe(Math.round(x.capital * 100) + Math.round(x.interes * 100));
  });

  it("tasa 0: sin interés y el capital repartido al céntimo", () => {
    const c = generarCuotas(1000, 0, 3, "FRANCES", 0, INICIO);
    expect(c.map((x) => x.monto)).toEqual([333.33, 333.33, 333.34]);
    expect(c.every((x) => x.interes === 0)).toBe(true);
  });

  it("1 cuota al 2 %: capital + un mes de interés", () => {
    const c = generarCuotas(1000, 2, 1, "FRANCES", 0, INICIO);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ numeroCuota: 1, monto: 1020, capital: 1000, interes: 20 });
  });

  it("12 cuotas al 2 % mensual → cuota S/ 94,56 y S/ 134,70 de interés", () => {
    const c = generarCuotas(1000, 2, 12, "FRANCES", 0, INICIO);
    expect(c).toHaveLength(12);
    expect(c[0].monto).toBe(94.56);
    expect(c[0].interes).toBe(20);
    expect(centimos(c.map((x) => x.capital))).toBe(100000);
    expect(centimos(c.map((x) => x.interes))).toBe(13470);
  });

  it("vence una cuota por mes desde el desembolso", () => {
    const c = generarCuotas(1000, 2, 3, "FRANCES", 0, INICIO);
    expect(c.map((x) => x.fechaVence.toISOString().slice(0, 10))).toEqual(["2026-11-11", "2026-12-11", "2027-01-11"]);
  });

  it("gracia: meses de sólo interés (2 % del capital) y después la cuota fija", () => {
    const c = generarCuotas(1000, 2, 3, "FRANCES", 1, INICIO);
    expect(c.map((x) => x.monto)).toEqual([20, 346.75, 346.75, 346.77]);
    expect(c[0].capital).toBe(0);
  });

  it("alemán: capital fijo y el interés mensual sobre el saldo", () => {
    const c = generarCuotas(1000, 2, 4, "ALEMAN", 0, INICIO);
    expect(c.map((x) => x.capital)).toEqual([250, 250, 250, 250]);
    expect(c.map((x) => x.interes)).toEqual([20, 15, 10, 5]);
  });

  it("americano: 2 % al mes y el capital entero al final", () => {
    const c = generarCuotas(1000, 2, 3, "AMERICANO", 0, INICIO);
    expect(c.map((x) => x.monto)).toEqual([20, 20, 1020]);
  });
});

describe("capitalPendiente — lo que se refinancia", () => {
  it("suma el capital de las cuotas sin pagar, no su monto (que ya trae interés)", () => {
    const c = generarCuotas(1000, 2, 3, "FRANCES", 0, INICIO).map((x, k) => ({
      ...x,
      pagadoEn: k === 0 ? "2026-11-11T00:00:00.000Z" : undefined,
    }));
    expect(capitalPendiente(c)).toBe(673.25);
  });

  it("cuotas viejas sin desglose (capital e interés en 0) cuentan su monto", () => {
    expect(capitalPendiente([{ monto: 500, capital: 0, interes: 0 }])).toBe(500);
  });
});

function filaPrestamo(cuotas: ReturnType<typeof generarCuotas>, pagadas: number) {
  const ahora = new Date("2026-10-11T00:00:00.000Z");
  return {
    id: "p1", tenantId: "t1", tipo: "PERSONAL", direccion: "DADO", monto: 1000, moneda: "PEN",
    tasaInteres: 2, tea: null, moraInteres: 0, numeroCuotas: 3, sistemaAmortizacion: "FRANCES",
    periodoGracia: 0, status: "ACTIVO", notas: null, createdAt: ahora, updatedAt: ahora,
    cuotas: cuotas.map((x, k) => ({
      id: `c${k + 1}`, prestamoId: "p1", ...x, moraCalculada: 0,
      pagadoEn: k < pagadas ? ahora : null, montoPagado: k < pagadas ? x.monto : null,
    })),
    documentos: [],
  };
}

describe("PrestamosDB — el servidor guarda las cuotas con la tasa mensual", () => {
  it("create: S/ 1.000 al 2 % en 3 cuotas guarda 346,75 / 346,75 / 346,77", async () => {
    mockPrestamoCreate.mockImplementation(({ data }: { data: { cuotas: { create: unknown[] } } }) =>
      Promise.resolve(filaPrestamo(data.cuotas.create as ReturnType<typeof generarCuotas>, 0)),
    );
    const p = await PrestamosDB.create({ tenantId: "t1", monto: 1000, tasaInteres: 2, numeroCuotas: 3 });
    const guardadas = mockPrestamoCreate.mock.calls[0][0].data.cuotas.create as Array<{ monto: number }>;
    expect(guardadas.map((c) => c.monto)).toEqual([346.75, 346.75, 346.77]);
    expect(p.cuotas.map((c) => c.monto)).toEqual([346.75, 346.75, 346.77]);
  });

  it("refinanciar: recalcula sobre el capital pendiente (673,25), no sobre las cuotas con interés (693,52)", async () => {
    const original = generarCuotas(1000, 2, 3, "FRANCES", 0, INICIO);
    mockPrestamoFindFirst.mockResolvedValue(filaPrestamo(original, 1));
    mockCuotaDeleteMany.mockResolvedValue({ count: 2 });
    mockCuotaCreateMany.mockResolvedValue({ count: 2 });
    mockPrestamoUpdateMany.mockResolvedValue({ count: 1 });

    await PrestamosDB.refinanciar("t1", "p1", { nuevasCuotas: 2 });

    const nuevas = mockCuotaCreateMany.mock.calls[0][0].data as Array<{ numeroCuota: number; capital: number; monto: number }>;
    expect(nuevas.map((c) => c.numeroCuota)).toEqual([2, 3]);
    expect(centimos(nuevas.map((c) => c.capital))).toBe(67325);
    // 673,25 al 2 % mensual en 2 cuotas: P·i/(1−(1+i)^−2) = 346,76 (sobre 693,52 habría sido 357,20)
    expect(nuevas[0].monto).toBe(346.76);
    expect(mockPrestamoFindFirst.mock.calls[0][0].where).toEqual({ id: "p1", tenantId: "t1" });
  });
});

describe("vencimientos a fin de mes", () => {
  const dia = (d: Date) => d.toISOString().slice(0, 10);

  it("desembolso el 31-01: vence el último día de cada mes corto, nunca el 03-03", () => {
    const c = generarCuotas(1000, 2, 4, "FRANCES", 0, new Date("2026-01-31"));
    expect(c.map((x) => dia(x.fechaVence))).toEqual(["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("bisiesto y cambio de año: 31-12 → 31-01 → 29-02-2028", () => {
    expect(dia(fechaDeCuota(new Date("2027-12-31"), 1))).toBe("2028-01-31");
    expect(dia(fechaDeCuota(new Date("2027-12-31"), 2))).toBe("2028-02-29");
    expect(dia(fechaDeCuota(new Date("2026-08-30"), 6))).toBe("2027-02-28");
  });

  it("guarda la hora del desembolso (el «hoy» del alta sin fecha)", () => {
    expect(fechaDeCuota(new Date("2026-10-11T15:30:00.000Z"), 1).toISOString()).toBe("2026-11-11T15:30:00.000Z");
  });
});

describe("vista previa de la Calculadora = lo que guarda el servidor", () => {
  it("S/ 1.000 · 2 % · 3: cuota 346,75, total 1.040,27 (antes la vista decía 1.040,26) y saldo final 0", () => {
    const t = tablaDeAmortizacion(1000, 2, 3, "FRANCES");
    const guardado = generarCuotas(1000, 2, 3, "FRANCES", 0, INICIO);
    expect(t.map((f) => f.cuota)).toEqual(guardado.map((c) => c.monto));
    expect(centimos(t.map((f) => f.cuota))).toBe(104027);
    expect(t.map((f) => f.saldo)).toEqual([673.25, 339.97, 0]);
    expect(t.map((f) => f.num)).toEqual([1, 2, 3]);
  });
});

describe("fecha del formulario sin hora = ese día en Lima", () => {
  const enLima = (d: Date) => d.toLocaleDateString("es-PE", { timeZone: "America/Lima" });

  it("desembolso «2026-01-31»: la cuota del 28-02 se ve 28/2 en Lima, no 27/2", () => {
    const inicio = fechaDelFormulario("2026-01-31");
    expect(inicio.toISOString()).toBe("2026-01-31T12:00:00.000Z");
    const c = generarCuotas(1000, 2, 3, "FRANCES", 0, inicio);
    expect(c.map((x) => enLima(x.fechaVence))).toEqual(["28/2/2026", "31/3/2026", "30/4/2026"]);
  });

  it("con hora se respeta tal cual", () => {
    expect(fechaDelFormulario("2026-10-11T15:30:00.000Z").toISOString()).toBe("2026-10-11T15:30:00.000Z");
  });
});
