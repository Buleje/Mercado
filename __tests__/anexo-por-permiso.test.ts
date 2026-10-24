/**
 * El Anexo 04 por permiso (ADR-406): todo lo de un título habilitante junto,
 * con las medidas iguales sumadas una sola vez.
 *
 * Lo que se protege: que el papel **cuadre** —el detalle contra lo que sus
 * bloques amparan— y que un bloque sin permiso no se cuele en el de otro.
 */

import { describe, expect, it } from "vitest";
import {
  anexosPorPermiso,
  filasDelAnexo,
  resumenPorEspecieTipo,
} from "@/lib/forestal/anexo-por-permiso";
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

describe("resumenPorEspecieTipo — qué sale de este permiso", () => {
  /* 40 piezas 2×8×10 (comercial) + 10 piezas 6×6×10 (paquetería larga). */
  const anexoDe = (m3: number) =>
    anexosPorPermiso(distribuirPorCapacidad([bloque({ id: "r1", permiso: "P-7", m3 })], PIEZAS, "tipo"))[0];

  it("junta las medidas de un tipo en UNA línea y cierra contra el total", () => {
    const anexo = anexoDe(4);
    const r = resumenPorEspecieTipo(anexo);
    /* Una línea por especie × tipo, no una por medida. */
    expect(r.length).toBeLessThan(filasDelAnexo(anexo).length + 1);
    expect(new Set(r.map((x) => x.clave)).size).toBe(r.length);
    const suma = r.reduce((a, x) => a + x.m3, 0);
    expect(Math.abs(suma - anexo.totalM3)).toBeLessThanOrEqual(0.001);
    expect(r.reduce((a, x) => a + x.piezas, 0)).toBe(anexo.totalPiezas);
    expect(Math.abs(r.reduce((a, x) => a + x.pieTablar, 0) - anexo.totalPt)).toBeLessThanOrEqual(0.05);
  });

  it("dice piezas, pie tablar y m³ de cada tipo — los tres, como se declara", () => {
    const r = resumenPorEspecieTipo(anexoDe(4));
    for (const linea of r) {
      expect(linea.piezas).toBeGreaterThan(0);
      expect(linea.pieTablar).toBeGreaterThan(0);
      expect(linea.m3).toBeGreaterThan(0);
      expect(linea.medidas).toBeGreaterThan(0);
      expect(linea.especie).toBe("Tornillo");
    }
  });

  it("los porcentajes son del anexo y suman 100", () => {
    const r = resumenPorEspecieTipo(anexoDe(4));
    expect(Math.abs(r.reduce((a, x) => a + x.pctM3, 0) - 100)).toBeLessThanOrEqual(0.2);
  });

  it("el comercial va primero: el orden es el canónico, no el del volumen", () => {
    const r = resumenPorEspecieTipo(anexoDe(4));
    const tipos = r.map((x) => x.tipo);
    if (tipos.includes("Comercial") && tipos.includes("Paquetería larga")) {
      expect(tipos.indexOf("Comercial")).toBeLessThan(tipos.indexOf("Paquetería larga"));
    }
  });

  it("un anexo vacío no inventa porcentajes", () => {
    const vacio = anexosPorPermiso(distribuirPorCapacidad([], PIEZAS, "tipo"));
    expect(vacio).toEqual([]);
  });
});

describe("el total que se copia al LO-CTP (regla GTF, Brandon 2026-10-03)", () => {
  /* Brandon: «copio la tabla como está, con sus 3 decimales; en el LO-CTP de
     SERFOR da 31.188 y aquí sale 31.185». Caso chico con medidas reales:
     Larga angosta 7 × 1″×2″×6′ = 0,01651 → 0,017 · Tabla 1 × 1″×3″×6′ =
     0,00354 → 0,004 · Comercial 4 × 2″×6″×6′ = 0,05660 → 0,057.
     Crudo: 0,07665 → 0,077. Copiando las filas: 0,078. */
  const conTipo = (p: PiezaCubicada, tipo: NonNullable<PiezaCubicada["tipo"]>): PiezaCubicada => ({ ...p, tipo });
  const piezas = [
    conTipo(pieza("la", 7, 1, 2, 6), "Larga angosta"),
    conTipo(pieza("ta", 1, 1, 3, 6), "Tabla"),
    conTipo(pieza("co", 4, 2, 6, 6), "Comercial"),
  ];
  const dist = distribuirPorCapacidad([bloque({ id: "b1", permiso: "CON-25-UCA-0142" })], piezas);
  const [anexo] = anexosPorPermiso(dist);

  it("el total del anexo es la SUMA de las filas especie × tipo tal como se ven (0,078, no 0,077)", () => {
    const resumen = resumenPorEspecieTipo(anexo);
    expect(resumen.map((r) => r.m3)).toEqual([0.057, 0.004, 0.017]);
    expect(anexo.totalM3).toBe(0.078);
    expect(Math.round(resumen.reduce((a, r) => a + r.m3, 0) * 1000) / 1000).toBe(anexo.totalM3);
  });

  it("que lleve toda su madera se controla con lo EXACTO: el redondeo no es madera que falte", () => {
    // Σ de las piezas como las guarda el reparto (4 decimales c/u): la misma
    // base con la que el reparto calcula lo que amparan los bloques.
    expect(anexo.totalExactoM3).toBeCloseTo(0.0766, 4);
    expect(anexo.cuadra).toBe(true);
  });

  it("el detalle por medida suma lo que se ve, cada medida a 3 decimales", () => {
    expect(filasDelAnexo(anexo).map((f) => f.m3).sort()).toEqual([0.004, 0.017, 0.057]);
    expect(anexo.totalMedidasM3).toBe(0.078);
  });
});
