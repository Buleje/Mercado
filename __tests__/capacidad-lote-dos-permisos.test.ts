/**
 * «Lote con dos permisos» (Brandon, 2026-10-19): en Saldos › Capacidad ›
 * «Llevar esta madera al cubicador», un lote que juntó madera de dos títulos
 * decía «Permisos mezclados» y llegaba como UN bloque sin permiso. Ahora se
 * parte por lo que APORTÓ cada permiso, y lo que el libro no atribuye queda
 * «Sin permiso» (siempre ≤: nunca se le carga a un título que no lo amparó).
 *
 * Lo que se protege: Σ partes = el volumen del lote (se parte, no se
 * recalcula), cada parte su bloque con el permiso primero en la etiqueta (o la
 * huella del cubicador descarta la segunda) y la hoja que ya tenía el bloque
 * entero no termina con la misma madera dos veces.
 */

import { describe, expect, it } from "vitest";
import { SIN_PERMISO, etiquetaCortaDePermiso, repartirPorAporte } from "@/lib/forestal/capacidad-por-permiso";
import { bloquesDeCandidato, bloquesDesdeCapacidad, type CandidatoDeCapacidad } from "@/lib/forestal/capacidad-a-bloques";
import { unirSiembra } from "@/lib/forestal/sembrar-reparto";
import { resumenDeLlevar } from "@/components/admin/forestal/saldos/resumen-llevar-agrupar";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { CorridaDisponible, EntradaCapacidad, LoteDeCapacidad } from "@/lib/forestal/capacidad-de-planta";

const P17 = "19-SEC/REG-PLT-2021-017";
const P167 = "19-SEC/REG-PLT-2025-167";

const pieza = (id: string, permiso: string, m3: number, consumida = false) => ({
  id,
  codigo: id,
  especie: "TORNILLO",
  m3,
  permiso,
  guia: "",
  consumida,
});

const lote = (o: Partial<LoteDeCapacidad> & { code: string }): LoteDeCapacidad => ({
  id: o.code,
  trozas: [],
  permisos: [],
  especie: "TORNILLO",
  status: "abierto",
  consumidoM3: 0,
  esperado56M3: 0,
  producidoM3: null,
  restaM3: null,
  apartadoM3: 0,
  piezas: 0,
  ...o,
});

const corrida = (o: Partial<CorridaDisponible> & { id: string }): CorridaDisponible => ({
  fecha: "2026-10-01",
  lote: "L-1",
  producto: "MADERA ASERRADA",
  especie: "TORNILLO",
  unidad: "m3",
  disponible: 0,
  titularOrigen: [],
  gtfOrigen: [],
  paquetes: [],
  ...o,
});

const entrada = (o: Partial<EntradaCapacidad>): EntradaCapacidad => ({
  patio: [],
  lotes: [],
  corridas: [],
  stockLibroM3: 0,
  pendienteSinPiezasM3: 0,
  ...o,
});

const suma = (xs: readonly { m3: number }[]) => Math.round(xs.reduce((a, x) => a + x.m3, 0) * 10000) / 10000;
const filas = (c: CandidatoDeCapacidad) =>
  resumenDeLlevar([c], [c]).filas.map((f) => [etiquetaCortaDePermiso(f), f.piezas, f.m3]);

/* El ejemplo de Brandon: un lote de Tornillo con 2 m³ del 017 y 1 m³ del 167
   apartados (piezas enteras), y lo que ya entró a la sierra, 2 + 1 también. */
const L7 = lote({
  code: "L-7",
  permisos: [P17, P167],
  apartadoM3: 3,
  piezas: 3,
  consumidoM3: 3,
  esperado56M3: 1.68,
  trozas: [
    pieza("a", P17, 1.2),
    pieza("b", P17, 0.8),
    pieza("c", P167, 1),
    pieza("x", P17, 2, true),
    pieza("y", P167, 1, true),
  ],
});

describe("un lote de dos permisos, 2 + 1 m³", () => {
  const todo = bloquesDesdeCapacidad(entrada({ lotes: [L7] }), {});
  const apartado = todo.find((c) => c.clave === "apartado:L-7")!;
  const margen = todo.find((c) => c.clave === "lotes:L-7")!;

  it("lo apartado se parte pieza por pieza: 2 partes que suman 3", () => {
    expect(apartado.partes).toEqual([
      { permiso: P17, mezclado: false, m3: 2, piezas: 2 },
      { permiso: P167, mezclado: false, m3: 1, piezas: 1 },
    ]);
    expect(suma(apartado.partes!)).toBe(apartado.m3);
  });

  it("«Lo que se va al cubicador» lo muestra en dos filas, sin «Permisos mezclados»", () => {
    expect(filas(apartado)).toEqual([
      ["PLT-2021-017", 2, 2],
      ["PLT-2025-167", 1, 1],
    ]);
  });

  it("el margen (ya aserrada) va en proporción a lo que cada permiso metió a la sierra", () => {
    expect(margen.m3).toBe(1.68);
    expect(margen.partes!.map((p) => [p.permiso, p.m3])).toEqual([
      [P17, 1.12],
      [P167, 0.56],
    ]);
  });

  it("al cubicador van dos bloques, permiso primero, del mismo lote", () => {
    const bloques = bloquesDeCandidato(apartado);
    expect(bloques.map((b) => [b.etiqueta, b.permiso, b.m3, b.loteId])).toEqual([
      ["PLT-2021-017 · Tornillo · lote L-7 · apartado", P17, 2, "L-7"],
      ["PLT-2025-167 · Tornillo · lote L-7 · apartado", P167, 1, "L-7"],
    ]);
    const r = unirSiembra([], bloques, "capacidad", "t");
    expect(r).toMatchObject({ sembrados: 2, repetidos: 0 });
    expect(r.lista.every((b) => !("partidoDe" in b))).toBe(true);
    // Volver a llevarlo no duplica nada.
    expect(unirSiembra(r.lista, bloques, "capacidad", "u")).toMatchObject({ sembrados: 0, repetidos: 2 });
  });

  it("la hoja con el bloque ENTERO de antes: misma madera → sus partes; otra madera → se respeta", () => {
    const entero = (m3: number): BloqueRolliza => ({
      id: "viejo",
      etiqueta: "Lote L-7 · apartado",
      especie: "Tornillo",
      m3,
      origen: "manual",
      tipo: "rolliza",
      loteId: "L-7",
    });
    const bloques = bloquesDeCandidato(apartado);
    const igual = unirSiembra([entero(3)], bloques, "capacidad", "t");
    expect(igual.lista.map((b) => b.etiqueta)).toEqual(bloques.map((b) => b.etiqueta));
    expect(suma(igual.lista)).toBe(3);
    const cambio = unirSiembra([entero(2.5)], bloques, "capacidad", "t");
    expect(cambio.lista.map((b) => b.m3)).toEqual([2.5]);
    expect(cambio).toMatchObject({ sembrados: 0, repetidos: 2 });
  });

  it("un bloque del lote armado desde la Distribución sigue frenando (no se toca)", () => {
    const deLaDistribucion: BloqueRolliza = {
      id: "d",
      etiqueta: "Bloque 1",
      especie: "Tornillo",
      m3: 3,
      origen: "manual",
      tipo: "rolliza",
      loteId: "L-7",
    };
    const r = unirSiembra([deLaDistribucion], bloquesDeCandidato(apartado), "capacidad", "t");
    expect(r.lista).toHaveLength(1);
    expect(r.sembrados).toBe(0);
  });
});

describe("una corrida que consumió de dos permisos", () => {
  const c2 = corrida({
    id: "c2",
    disponible: 3,
    titularOrigen: [P17, P167],
    origenPorPermiso: [
      { permiso: P17, m3: 4 },
      { permiso: P167, m3: 2 },
    ],
  });
  const cand = bloquesDesdeCapacidad(entrada({ corridas: [c2] }), {})[0]!;

  it("se parte en proporción a lo consumido de cada uno: 4 : 2 → 2 + 1", () => {
    expect(cand.partes!.map((p) => [p.permiso, p.m3])).toEqual([
      [P17, 2],
      [P167, 1],
    ]);
  });

  it("las dos partes comparten la corrida y entran las dos; el entero de antes se cambia", () => {
    const bloques = bloquesDeCandidato(cand);
    expect(bloques.map((b) => [b.etiqueta, b.paqueteId])).toEqual([
      ["PLT-2021-017 · Tornillo · MADERA ASERRADA · L-1", "corrida:c2"],
      ["PLT-2025-167 · Tornillo · MADERA ASERRADA · L-1", "corrida:c2"],
    ]);
    const vacia = unirSiembra([], bloques, "capacidad", "t");
    expect(vacia).toMatchObject({ sembrados: 2, repetidos: 0 });
    expect(unirSiembra(vacia.lista, bloques, "capacidad", "u")).toMatchObject({ sembrados: 0, repetidos: 2 });
    const entero: BloqueRolliza = {
      id: "p",
      etiqueta: "MADERA ASERRADA · L-1",
      especie: "Tornillo",
      m3: 3,
      origen: "manual",
      tipo: "aserrada",
      paqueteId: "corrida:c2",
    };
    const cambiado = unirSiembra([entero], bloques, "capacidad", "t");
    expect(cambiado.lista.map((b) => b.m3)).toEqual([2, 1]);
  });

  it("sin el desglose de lo consumido no se puede saber: todo «Sin permiso»", () => {
    const sinDesglose = bloquesDesdeCapacidad(
      entrada({ corridas: [corrida({ id: "c3", disponible: 3, titularOrigen: [P17, P167] })] }),
      {},
    )[0]!;
    expect(sinDesglose.partes).toEqual([{ permiso: null, mezclado: false, sinAtribuir: true, m3: 3, piezas: 0 }]);
    expect(bloquesDeCandidato(sinDesglose)).toHaveLength(1);
  });
});

describe("lo que no se puede atribuir es «Sin permiso», nunca de otro", () => {
  it("un lote que consumió 4 m³ pero sus piezas explican 3: la cuarta parte queda sin permiso", () => {
    const l = lote({
      code: "L-9",
      permisos: [P17, P167],
      consumidoM3: 4,
      esperado56M3: 2.24,
      trozas: [pieza("x", P17, 2, true), pieza("y", P167, 1, true)],
    });
    const margen = bloquesDesdeCapacidad(entrada({ lotes: [l] }), {}).find((c) => c.clave === "lotes:L-9")!;
    expect(margen.partes!.map((p) => [p.permiso, p.m3, Boolean(p.sinAtribuir)])).toEqual([
      [P17, 1.12, false],
      [P167, 0.56, false],
      [null, 0.56, true],
    ]);
    expect(suma(margen.partes!)).toBe(2.24);
    const sinFila = resumenDeLlevar([margen], [margen]).filas.find((f) => !f.permiso)!;
    expect(sinFila).toMatchObject({ m3: 0.56, sinAtribuir: true });
    expect(etiquetaCortaDePermiso(sinFila)).toBe(SIN_PERMISO);
    expect(bloquesDeCandidato(margen).map((b) => b.etiqueta)).toEqual([
      "PLT-2021-017 · Tornillo · lote L-9 · margen",
      "PLT-2025-167 · Tornillo · lote L-9 · margen",
      "Sin permiso · Tornillo · lote L-9 · margen",
    ]);
  });

  it("repartirPorAporte: Σ exacta en diezmilésimas, aunque la cuenta no sea redonda", () => {
    const tercios = repartirPorAporte(1, [
      { permiso: "A", m3: 1 },
      { permiso: "B", m3: 1 },
      { permiso: "C", m3: 1 },
    ]);
    expect(tercios.map((p) => p.m3)).toEqual([0.3334, 0.3333, 0.3333]);
    expect(suma(tercios)).toBe(1);
    expect(repartirPorAporte(2, [{ permiso: null, m3: 5 }])).toEqual([
      { permiso: null, mezclado: false, sinAtribuir: true, m3: 2, piezas: 0 },
    ]);
  });
});

describe("un lote de UN permiso no cambia", () => {
  it("una sola parte, igual a la de antes, con su etiqueta de siempre", () => {
    const l = lote({ code: "L-8", permisos: [P17], apartadoM3: 2, piezas: 2, trozas: [pieza("a", P17, 1), pieza("b", P17, 1)] });
    const c = bloquesDesdeCapacidad(entrada({ lotes: [l] }), {})[0]!;
    expect(c.partes).toEqual([{ permiso: P17, mezclado: false, m3: 2, piezas: 2 }]);
    expect(bloquesDeCandidato(c).map((b) => [b.etiqueta, b.permiso, b.m3])).toEqual([["Lote L-8 · apartado", P17, 2]]);
  });
});
