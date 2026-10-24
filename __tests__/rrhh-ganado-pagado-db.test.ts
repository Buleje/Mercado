/**
 * `GanadoDB.periodo` resta lo ya pagado el sábado (revisión 24-10): una semana
 * pagada seguía diciendo «Queda por pagar S/ 370» con los 370 en la mano.
 * Lee el gasto por su marca `RRHH-<lunes>-<id>`, sólo de las semanas enteras
 * del período y con el negocio de quien mira.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conceptoDelPeriodo } from "@/lib/adelantos/planilla-lote";
import { periodoDelDescuento } from "@/lib/rrhh/descuentos-planilla";
import { calcularQuedaPorPagar, explicarQuedaPorPagar } from "@/lib/rrhh/ganado";

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  listar: vi.fn(),
  tarifasDe: vi.fn(),
  delPeriodo: vi.fn(),
  saldos: vi.fn(),
  descuentos: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { expense: { findMany: m.findMany } } }));
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({ ColaboradoresDB: { listar: m.listar, tarifasDe: m.tarifasDe } }));
vi.mock("@/lib/db/rrhh-asistencia.db", () => ({ AsistenciaDB: { delPeriodo: m.delPeriodo } }));
vi.mock("@/lib/db/adelantos.db", () => ({
  AdelantosDB: { saldosPorPersona: m.saldos, descuentosDePlanilla: m.descuentos },
}));
// Lo ganado fijo (420 la semana): acá se prueba la resta, no el cálculo del jornal.
vi.mock("@/lib/rrhh/ganado", async (original) => ({
  ...(await original<typeof import("@/lib/rrhh/ganado")>()),
  calcularGanado: vi.fn(() => ({ colaboradorId: "c1", referencia: { modalidad: "SEMANA", monto: 420 }, total: 420, sinMarcar: [], avisos: [] })),
}));

const { GanadoDB } = await import("@/lib/db/rrhh-ganado.db");

const LUNES = "2026-10-19";
const DOMINGO = "2026-10-25";
const MARCA = `RRHH-${LUNES}-c1`;

beforeEach(() => {
  vi.clearAllMocks();
  m.listar.mockResolvedValue([
    { id: "c1", nombre: "Juan Pérez", beneficiarioId: "b1", puesto: null, fechaIngreso: null, fechaCese: null },
  ]);
  m.tarifasDe.mockResolvedValue(new Map());
  m.delPeriodo.mockResolvedValue([]);
  m.saldos.mockResolvedValue([]);
  // El pago le descontó el adelanto de 50 con el concepto de su semana.
  m.descuentos.mockResolvedValue([
    { beneficiarioId: "b1", descripcion: conceptoDelPeriodo(periodoDelDescuento(LUNES, DOMINGO)), fecha: new Date("2026-10-24T15:00:00Z"), valor: 50 },
  ]);
  m.findMany.mockResolvedValue([{ amount: 420, documentNumber: MARCA }]);
});

describe("GanadoDB.periodo: lo pagado el sábado", () => {
  it("semana pagada (420 − 50 de adelanto = 370 en la mano): «Queda por pagar» da 0", async () => {
    const g = await GanadoDB.periodo("t1", { desde: LUNES, hasta: DOMINGO, hoy: DOMINGO });
    const p = g.personas[0];
    expect(p.pagado).toBe(370);
    const q = calcularQuedaPorPagar(p)!;
    expect(q).toMatchObject({ ganado: 420, descontado: 50, pagado: 370, aPagar: 0, deuda: 0 });
    expect(explicarQuedaPorPagar(q)).toContain("ya pagado el sábado");
  });

  it("lee la marca con el negocio de quien mira, sin mayúsculas", async () => {
    await GanadoDB.periodo("t1", { desde: LUNES, hasta: DOMINGO, hoy: DOMINGO });
    expect(m.findMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", documentNumber: { in: [MARCA], mode: "insensitive" } },
      select: { amount: true, documentNumber: true },
    });
  });

  it("la marca en MAYÚSCULAS (papel reescrito en Mi Plata) sigue restando lo pagado", async () => {
    m.findMany.mockResolvedValue([{ amount: 420, documentNumber: MARCA.toUpperCase() }]);
    const g = await GanadoDB.periodo("t1", { desde: LUNES, hasta: DOMINGO, hoy: DOMINGO });
    expect(g.personas[0].pagado).toBe(370);
  });

  it("sin pago esa semana queda lo de siempre: ganado − descontado", async () => {
    m.findMany.mockResolvedValue([]);
    const g = await GanadoDB.periodo("t1", { desde: LUNES, hasta: DOMINGO, hoy: DOMINGO });
    expect(g.personas[0].pagado).toBe(0);
    expect(calcularQuedaPorPagar(g.personas[0])!.aPagar).toBe(370);
  });

  it("el mes mira sus semanas enteras; un período sin semana entera no lee pagos", async () => {
    await GanadoDB.periodo("t1", { desde: "2026-10-01", hasta: "2026-10-31", hoy: "2026-10-31" });
    expect(m.findMany.mock.calls[0][0].where.documentNumber.in).toEqual([
      "RRHH-2026-10-05-c1", "RRHH-2026-10-12-c1", "RRHH-2026-10-19-c1",
    ]);
    m.findMany.mockClear();
    const g = await GanadoDB.periodo("t1", { desde: LUNES, hasta: "2026-10-24", hoy: "2026-10-24" });
    expect(m.findMany).not.toHaveBeenCalled();
    expect(g.personas[0].pagado).toBe(0);
  });
});
