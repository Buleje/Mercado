import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ptOxapampa } from "@/lib/forestal/cubicacion-oxapampa";
import { planearMedida, type EstadoTrozaParaMedir } from "@/lib/forestal/medidas-troza";
import {
  cambioDeFila,
  errorDeCelda,
  faltaDeFila,
  filaDeTroza,
  filaSinCm,
  filaSinGuardar,
  leerDecimal,
  ptDeFila,
  ptVisibleDeFila,
  totalDePlanilla,
  type FilaPlanilla,
} from "@/lib/forestal/planilla-oxapampa";
import { usePlanillaOxapampa } from "@/components/admin/forestal/hooks/use-planilla-oxapampa";

const vacia: FilaPlanilla = { d1: "", d2: "", largo: "", d1Cm: "", d2Cm: "" };

describe("leerDecimal — lo que se tipea en el patio", () => {
  it("acepta coma y punto decimal", () => {
    expect(leerDecimal("18,5")).toBe(18.5);
    expect(leerDecimal("18.5")).toBe(18.5);
    expect(leerDecimal(" 22 ")).toBe(22);
    expect(leerDecimal(".5")).toBe(0.5);
  });
  it("tolera la marca de unidad detrás", () => {
    expect(leerDecimal("18″")).toBe(18);
    expect(leerDecimal('18"')).toBe(18);
    expect(leerDecimal("12'")).toBe(12);
    expect(leerDecimal("12 pies")).toBe(12);
  });
  it("vacío es null; lo que no es número, inválido (no se adivina)", () => {
    expect(leerDecimal("")).toBeNull();
    expect(leerDecimal("   ")).toBeNull();
    expect(leerDecimal("1.2.3")).toBe("invalido");
    expect(leerDecimal("1,2,3")).toBe("invalido");
    expect(leerDecimal("abc")).toBe("invalido");
    expect(leerDecimal("-4")).toBe("invalido");
  });
  it("un espacio EN MEDIO no se pega: «1 2» no es 12 (los de los bordes sí se recortan)", () => {
    expect(leerDecimal("1 2")).toBe("invalido");
    expect(leerDecimal("1 2 pies")).toBe("invalido");
    expect(leerDecimal("18, 5")).toBe("invalido");
    expect(errorDeCelda("d1", "1 2")).toBe("No es un número");
    expect(leerDecimal("  18,5  ")).toBe(18.5);
    expect(leerDecimal("18 ″")).toBe(18);
    expect(leerDecimal("45 cm")).toBe(45);
  });
  it("devuelve el número redondeado a 2 decimales, como lo guarda el servidor", () => {
    expect(leerDecimal("18.125")).toBe(18.13);
    expect(leerDecimal("22,375")).toBe(22.38);
    expect(leerDecimal("120.004")).toBe(120);
    // 0,004″ se guardaría como 0: la celda lo dice antes de mandarlo
    expect(errorDeCelda("d1", "0.004")).toMatch(/mayor que 0/);
    expect(errorDeCelda("d1", "120.004")).toBeNull();
  });
});

describe("errorDeCelda — topes del mundo real", () => {
  it("pulgadas hasta 120, pies hasta 100, cm hasta 400", () => {
    expect(errorDeCelda("d1", "120")).toBeNull();
    expect(errorDeCelda("d1", "121")).toMatch(/Máximo 120/);
    expect(errorDeCelda("largo", "101")).toMatch(/Máximo 100/);
    expect(errorDeCelda("d1Cm", "401")).toMatch(/Máximo 400/);
  });
  it("cero no es una medida", () => {
    expect(errorDeCelda("d2", "0")).toMatch(/mayor que 0/);
  });
});

describe("ptDeFila — la misma cuenta que congela el servidor", () => {
  it("ejemplo del dueño: 18″ y 22″, 12′ → 195,92 pt", () => {
    expect(ptDeFila({ ...vacia, d1: "18", d2: "22", largo: "12" })).toBe(195.92);
    expect(ptDeFila({ ...vacia, d1: "18,0", d2: "22″", largo: "12'" })).toBe(195.92);
  });
  it("sin largo o con error, no hay pt", () => {
    expect(ptDeFila({ ...vacia, d1: "18", d2: "22" })).toBeNull();
    expect(ptDeFila({ ...vacia, d1: "18", d2: "x", largo: "12" })).toBeNull();
  });
  it("con una sola punta NO hay pt: media medida = sin cubicar (revisión 26-09)", () => {
    expect(ptDeFila({ ...vacia, d1: "20", largo: "12" })).toBeNull();
  });
  it("con 3 decimales tipeados, el pt en vivo es el que guarda el servidor (200,95, no 200,85)", () => {
    const fila = { ...vacia, d1: "18.125", d2: "22.375", largo: "12" };
    const estado: EstadoTrozaParaMedir = {
      id: "t9",
      oxD1Pulg: null,
      oxD2Pulg: null,
      oxLargoPies: null,
      d1Cm: null,
      d2Cm: null,
      noRecepcionada: false,
      guiaViva: true,
      periodoCerrado: null,
    };
    const cambio = cambioDeFila({ id: "t9" }, fila);
    expect(cambio).not.toBeNull();
    const guardado = planearMedida(cambio!, estado).ox?.pt;
    expect(guardado).toBe(200.95);
    expect(ptDeFila(fila)).toBe(guardado);
    // el fixture sí distingue: con lo tipeado crudo la cuenta da otro pt
    expect(ptOxapampa({ d1Pulg: 18.125, d2Pulg: 22.375, largoPies: 12 })).toBe(200.85);
  });
});

describe("cambioDeFila — sólo viaja lo que cambió", () => {
  const guardada = {
    id: "t1",
    oxD1Pulg: 18,
    oxD2Pulg: 22,
    oxLargoPies: 12,
    oxPt: 195.92,
    d1Cm: null,
    d2Cm: null,
  };

  it("sin tocar no manda nada", () => {
    expect(cambioDeFila(guardada, filaDeTroza(guardada))).toBeNull();
    // «18.0» es lo mismo que 18
    expect(cambioDeFila(guardada, { ...filaDeTroza(guardada), d1: "18.0" })).toBeNull();
  });
  it("cambia una celda → viaja sólo esa", () => {
    expect(cambioDeFila(guardada, { ...filaDeTroza(guardada), largo: "10" })).toEqual({
      id: "t1",
      oxLargoPies: 10,
    });
  });
  it("vaciar una celda con medida la BORRA (null)", () => {
    expect(cambioDeFila(guardada, { ...vacia })).toEqual({
      id: "t1",
      oxD1Pulg: null,
      oxD2Pulg: null,
      oxLargoPies: null,
    });
  });
  it("una troza sin cubicar: vacía no manda nada, llena manda las tres", () => {
    const nueva = { id: "t2" };
    expect(cambioDeFila(nueva, vacia)).toBeNull();
    expect(cambioDeFila(nueva, { ...vacia, d1: "18", d2: "22", largo: "12" })).toEqual({
      id: "t2",
      oxD1Pulg: 18,
      oxD2Pulg: 22,
      oxLargoPies: 12,
    });
  });
  it("cm sólo sobre vacío: el de la guía no se pisa", () => {
    expect(
      cambioDeFila({ id: "t3", d1Cm: null, d2Cm: 48 }, { ...vacia, d1Cm: "45", d2Cm: "50" }),
    ).toEqual({ id: "t3", d1Cm: 45 });
  });
});

describe("pt visible y total de la planilla", () => {
  it("sin tocar muestra el CONGELADO, aunque las medidas dieran otro", () => {
    const b = { id: "t1", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 190 };
    expect(ptVisibleDeFila(b, filaDeTroza(b))).toBe(190);
    expect(ptVisibleDeFila(b, { ...filaDeTroza(b), largo: "12,5" })).toBe(204.08);
  });
  it("el total dice cuántas de cuántas", () => {
    const bases = [
      { id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 195.92 },
      { id: "b" },
      { id: "c" },
    ];
    const filas = {
      a: filaDeTroza(bases[0]),
      b: { ...vacia, d1: "20", d2: "20", largo: "12" },
      c: vacia,
    };
    expect(totalDePlanilla(bases, filas)).toEqual({ pt: 391.84, cubicadas: 2, total: 3 });
  });
});

describe("filaSinGuardar — lo tipeado que se pierde al cerrar", () => {
  const guardada = { id: "t1", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 195.92 };
  it("sin tocar, o vuelta a lo guardado, no hay nada que perder", () => {
    expect(filaSinGuardar(guardada, filaDeTroza(guardada))).toBe(false);
    expect(filaSinGuardar(guardada, { ...filaDeTroza(guardada), d1: "18.0" })).toBe(false);
  });
  it("una fila SÓLO en rojo cuenta aunque no viaje al guardar", () => {
    const enRojo = { ...filaDeTroza(guardada), d1: "1x" };
    expect(cambioDeFila(guardada, enRojo)).toBeNull();
    expect(filaSinGuardar(guardada, enRojo)).toBe(true);
    expect(filaSinGuardar({ id: "t2" }, { ...vacia, d1Cm: "abc" })).toBe(true);
  });
  it("un cambio válido cuenta", () => {
    expect(filaSinGuardar(guardada, { ...filaDeTroza(guardada), largo: "10" })).toBe(true);
  });
});

describe("filaSinCm — la pastilla «D1/D2 en cm» apagada", () => {
  it("los cm tipeados no viajan", () => {
    const f = { ...vacia, d1Cm: "45", d2Cm: "50" };
    expect(cambioDeFila({ id: "t3" }, f)).toEqual({ id: "t3", d1Cm: 45, d2Cm: 50 });
    expect(cambioDeFila({ id: "t3" }, filaSinCm(f))).toBeNull();
    expect(filaSinGuardar({ id: "t3" }, filaSinCm(f))).toBe(false);
  });
});

describe("usePlanillaOxapampa — lo que el modal ve y lo que manda", () => {
  const trozas = [
    { id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 195.92, d1Cm: null, d2Cm: null },
    { id: "b", oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null, oxPt: null, d1Cm: null, d2Cm: null },
  ];
  afterEach(() => vi.unstubAllGlobals());

  it("una fila sólo en rojo: 0 cambios, pero SÍ hay algo sin guardar", async () => {
    const { result } = renderHook(() => usePlanillaOxapampa(trozas, { conCm: false }));
    await waitFor(() => expect(result.current.listo).toBe(true));
    expect(result.current.sinGuardar).toBe(0);
    act(() => result.current.set("a", "d1", "1 2"));
    expect(result.current.cambios).toHaveLength(0);
    expect(result.current.errores.size).toBe(1);
    expect(result.current.sinGuardar).toBe(1);
  });

  it("cm tipeados y pastilla apagada: no cuentan, no frenan y no viajan en el PATCH", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { trozas: { id: string }[] };
      return new Response(
        JSON.stringify({ trozas: body.trozas.map((t) => ({ ...trozas[1], ...t, oxPt: 200.95 })), rechazadas: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(
      ({ conCm }: { conCm: boolean }) => usePlanillaOxapampa(trozas, { conCm }),
      { initialProps: { conCm: true } },
    );
    await waitFor(() => expect(result.current.listo).toBe(true));
    act(() => {
      result.current.set("b", "d1Cm", "45");
      result.current.set("b", "d2Cm", "abc");
    });
    expect(result.current.errores.get("b")).toEqual({ d2Cm: "No es un número" });
    expect(result.current.sinGuardar).toBe(1);

    rerender({ conCm: false });
    expect(result.current.errores.size).toBe(0);
    expect(result.current.cambios).toHaveLength(0);
    expect(result.current.sinGuardar).toBe(0);

    act(() => {
      result.current.set("b", "d1", "18.125");
      result.current.set("b", "d2", "22.375");
      result.current.set("b", "largo", "12");
    });
    expect(result.current.cambios).toEqual([
      { id: "b", oxD1Pulg: 18.13, oxD2Pulg: 22.38, oxLargoPies: 12 },
    ]);
    await act(async () => {
      await result.current.guardar();
    });
    const enviado = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(enviado).toEqual({ trozas: [{ id: "b", oxD1Pulg: 18.13, oxD2Pulg: 22.38, oxLargoPies: 12 }] });
    // lo tipeado en cm sigue ahí: prender la pastilla lo devuelve
    expect(result.current.filas.b.d1Cm).toBe("45");
    rerender({ conCm: true });
    expect(result.current.sinGuardar).toBe(1);
  });
});

describe("faltaDeFila — la fila a medias dice qué completar", () => {
  it("vacía o completa: nada que decir", () => {
    expect(faltaDeFila(vacia)).toBeNull();
    expect(faltaDeFila({ ...vacia, d1: "18", d2: "22", largo: "12" })).toBeNull();
  });
  it("una punta y el largo: falta la otra punta", () => {
    expect(faltaDeFila({ ...vacia, d1: "18", largo: "12" })).toBe("falta D2″");
  });
  it("sólo una celda: nombra las dos que faltan", () => {
    expect(faltaDeFila({ ...vacia, d2: "22" })).toBe("faltan D1″ y L′");
  });
  it("con una celda mal tipeada, el error lo dice la celda", () => {
    expect(faltaDeFila({ ...vacia, d1: "1x", largo: "12" })).toBeNull();
  });
});
