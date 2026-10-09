import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMonthYear } from "@/lib/format";
import { useDescontarAdelantos } from "@/components/admin/rrhh/ganado/use-descontar-adelantos";
import { descuentoEsDelPeriodo, periodoDelDescuento, rangoDelPeriodo } from "@/lib/rrhh/descuentos-planilla";

describe("periodoDelDescuento", () => {
  it("un mes entero se escribe como el modal de Adelantos", () => {
    expect(periodoDelDescuento("2026-09-01", "2026-09-30")).toBe(formatMonthYear(new Date(Date.UTC(2026, 8, 15, 12)), { largo: true }));
    expect(periodoDelDescuento("2026-02-01", "2026-02-28")).toMatch(/2026/);
  });
  it("una semana o un rango, con fechas", () => {
    expect(periodoDelDescuento("2026-09-29", "2026-10-05")).toBe("del 29/09 al 05/10/2026");
    expect(periodoDelDescuento("2026-10-01", "2026-10-09")).toBe("del 01/10 al 09/10/2026");
    expect(periodoDelDescuento("2025-12-29", "2026-01-04")).toBe("del 29/12/2025 al 04/01/2026");
  });
});

describe("descuentoEsDelPeriodo — qué descuento resta en qué período", () => {
  const SET = periodoDelDescuento("2026-09-01", "2026-09-30");
  const concepto = (p: string) => `Descuento por planilla · ${p}`;

  it("lee el período del concepto, ida y vuelta con periodoDelDescuento", () => {
    expect(rangoDelPeriodo(SET)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoDelPeriodo("septiembre de 2026")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoDelPeriodo("del 29/12/2025 al 04/01/2026")).toEqual({ desde: "2025-12-29", hasta: "2026-01-04" });
    expect(rangoDelPeriodo("quincena 1")).toBeNull();
  });
  it("setiembre pagado el 2 de octubre: cuenta en setiembre y NO en octubre", () => {
    const e = { descripcion: concepto(SET), dia: "2026-10-02" };
    expect(descuentoEsDelPeriodo(e, "2026-09-01", "2026-09-30")).toBe(true);
    expect(descuentoEsDelPeriodo(e, "2026-10-01", "2026-10-31")).toBe(false);
  });
  it("una semana entra en su mes; el mes no entra en una semana", () => {
    expect(descuentoEsDelPeriodo({ descripcion: concepto("del 01/10 al 07/10/2026"), dia: "2026-10-08" }, "2026-10-01", "2026-10-31")).toBe(true);
    expect(descuentoEsDelPeriodo({ descripcion: concepto("octubre de 2026"), dia: "2026-10-03" }, "2026-10-01", "2026-10-07")).toBe(false);
  });
  it("concepto a mano: por el día en que se anotó; otra entrega no cuenta", () => {
    expect(descuentoEsDelPeriodo({ descripcion: concepto("quincena 1"), dia: "2026-10-05" }, "2026-10-01", "2026-10-15")).toBe(true);
    expect(descuentoEsDelPeriodo({ descripcion: concepto("quincena 1"), dia: "2026-10-20" }, "2026-10-01", "2026-10-15")).toBe(false);
    expect(descuentoEsDelPeriodo({ descripcion: "Pago en efectivo", dia: "2026-10-05" }, "2026-10-01", "2026-10-31")).toBe(false);
    expect(descuentoEsDelPeriodo({ descripcion: null, dia: "2026-10-05" }, "2026-10-01", "2026-10-31")).toBe(false);
  });
});

const adelanto = (modalidad: string) => ({
  id: `a-${modalidad}`, modalidad, status: "ABIERTO", saldoPendiente: 300, direccion: "DADO",
  moneda: "PEN", beneficiario: { nombre: "Juan" },
});

function responder(lista: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => lista })));
}

afterEach(() => vi.unstubAllGlobals());

describe("useDescontarAdelantos", () => {
  const persona = { nombre: "Juan", beneficiarioId: "b1" };

  it("con un adelanto de planilla abre el modal con el período", async () => {
    responder([adelanto("DESCUENTO_PLANILLA"), adelanto("CUENTA_CORRIENTE")]);
    const { result } = renderHook(() => useDescontarAdelantos());
    await act(async () => { await result.current.descontar(persona, "2026-09-29", "2026-10-05"); });
    expect(result.current.abierto?.periodo).toBe("del 29/09 al 05/10/2026");
    expect(result.current.abierto?.adelantos).toHaveLength(2);
    expect(result.current.sinPlanilla).toBeNull();
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain("beneficiarioId=b1");
    expect(url).toContain("status=ABIERTO");
  });

  it("sin ninguno de planilla avisa en vez de abrir un modal vacío", async () => {
    responder([adelanto("CUENTA_CORRIENTE"), adelanto("ENTREGAS_PACTADAS")]);
    const { result } = renderHook(() => useDescontarAdelantos());
    await act(async () => { await result.current.descontar(persona, "2026-09-01", "2026-09-30"); });
    expect(result.current.abierto).toBeNull();
    expect(result.current.sinPlanilla).toEqual({ persona, abiertos: 2 });
  });

  it("si el servidor falla, queda el error y no se abre nada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const { result } = renderHook(() => useDescontarAdelantos());
    await act(async () => { await result.current.descontar(persona, "2026-09-01", "2026-09-30"); });
    expect(result.current.error).toBe("No se pudieron traer sus adelantos.");
    expect(result.current.abierto).toBeNull();
    expect(result.current.cargando).toBeNull();
  });
});
