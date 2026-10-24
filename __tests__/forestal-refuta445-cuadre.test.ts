/**
 * Refutación del reviewer sobre ADR-445 (defecto C, confirmado 27-09): una
 * pieza chica (≤ 10 L) de una especie que ninguna fila declara pasaba de
 * «error» a «ok» cuando «0 piezas = sin dato» se aplicó también a los grupos
 * SIN filas. Sin filas no hay dato que falte: las piezas se comparan contra 0.
 */
import { describe, it, expect } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { cuadrarConjunto, type FilaDeclarada } from "@/lib/forestal/cubicacion-cuadre";

const pz = (id: string, cantidad: number, especie: string, e: number, a: number, l: number, tipo?: PiezaCubicada["tipo"]): PiezaCubicada => {
  const m = { cantidad, espesor: e, ancho: a, largo: l, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id, ...m, especie, ...(tipo ? { tipo } : {}), ...cubicarPieza(m) };
};

describe("refuta445 · C — una especie (o tipo) que nadie declaró siempre avisa", () => {
  it("una pieza de 7,5 L de Capirona sin fila elegida es error, no «ok»", () => {
    const tornillo = pz("t", 100, "Tornillo", 2, 8, 10); // 3,1446 m³
    const capirona = pz("c", 1, "Capirona", 1, 4, 8); // 0,0075 m³
    const filas: FilaDeclarada[] = [
      { id: "f", etiqueta: "N° 1", especie: "Tornillo", producto: "MADERA ASERRADA (COMERCIAL)", piezas: 100, volumenM3: tornillo.m3 },
    ];
    const r = cuadrarConjunto([tornillo, capirona], filas);
    expect(capirona.m3).toBeLessThanOrEqual(0.01);
    expect(r.porEspecie.find((f) => f.especie === "Capirona")).toMatchObject({ deltaPiezas: 1, tono: "aviso" });
    const aviso = r.avisos.find((a) => /Capirona/.test(a.texto));
    expect(aviso?.tono).toBe("error");
    expect(r.tono).toBe("error");
  });

  it("dentro de la especie, un tipo chico que nadie declaró también se nombra", () => {
    const comercial = pz("t", 100, "Tornillo", 2, 8, 10);
    const tabla = pz("x", 1, "Tornillo", 1, 4, 8, "Tabla");
    const filas: FilaDeclarada[] = [
      { id: "f", etiqueta: "N° 1", especie: "Tornillo", producto: "MADERA ASERRADA (COMERCIAL)", piezas: 100, volumenM3: comercial.m3 },
    ];
    const r = cuadrarConjunto([comercial, tabla], filas);
    const aviso = r.avisos.find((a) => a.campo === "tipo");
    expect(aviso?.texto).toContain("Tabla");
    expect(aviso?.tono).toBe("aviso");
  });

  it("con filas que sí dicen 0 piezas sigue siendo «sin dato» (el 01/08 no vuelve a avisar)", () => {
    const tornillo = pz("t", 400, "Tornillo", 2, 8, 10);
    const filas: FilaDeclarada[] = [{ id: "f", etiqueta: "56", especie: "Tornillo", piezas: 0, volumenM3: tornillo.m3 }];
    const r = cuadrarConjunto([tornillo], filas);
    expect(r.porEspecie[0]).toMatchObject({ piezasSinDato: true, deltaPiezas: 0, tono: "ok" });
    expect(r.avisos).toEqual([]);
  });
});
