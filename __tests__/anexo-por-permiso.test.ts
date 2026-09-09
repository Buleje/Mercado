/**
 * El Anexo 04 por permiso (ADR-406): todo lo de un título habilitante junto,
 * con las medidas iguales sumadas una sola vez.
 *
 * Lo que se protege: que el papel **cuadre** —el detalle contra lo que sus
 * bloques amparan— y que un bloque sin permiso no se cuele en el de otro.
 */

import { describe, expect, it } from "vitest";
import { anexosPorPermiso, filasDelAnexo } from "@/lib/forestal/anexo-por-permiso";
import { etiquetaSinRecorte } from "@/lib/forestal/reparto-anexo";
import { distribuirPorCapacidad, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";

function pieza(id: string, cantidad: number, espesor: number, ancho: number, largo: number): PiezaCubicada {
  const base = {
    id, cantidad, espesor, ancho, largo,
    uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const,
    especie: "Tornillo",
  };
  const { m3, pieTablar } = cubicarPieza(base);
  return { ...base, m3, pieTablar };
}

const bloque = (o: Partial<BloqueRolliza> & { id: string }): BloqueRolliza => ({
  etiqueta: o.id,
  especie: "Tornillo",
  m3: 5,
  origen: "manual",
  costoM3: null,
  aprovechablePct: 55,
  ...o,
});

/** Dos renglones de la MISMA medida: el anexo tiene que juntarlos en una fila. */
const PIEZAS = [pieza("p1", 20, 2, 8, 10), pieza("p2", 20, 2, 8, 10), pieza("p3", 10, 6, 6, 10)];

describe("anexosPorPermiso", () => {
  it("junta todo lo del mismo permiso y unifica las medidas repetidas", () => {
    const b1 = bloque({ id: "b1", etiqueta: "GTF-1", permiso: "P-1", m3: 3 });
    const b2 = bloque({ id: "b2", etiqueta: "GTF-2", permiso: "P-1", m3: 3 });
    const [anexo] = anexosPorPermiso(distribuirPorCapacidad([b1, b2], PIEZAS, "tipo"));
    expect(anexo.permiso).toBe("P-1");
    expect(anexo.bloques.map((b) => b.etiqueta).sort()).toEqual(["GTF-1", "GTF-2"]);
    /* La 2×8×10 salió de los dos bloques: en el papel es UNA fila. */
    const filas = filasDelAnexo(anexo);
    const dosPorOcho = filas.filter((f) => f.medida === "2×8×10");
    expect(dosPorOcho.length).toBe(1);
  });

  it("el detalle cuadra con lo que los bloques amparan", () => {
    const b1 = bloque({ id: "c1", permiso: "P-9", m3: 4 });
    const [anexo] = anexosPorPermiso(distribuirPorCapacidad([b1], PIEZAS, "tipo"));
    expect(anexo.cuadra).toBe(true);
    expect(Math.abs(anexo.totalM3 - anexo.amparadoM3)).toBeLessThanOrEqual(0.01);
    // Y el total del papel es la suma de sus filas, no otra cuenta.
    const suma = filasDelAnexo(anexo).reduce((a, f) => a + f.m3, 0);
    expect(Math.abs(suma - anexo.totalM3)).toBeLessThanOrEqual(0.001);
  });

  it("dos permisos son dos anexos distintos: no se mezclan", () => {
    const a = bloque({ id: "x1", etiqueta: "GTF-A", permiso: "P-1", m3: 2 });
    const b = bloque({ id: "x2", etiqueta: "GTF-B", permiso: "P-2", m3: 2 });
    const anexos = anexosPorPermiso(distribuirPorCapacidad([a, b], PIEZAS, "tipo"));
    expect(anexos.map((x) => x.permiso).sort()).toEqual(["P-1", "P-2"]);
    for (const x of anexos) expect(x.bloques.length).toBe(1);
  });

  it("un bloque sin permiso va a su propio grupo: no se le inventa uno", () => {
    const conP = bloque({ id: "y1", etiqueta: "GTF-A", permiso: "P-1", m3: 2 });
    const sinP = bloque({ id: "y2", etiqueta: "GTF-B", m3: 2 });
    const anexos = anexosPorPermiso(distribuirPorCapacidad([conP, sinP], PIEZAS, "tipo"));
    const suelto = anexos.find((x) => x.permiso === null);
    expect(suelto?.label).toBe("Sin permiso declarado");
    expect(suelto?.bloques.map((b) => b.etiqueta)).toEqual(["GTF-B"]);
  });

  it("un bloque que no amparó nada no abre un anexo vacío", () => {
    const vacio = bloque({ id: "z1", etiqueta: "GTF-Z", permiso: "P-3", m3: 0 });
    const anexos = anexosPorPermiso(distribuirPorCapacidad([vacio], PIEZAS, "tipo"));
    expect(anexos.some((x) => x.permiso === "P-3")).toBe(false);
  });
});

describe("etiquetaSinRecorte — la etiqueta es del bloque, no del filtro", () => {
  it("saca el recorte que el puente pegaba y deja el producto y el lote", () => {
    expect(
      etiquetaSinRecorte(
        "MADERA ASERRADA (COMERCIAL) · 6-2026 (permisos 19-SEC/REG-PLT-2018-020, 19-SEC/REG-PLT-2026-032 · especie TORNILLO)",
      ),
    ).toBe("MADERA ASERRADA (COMERCIAL) · 6-2026");
    expect(etiquetaSinRecorte("MADERA ASERRADA (PAQUETERIA LARGA) · 15-2026 (permiso CON-25-UCA-0142)")).toBe(
      "MADERA ASERRADA (PAQUETERIA LARGA) · 15-2026",
    );
    expect(etiquetaSinRecorte("Trozas en el patio · Tornillo (especie TORNILLO)")).toBe(
      "Trozas en el patio · Tornillo",
    );
  });

  it("NO toca el paréntesis del producto ni una etiqueta normal", () => {
    expect(etiquetaSinRecorte("MADERA ASERRADA (COMERCIAL) · 6-2026")).toBe(
      "MADERA ASERRADA (COMERCIAL) · 6-2026",
    );
    expect(etiquetaSinRecorte("GTF-0231")).toBe("GTF-0231");
    /* Un paréntesis que no es el recorte se respeta: no se adivina qué sobra. */
    expect(etiquetaSinRecorte("Lote 15-2026 (reproceso)")).toBe("Lote 15-2026 (reproceso)");
  });
});
