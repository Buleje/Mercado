/**
 * El cuadre de cifras entre las vistas de la distribución (Brandon, 2026-10-03).
 *
 * Lo que se protege: que un reparto sano dé «cuadra» en todos los controles
 * —siete rojos falsos enseñan a ignorar la lista— y que una pieza perdida, un
 * m³ escrito a mano, un bloque pasado de capacidad o una especie sin pareja se
 * marquen como «difiere» con su número y su arreglo.
 */

import { describe, expect, it } from "vitest";
import { cuadrarReparto, controlDe, estadoCuadre } from "@/lib/forestal/reparto-cuadre";
import { distribuirPorCapacidad, type BloqueRolliza, type Distribucion } from "@/lib/forestal/cubicacion-reparto";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";

function pieza(id: string, cantidad: number, espesor: number, ancho: number, largo: number, especie: string | null = "Tornillo"): PiezaCubicada {
  const base = {
    id, cantidad, espesor, ancho, largo,
    uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const,
    especie: especie ?? undefined,
  };
  const { m3, pieTablar } = cubicarPieza(base);
  return { ...base, m3, pieTablar };
}

const bloque = (o: Partial<BloqueRolliza> & { id: string }): BloqueRolliza => ({
  etiqueta: `GTF ${o.id}`,
  especie: "Tornillo",
  m3: 5,
  origen: "manual",
  costoM3: null,
  aprovechablePct: 55,
  ...o,
});

const LOTE = [
  pieza("t1", 40, 2, 8, 10),
  pieza("t2", 20, 2, 4, 10),
  pieza("c1", 30, 2, 6, 10, "Cumala"),
];
const BLOQUES = [
  bloque({ id: "b1", m3: 4, permiso: "CON-25-UCA-0142" }),
  /* 1 m³ × 55 % = 0,55 m³ para 0,7075 m³ de Cumala: falta a propósito. */
  bloque({ id: "b2", especie: "Cumala", m3: 1, permiso: "CON-25-UCA-0207" }),
];

const clonar = (d: Distribucion): Distribucion => structuredClone(d);

describe("estadoCuadre", () => {
  it("una pieza de diferencia nunca es redondeo", () => {
    expect(estadoCuadre({ piezas: 1, pt: 0, m3: 0 }, 1000)).toBe("difiere");
  });
  it("hasta 0,01 PT y 0,001 m³ es exacto", () => {
    expect(estadoCuadre({ piezas: 0, pt: 0.01, m3: 0.001 }, 1)).toBe("exacto");
  });
  it("el arrastre de redondear muchas filas es redondeo; el mismo número en dos filas, no", () => {
    expect(estadoCuadre({ piezas: 0, pt: 0.2, m3: 0 }, 50)).toBe("redondeo");
    expect(estadoCuadre({ piezas: 0, pt: 0.2, m3: 0 }, 2)).toBe("difiere");
    expect(estadoCuadre({ piezas: 0, pt: 0.9, m3: 0 }, 1000)).toBe("difiere");
    expect(estadoCuadre({ piezas: 0, pt: 0, m3: 0.005 }, 100)).toBe("redondeo");
    expect(estadoCuadre({ piezas: 0, pt: 0, m3: 0.02 }, 1000)).toBe("difiere");
  });
});

describe("cuadrarReparto", () => {
  it("un reparto sano cuadra en todos los controles, aun con falta", () => {
    const dist = distribuirPorCapacidad(BLOQUES, LOTE, "tipo");
    const c = cuadrarReparto({ dist, piezas: LOTE });
    expect(c.difieren).toBe(0);
    expect(c.controles.map((x) => x.id)).toEqual(["lote", "medidas", "capacidad", "anexos", "medida", "especie", "huerfanas"]);
    const lote = controlDe(c, "lote")!;
    expect(lote.esperado.piezas).toBe(90);
    expect(lote.obtenido.piezas).toBe(90);
    expect(lote.comoCuadrar).toMatch(/agrega un bloque de Cumala de [\d,.]+ m³ de rolliza/);
    /* La falta es de Cumala: la fila de especie dice cuánto y qué agregar. */
    const cumala = controlDe(c, "especie")!.filas.find((f) => f.rotulo === "Cumala")!;
    expect(cumala.estado).not.toBe("difiere");
    expect(cumala.comoCuadrar).toMatch(/Falta amparar/);
    /* Los anexos suman lo distribuido. */
    const anexos = controlDe(c, "anexos")!;
    expect(anexos.filas).toHaveLength(2);
    expect(Math.abs(anexos.diferencia.m3)).toBeLessThanOrEqual(0.001);
  });

  it("una pieza del lote que no está ni en un bloque ni en la falta se marca por medida", () => {
    const dist = distribuirPorCapacidad(BLOQUES, LOTE, "tipo");
    const conExtra = [...LOTE, pieza("t9", 1, 2, 4, 10)];
    const c = cuadrarReparto({ dist, piezas: conExtra });
    expect(controlDe(c, "lote")!.estado).toBe("difiere");
    expect(controlDe(c, "lote")!.diferencia.piezas).toBe(-1);
    const medida = controlDe(c, "medida")!;
    expect(medida.estado).toBe("difiere");
    expect(medida.filas[0].rotulo).toBe("Tornillo · 2×4×10");
    expect(medida.filas[0].comoCuadrar).toMatch(/21 en el lote, 20 distribuidas — faltan 1 pieza/);
  });

  it("un m³ escrito a mano en una línea descuadra el bloque y su anexo, y lo dice", () => {
    const dist = clonar(distribuirPorCapacidad(BLOQUES, LOTE, "tipo"));
    const b = dist.especies.flatMap((e) => e.bloques).find((x) => x.bloque.id === "b1")!;
    b.asignado[0].m3 += 0.05;
    b.asignado[0].m3Declarado = true;
    b.usadoM3 += 0.05;
    /* Como lo hace el motor: lo declarado entra a los totales amparados. */
    dist.totales.amparadaM3 += 0.05;
    dist.especies.find((e) => e.especie === "Tornillo")!.amparadaM3 += 0.05;
    const c = cuadrarReparto({ dist, piezas: LOTE });
    const fila = controlDe(c, "medidas")!.filas.find((f) => f.clave === "b1")!;
    expect(fila.estado).toBe("difiere");
    expect(fila.comoCuadrar).toMatch(/escritos a mano/);
    expect(controlDe(c, "anexos")!.filas.find((f) => f.rotulo === "CON-25-UCA-0142")!.estado).toBe("difiere");
    /* El lote no dice «cuadra» con un m³ escrito: señala el bloque. */
    expect(controlDe(c, "lote")!.estado).toBe("difiere");
    expect(controlDe(c, "lote")!.comoCuadrar).toMatch(/GTF b1 lleva m³ escritos a mano/);
    expect(controlDe(c, "medida")!.estado).not.toBe("difiere");
  });

  it("un bloque que ampara más de lo que le cabe dice qué % ponerle", () => {
    const dist = clonar(distribuirPorCapacidad(BLOQUES, LOTE, "tipo"));
    const b = dist.especies.flatMap((e) => e.bloques).find((x) => x.bloque.id === "b1")!;
    b.capacidadM3 = b.usadoM3 - 0.2;
    const c = cuadrarReparto({ dist, piezas: LOTE });
    const fila = controlDe(c, "capacidad")!.filas.find((f) => f.clave === "b1")!;
    expect(fila.estado).toBe("difiere");
    expect(fila.relacion).toBe("tope");
    expect(fila.comoCuadrar).toMatch(/sube el % aprovechable de 55[.,]0 a/);
  });

  it("aserrada sin rolliza y rolliza sin aserrada: probable misma madera con dos nombres", () => {
    const lote = [pieza("t1", 10, 2, 8, 10)];
    const dist = distribuirPorCapacidad([bloque({ id: "b1", especie: "Tornilo" })], lote, "tipo");
    const c = cuadrarReparto({ dist, piezas: lote });
    const h = controlDe(c, "huerfanas")!;
    expect(h.estado).toBe("difiere");
    expect(h.filas.map((f) => f.nota)).toEqual(["Aserrada sin rolliza de su especie", "Rolliza sin aserrada cubicada"]);
    expect(h.filas[1].comoCuadrar).toMatch(/unifica el nombre/);
  });

  it("rolliza que no ampara nada, sola, es para mirar: no descuadra", () => {
    const lote = [pieza("t1", 10, 2, 8, 10)];
    const dist = distribuirPorCapacidad([bloque({ id: "b1" }), bloque({ id: "b2", especie: "Cumala" })], lote, "tipo");
    const c = cuadrarReparto({ dist, piezas: lote });
    const h = controlDe(c, "huerfanas")!;
    expect(h.estado).toBe("exacto");
    expect(h.avisos).toBe(1);
    expect(c.difieren).toBe(0);
  });

  it("sin especie en la pieza y en el bloque es la misma fila, no una diferencia", () => {
    const lote = [pieza("s1", 10, 2, 8, 10, null)];
    const dist = distribuirPorCapacidad([bloque({ id: "b1", especie: "" })], lote, "tipo");
    const c = cuadrarReparto({ dist, piezas: lote });
    expect(c.difieren).toBe(0);
  });

  it("si al abrir el Variado cambia el conteo, el control del cubicado lo marca", () => {
    const dist = distribuirPorCapacidad(BLOQUES, LOTE, "tipo");
    const cubicado = [...LOTE, pieza("v1", 3, 2, 4, 10, "Variado")];
    const c = cuadrarReparto({ dist, piezas: LOTE, cubicado });
    const cub = controlDe(c, "cubicado")!;
    expect(cub.estado).toBe("difiere");
    expect(cub.diferencia.piezas).toBe(-3);
    expect(cub.comoCuadrar).toMatch(/se perdieron 3 piezas/);
  });
});
