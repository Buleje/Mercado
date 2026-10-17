/**
 * La vara de una meta (vista Metas, 10-10): el período anterior entero contra
 * el objetivo, y las sugerencias de objetivo del modal.
 */
import { describe, expect, it } from "vitest";
import { lineaVara, nombreDelAnterior, redondearObjetivo, sugerencias } from "@/components/admin/metas/vara-meta";

const SET = { avance: 24100, desde: "2026-09-01", hasta: "2026-09-30", etiqueta: "setiembre 2026" };
const HOY = "2026-10-10";

describe("nombreDelAnterior", () => {
  it("dice el período como se habla", () => {
    expect(nombreDelAnterior("mensual", SET, HOY)).toBe("setiembre");
    expect(nombreDelAnterior("mensual", { desde: "2025-12-01" }, "2026-01-05")).toBe("diciembre 2025");
    expect(nombreDelAnterior("diario", { desde: "2026-10-03" }, HOY)).toBe("el sábado pasado");
    expect(nombreDelAnterior("semanal", { desde: "2026-09-28" }, HOY)).toBe("la semana pasada");
    expect(nombreDelAnterior("anual", { desde: "2025-01-01" }, HOY)).toBe("2025");
  });
});

describe("lineaVara", () => {
  const base = { period: "mensual" as const, hoy: HOY, sentido: "sube" as const, unidad: "S/" };

  it("cuánto más pide el objetivo que el período anterior entero", () => {
    expect(lineaVara({ ...base, anterior: SET, target: 30000, avance: 8240 })).toEqual({
      texto: "Setiembre: S/ 24,100 · meta\u00a0+24\u00a0%",
      tono: "neutro",
    });
    expect(lineaVara({ ...base, anterior: SET, target: 21690, avance: 8240 })!.texto).toBe("Setiembre: S/ 24,100 · meta\u00a0−10\u00a0%");
  });

  it("si este período ya pasó al anterior lo dice (y en un tope avisa)", () => {
    expect(lineaVara({ ...base, anterior: { ...SET, avance: 17 }, unidad: "pedidos", target: 20, avance: 22 })).toEqual({
      texto: "Setiembre: 17 pedidos · ya\u00a0lo\u00a0superaste",
      tono: "exito",
    });
    expect(lineaVara({ ...base, sentido: "baja", anterior: { ...SET, avance: 4000 }, target: 5000, avance: 4200 })!.tono).toBe("aviso");
  });

  it("sin dato del anterior no hay línea; en 0, sólo la cifra", () => {
    expect(lineaVara({ ...base, anterior: undefined, target: 1, avance: 0 })).toBeNull();
    expect(lineaVara({ ...base, anterior: { ...SET, avance: null }, target: 1, avance: 0 })).toBeNull();
    expect(lineaVara({ ...base, anterior: { ...SET, avance: 0 }, target: 1, avance: 0 })!.texto).toBe("Setiembre: S/ 0");
  });
});

describe("sugerencias y redondeo", () => {
  it("igual, +10 % y +20 % en números redondos de la unidad", () => {
    expect(sugerencias(SET, "S/", "sube")).toEqual([
      { etiqueta: "Igual", valor: 24100 },
      { etiqueta: "+10 %", valor: 26500 },
      { etiqueta: "+20 %", valor: 28900 },
    ]);
  });

  it("en un tope propone menos; en conteos chicos no repite el mismo número", () => {
    expect(sugerencias({ ...SET, avance: 4820 }, "S/", "baja").map((s) => s.etiqueta)).toEqual(["Igual", "−10 %", "−20 %"]);
    expect(sugerencias({ ...SET, avance: 3 }, "clientes", "sube").map((s) => s.valor)).toEqual([3, 4]);
  });

  it("sin anterior o en 0, ninguna", () => {
    expect(sugerencias(undefined, "S/", "sube")).toEqual([]);
    expect(sugerencias({ ...SET, avance: 0 }, "S/", "sube")).toEqual([]);
  });

  it("redondea en la unidad del negocio", () => {
    expect(redondearObjetivo(41.23, "m³")).toBe(41.2);
    expect(redondearObjetivo(345, "S/")).toBe(350);
    expect(redondearObjetivo(23.6, "S/")).toBe(24);
    expect(redondearObjetivo(1234, "PT")).toBe(1230);
  });
});
