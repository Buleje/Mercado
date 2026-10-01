// @vitest-environment jsdom
/**
 * El borrador de «Declarar» va SIEMPRE con su dueño (revisión 23-09, dinero).
 * Con una clave aparte para «un solo dueño», la elección se perdía al pasar de
 * uno a dos dueños, y un «tercero a la cuenta de Centro» quedaba puesto sobre
 * piezas que ya eran todas de WASACO: su aserrío se le cobraba a otro.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { useDeclararPorDueno } from "@/components/admin/forestal/hooks/use-declarar-por-dueno";

const pz = (id: string, dueno?: string, duenoParteId?: string): PiezaCubicada => {
  const base = { id, cantidad: 5, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { ...base, especie: "Tornillo", dueno, duenoParteId, ...cubicarPieza(base) };
};
const W = [pz("w1", "WASACO", "parte-w"), pz("w2", "WASACO", "parte-w")];
const S = [pz("s1")];
const C = [pz("c1", "Centro", "parte-c")];
const hook = (p: readonly PiezaCubicada[]) =>
  renderHook(({ p }) => useDeclararPorDueno(p), { initialProps: { p } });

describe("el borrador sigue a su dueño", () => {
  it("«propia» elegida con un solo dueño sigue ahí cuando aparece un segundo", () => {
    const { result, rerender } = hook(W);
    act(() => result.current.setBorrador((b) => ({ ...b, servicio: "propia" })));
    rerender({ p: [...W, ...S] });
    expect(result.current.separados).toBe(true);
    expect(result.current.grupo?.clave).toBe("parte:parte-w");
    expect(result.current.borrador.servicio).toBe("propia");
  });

  it("tras registrar un dueño, lo puesto al que queda sobrevive a que aparezca otro", () => {
    const { result, rerender } = hook([...S, ...W]);
    act(() => result.current.elegir("sin-dueno"));
    let r!: ReturnType<typeof result.current.registrado>;
    act(() => {
      r = result.current.registrado("ok");
    });
    rerender({ p: r.quedan });
    expect(result.current.separados).toBe(false);
    /* El que queda arranca con lo que propone su dueño… */
    expect(result.current.borrador).toMatchObject({ servicio: "tercero", parteId: "parte-w" });
    act(() => result.current.setBorrador((b) => ({ ...b, servicio: "propia", parteId: null })));
    rerender({ p: [...r.quedan, ...C] });
    /* …y lo que se le cambió no se pierde al partirse la libreta otra vez. */
    expect(result.current.grupo?.clave).toBe("parte:parte-w");
    expect(result.current.borrador.servicio).toBe("propia");
  });

  it("un tercero elegido para Centro NO queda puesto sobre piezas que ya son todas de WASACO", () => {
    const { result, rerender } = hook(C);
    act(() => result.current.setBorrador((b) => ({ ...b, servicio: "tercero", parteId: "parte-c" })));
    rerender({ p: [...C, ...W] });
    rerender({ p: W });
    expect(result.current.separados).toBe(false);
    expect(result.current.piezas.every((p) => p.duenoParteId === "parte-w")).toBe(true);
    expect(result.current.borrador.parteId).not.toBe("parte-c");
  });
});
