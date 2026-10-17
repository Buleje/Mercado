import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  avisosDeTurnos, calcularDesdeDenominaciones, comparativoDelTurno, diaConFecha, esDiferenciaAnormal, filtrarHistorial,
  FILTROS_INICIALES, statsPorCajero, turnoConAlerta, type Turno,
} from "@/components/admin/turnos/tipos";
import { lineasCorteTurno } from "@/components/admin/turnos/corte-turno";
import { cifrasDeCajaDelTurno } from "@/lib/db/turnos.db";

const base: Turno = {
  id: "t1", adminUserId: "u1", inicioEfectivo: 100, ventasTotal: 24.9, cierreEfectivo: 129.9,
  status: "CERRADO", abrioEn: "2026-10-08T14:00:00.000Z", cerroEn: "2026-10-08T22:00:00.000Z",
  cajeroNombre: "QA Admin", diferencia: 0, esperado: 129.9,
};

describe("turnos · reglas puras", () => {
  it("la diferencia por cajero es la del servidor, no cierre − inicio − ventas", () => {
    // El turno real de main: la resta del cliente daba +S/ 5.00 con la caja cuadrada.
    const [s] = statsPorCajero([base], []);
    expect(s.difCaja).toBe(0);
    expect(s.name).toBe("QA Admin");
    expect(s.horasTotales).toBeCloseTo(8);
  });

  it("los turnos sin dato de caja no suman diferencia", () => {
    const sinCaja = { ...base, id: "t2", diferencia: null, esperado: null };
    expect(statsPorCajero([sinCaja], [])[0].difCaja).toBe(0);
  });

  it("diferencia alta: más de S/ 20 o más del 5 %", () => {
    expect(esDiferenciaAnormal(-21, 1000)).toBe(true);
    expect(esDiferenciaAnormal(-6, 100)).toBe(true);
    expect(esDiferenciaAnormal(-4, 100)).toBe(false);
    expect(turnoConAlerta({ ...base, diferencia: -30, esperado: 300 })).toBe(true);
    expect(turnoConAlerta({ ...base, cerradoPorSistema: true, diferencia: null })).toBe(true);
  });

  it("filtros del historial: cajero, periodo y por revisar", () => {
    const ahora = new Date("2026-10-09T12:00:00.000Z");
    const viejo = { ...base, id: "v", abrioEn: "2026-07-08T05:41:31.000Z", adminUserId: "u2" };
    const malo = { ...base, id: "m", diferencia: -40, esperado: 300 };
    const lista = [base, viejo, malo];
    expect(filtrarHistorial(lista, { ...FILTROS_INICIALES, periodo: "7d" }, ahora).map((t) => t.id)).toEqual(["t1", "m"]);
    expect(filtrarHistorial(lista, { ...FILTROS_INICIALES, cajero: "u2" }, ahora).map((t) => t.id)).toEqual(["v"]);
    expect(filtrarHistorial(lista, { ...FILTROS_INICIALES, soloAlertas: true }, ahora).map((t) => t.id)).toEqual(["m"]);
  });

  it("avisa del turno olvidado a las 10 h y cuenta los cerrados por el sistema", () => {
    const ahora = new Date("2026-10-09T12:00:00.000Z").getTime();
    const abierto: Turno = { ...base, id: "a", status: "ABIERTO", abrioEn: "2026-10-09T01:30:00.000Z", cerroEn: undefined };
    const sistema = { ...base, id: "s", cerradoPorSistema: true, diferencia: null, abrioEn: "2026-10-01T10:00:00.000Z" };
    expect(avisosDeTurnos(abierto, [sistema], ahora)).toEqual([
      { tipo: "turno-largo", horas: 10 },
      { tipo: "cerrados-por-sistema", cantidad: 1 },
    ]);
    expect(avisosDeTurnos({ ...abierto, abrioEn: "2026-10-09T05:00:00.000Z" }, [], ahora)).toEqual([]);
  });

  it("conteo por billete y moneda redondea a céntimos", () => {
    expect(calcularDesdeDenominaciones({ "100": 1, "20": 1, "5": 1, "2": 2, "0.5": 1, "0.2": 2 })).toBe(129.9);
  });

  it("fecha del negocio: «jueves 08/10»", () => {
    expect(diaConFecha("2026-10-08T15:00:00.000Z")).toBe("jueves 08/10");
  });

  it("el corte de turno lleva medio de pago y diferencia sin recalcular", () => {
    const lineas = lineasCorteTurno({
      turnoId: "t1", cajeroNombre: "QA Admin", abrioEn: base.abrioEn, cerroEn: base.cerroEn,
      totalVentas: 24.9, cantidadVentas: 2, ticketPromedio: 12.45, inicioEfectivo: 100, cierreEfectivo: 129.9,
      diferencia: null, metodosPago: [{ metodo: "Yape", total: 10 }, { metodo: "Efectivo", total: 14.9 }],
      topProductos: [{ nombre: "Arroz Costeño 5kg", cantidad: 2 }], totalDescuentos: 0,
    });
    expect(lineas[0]).toBe("CORTE DE TURNO");
    expect(lineas.some((l) => l.startsWith("Yape") && l.endsWith("S/ 10.00"))).toBe(true);
    expect(lineas.find((l) => l.startsWith("Diferencia"))).toMatch(/sin dato$/);
    expect(lineas.every((l) => l.length <= 32)).toBe(true);
  });

  it("un turno cerrado por el sistema no trae diferencia de caja (el cron cuenta Yape como efectivo)", () => {
    const cerroEn = new Date("2026-10-08T22:00:00.000Z");
    const caja = { closedAt: new Date("2026-10-08T22:00:30.000Z"), expectedAmount: 129.9, difference: 95 };
    const sistema = cifrasDeCajaDelTurno({ cerroEn, notas: "Cerrado automaticamente (zombie >12h). Revisar arqueo manual." }, caja);
    expect(sistema).toEqual({ esperado: null, diferencia: null, cerradoPorSistema: true });
    const persona = cifrasDeCajaDelTurno({ cerroEn, notas: null }, caja);
    expect(persona).toEqual({ esperado: 129.9, diferencia: 95, cerradoPorSistema: false });
    // Caja cerrada en otro momento: no es la del turno.
    expect(cifrasDeCajaDelTurno({ cerroEn, notas: null }, { ...caja, closedAt: new Date("2026-10-09T08:00:00.000Z") }).diferencia).toBeNull();
  });

  it("el comparativo usa la fecha del turno y nunca se compara consigo mismo", () => {
    const t = (id: string, dia: string, ventas: number): Turno => ({ ...base, id, abrioEn: `2026-10-${dia}T17:00:00.000Z`, ventasTotal: ventas });
    const historial = [t("hoy", "08", 300), t("ayer", "07", 100), t("antes", "06", 200), t("lejos", "01", 50)];
    // El turno de ayer abierto desde el historial: contra el 06/10, no contra sí mismo.
    const c = comparativoDelTurno(historial, { turnoId: "ayer", abrioEn: historial[1].abrioEn, totalVentas: 100 });
    expect(c.ventasDiaAnterior).toBe(200);
    expect(c.pctDiaAnterior).toBeCloseTo(-50);
    expect(diaConFecha(c.diaAnterior)).toBe("martes 06/10");
    // Promedio de los 7 días previos al turno: 06/10 y 01/10, sin el propio ni el de después.
    expect(c.prom7).toBeCloseTo(125);
  });
});
