/**
 * Mandar mensaje › «Uno por uno»: las marcas «Abierto» y el envío anotado
 * (revisión 19-10).
 *
 *  · Corregir el texto no borra las marcas ni crea otra fila: con eso le
 *    escribías dos veces al mismo cliente.
 *  · Las marcas son por grupo: volver a un grupo trae las suyas.
 *  · La cifra cuenta como guardada sólo si el PATCH salió bien; si no, se
 *    reintenta.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRegistroUnoPorUno } from "@/components/admin/mandar-mensaje/use-registro-uno-por-uno";

const alta = (segment: string, message: string) => ({ name: "Oferta", message, segment, totalAudience: 10 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function montar() {
  const campanas = {
    anotarManual: vi.fn(async () => "c1"),
    actualizarAbiertos: vi.fn(async () => true),
  };
  const hook = renderHook((p: { segment: string; message: string }) => useRegistroUnoPorUno({ activo: true, campanas, alta: alta(p.segment, p.message) }), {
    initialProps: { segment: "todos", message: "Hola" },
  });
  return { campanas, hook };
}

describe("useRegistroUnoPorUno", () => {
  it("corregir el texto no borra lo abierto ni anota otro envío", async () => {
    const { campanas, hook } = montar();
    await act(async () => hook.result.current.abrir("51900000001"));
    hook.rerender({ segment: "todos", message: "Hola, corregido" });
    expect(hook.result.current.abiertos.has("51900000001")).toBe(true);
    await act(async () => hook.result.current.abrir("51900000001"));
    await act(async () => hook.result.current.abrir("51900000002"));
    expect(campanas.anotarManual).toHaveBeenCalledTimes(1);
    expect(hook.result.current.abiertos.size).toBe(2);
  });

  it("las marcas son por grupo y vuelven con él", async () => {
    const { hook } = montar();
    await act(async () => hook.result.current.abrir("51900000001"));
    hook.rerender({ segment: "vip", message: "Hola" });
    expect(hook.result.current.abiertos.size).toBe(0);
    hook.rerender({ segment: "todos", message: "Hola" });
    expect(hook.result.current.abiertos.has("51900000001")).toBe(true);
  });

  it("un PATCH que falla (429) no cuenta como guardado: se reintenta", async () => {
    const { campanas, hook } = montar();
    campanas.actualizarAbiertos.mockResolvedValueOnce(false);
    await act(async () => hook.result.current.abrir("51900000001"));
    await act(async () => hook.result.current.abrir("51900000002"));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(campanas.actualizarAbiertos).toHaveBeenLastCalledWith("c1", 2, false);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(campanas.actualizarAbiertos).toHaveBeenCalledTimes(2);
    // Ya guardado: no sale otro.
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(campanas.actualizarAbiertos).toHaveBeenCalledTimes(2);
  });
});
