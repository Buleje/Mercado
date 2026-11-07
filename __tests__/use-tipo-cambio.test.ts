// @vitest-environment jsdom
/**
 * useTipoCambio (factura XML en dólares): qué tipo de cambio queda "en uso".
 * SUNAT/BCRP responden → ese; no responde, viene fuera de rango o la moneda no
 * es dólar → escrito a mano y obligatorio; en soles no hace falta ni pide nada.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { interpretarRespuesta, useTipoCambio, type TipoCambioApi } from "@/components/admin/compras/factura-xml/use-tipo-cambio";

const SUNAT: TipoCambioApi = { fecha: "2026-11-04", compra: 3.74, venta: 3.752, fuente: "sunat", fechaDato: "2026-11-04", detalle: "SUNAT del 04-11" };
const SBS: TipoCambioApi = { fecha: "2026-11-03", compra: 3.456, venta: 3.466, fuente: "bcrp-sbs", fechaDato: "2026-11-02", detalle: "SBS al cierre del 02-11 (BCRP)" };

function responder(cuerpo: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("interpretarRespuesta", () => {
  it("usa el dato si el endpoint respondió y la venta es creíble", () => {
    expect(interpretarRespuesta(true, 200, { data: SUNAT })).toEqual({ dato: SUNAT, error: null });
  });

  it("una venta fuera de 2.50-5.50 no se usa aunque venga con 200: se pide a mano", () => {
    const r = interpretarRespuesta(true, 200, { data: { ...SUNAT, venta: 37.52 } });
    expect(r.dato).toBeNull();
    expect(r.error).toMatch(/no es creíble/);
    expect(interpretarRespuesta(true, 200, { data: { ...SUNAT, venta: Number.NaN } }).dato).toBeNull();
    expect(interpretarRespuesta(true, 200, { data: { ...SUNAT, venta: 0 } }).dato).toBeNull();
  });

  it("el error que manda el servidor sale tal cual; sin cuerpo, el estado HTTP", () => {
    expect(interpretarRespuesta(false, 503, { error: "SUNAT y el BCRP no respondieron; escribe el tipo de cambio a mano" }).error).toBe(
      "SUNAT y el BCRP no respondieron; escribe el tipo de cambio a mano",
    );
    expect(interpretarRespuesta(false, 502, null).error).toContain("(502)");
  });
});

describe("useTipoCambio", () => {
  it("en soles no hace falta tipo de cambio ni se pide nada", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useTipoCambio("2026-11-04", "PEN"));
    expect(result.current.necesita).toBe(false);
    expect(result.current.cambio).toBeNull();
    expect(result.current.cargando).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dólares: pide la fecha, queda cargando y luego usa la venta de SUNAT", async () => {
    const fetchMock = responder({ data: SUNAT });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useTipoCambio("2026-11-04T00:00:00", "USD"));
    expect(result.current.cargando).toBe(true);
    expect(result.current.cambio).toBeNull();
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("/api/admin/tipo-cambio?fecha=2026-11-04");
    expect(result.current.cambio).toEqual({ venta: 3.752, fecha: "2026-11-04", fuente: "sunat", detalle: "SUNAT del 04-11" });
    expect(result.current.error).toBeNull();
  });

  it("si llega del cierre SBS (BCRP), el cambio en uso conserva la fuente y el detalle", async () => {
    vi.stubGlobal("fetch", responder({ data: SBS }));
    const { result } = renderHook(() => useTipoCambio("2026-11-03", "USD"));
    await waitFor(() => expect(result.current.cambio).not.toBeNull());
    expect(result.current.cambio).toMatchObject({ venta: 3.466, fuente: "bcrp-sbs", detalle: "SBS al cierre del 02-11 (BCRP)" });
  });

  it("venta increíble (37.52): no se usa, pide escribirlo y el manual lo reemplaza", async () => {
    vi.stubGlobal("fetch", responder({ data: { ...SUNAT, venta: 37.52 } }));
    const { result } = renderHook(() => useTipoCambio("2026-11-04", "USD"));
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.dato).toBeNull();
    expect(result.current.cambio).toBeNull();
    expect(result.current.error).toMatch(/no es creíble/);
    act(() => result.current.setManual("3,8"));
    expect(result.current.cambio).toEqual({ venta: 3.8, fecha: "2026-11-04", fuente: "manual", detalle: null });
    act(() => result.current.setManual("38"));
    expect(result.current.manualInvalido).toBe(true);
    expect(result.current.cambio).toBeNull();
  });

  it("el endpoint responde 503: error del servidor y nada se guarda hasta escribirlo", async () => {
    vi.stubGlobal("fetch", responder({ error: "SUNAT y el BCRP no respondieron; escribe el tipo de cambio a mano" }, 503));
    const { result } = renderHook(() => useTipoCambio("2026-11-04", "USD"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.cambio).toBeNull();
    expect(result.current.manualInvalido).toBe(false);
  });

  it("falla la red: avisa y deja escribirlo a mano", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("sin red"))));
    const { result } = renderHook(() => useTipoCambio("2026-11-04", "USD"));
    await waitFor(() => expect(result.current.error).toMatch(/escríbelo a mano/));
    expect(result.current.cambio).toBeNull();
  });

  it("otra moneda (EUR): no pide a SUNAT, se escribe a mano y el rango es más ancho", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useTipoCambio("2026-11-04", "EUR"));
    expect(result.current.necesita).toBe(true);
    expect(result.current.error).toMatch(/EUR/);
    act(() => result.current.setManual("4,05"));
    expect(result.current.cambio).toMatchObject({ venta: 4.05, fuente: "manual" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("al cambiar de fecha vuelve a cargar y el texto escrito a mano no pasa a la otra factura", async () => {
    vi.stubGlobal("fetch", responder({ data: SUNAT }));
    const { result, rerender } = renderHook(({ f }) => useTipoCambio(f, "EUR"), { initialProps: { f: "2026-11-04" } });
    act(() => result.current.setManual("4,05"));
    expect(result.current.manual).toBe("4,05");
    rerender({ f: "2026-11-05" });
    expect(result.current.manual).toBe("");
    expect(result.current.cambio).toBeNull();
  });
});
