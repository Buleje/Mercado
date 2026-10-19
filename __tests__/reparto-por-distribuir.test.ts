/**
 * «Por distribuir» y el Anexo 04 de sólo lo marcado (Brandon, 2026-10-19).
 *
 * El caso de sus capturas: el bloque 1 (PLT-2021-017) con Comercial (120
 * medidas) y Corta (72) tildadas y la Larga angosta (2 medidas) sin tildar; el
 * bloque 2 (PLT-2025-096) entero tildado; el bloque 3 (PLT-2025-167) con la
 * Corta (31 medidas) sin tildar. Lo que se protege: que lo sin tildar se junte
 * solo, por permiso; que el anexo de un bloque lleve sólo lo tildado; y que
 * tildado + pendiente sea exactamente el todo.
 */

import { describe, expect, it } from "vitest";
import { anexosPorPermiso } from "@/lib/forestal/anexo-por-permiso";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  claveMarca,
  distribuirPorCapacidad,
  type BloqueDistribuido,
  type BloqueRolliza,
  type Distribucion,
} from "@/lib/forestal/cubicacion-reparto";
import { distConVolumenOficial } from "@/lib/forestal/reparto-oficial";
import {
  clavesDelBloque,
  cuadreMarcado,
  marcadoEn,
  pendienteEn,
  piezasFiltradasDelBloque,
  porDistribuir,
} from "@/lib/forestal/reparto-por-distribuir";

let n = 0;
function pieza(especie: string, cantidad: number, espesor: number, ancho: number, largo: number): PiezaCubicada {
  const base = {
    id: `p${++n}`, cantidad, espesor, ancho, largo,
    uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const,
    especie,
  };
  const { m3, pieTablar } = cubicarPieza(base);
  return { ...base, m3, pieTablar };
}

const bloque = (o: Partial<BloqueRolliza> & { id: string }): BloqueRolliza => ({
  etiqueta: o.id,
  especie: "Tornillo",
  m3: 400,
  origen: "manual",
  costoM3: null,
  aprovechablePct: 60,
  ...o,
});

const combos = (es: number[], as: number[], ls: number[]) =>
  es.flatMap((e) => as.flatMap((a) => ls.map((l) => [e, a, l] as const)));

/* Bloque 1 · Tornillo: 120 medidas Comercial + 72 Corta + 2 Larga angosta. */
const TORNILLO = [
  ...combos([2, 3], [6, 7, 8, 9, 10, 12], [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]).map(([e, a, l]) => pieza("Tornillo", 3, e, a, l)),
  ...combos([2, 3, 4], [2, 3, 4, 5, 7, 8], [2, 3, 4, 5]).map(([e, a, l]) => pieza("Tornillo", 2, e, a, l)),
  pieza("Tornillo", 7, 2, 3, 10),
  pieza("Tornillo", 5, 3, 4, 12),
];
/* Bloque 2 · Cumala: un poco de cada tipo, todo tildado. */
const CUMALA = [pieza("Cumala", 9, 2, 8, 10), pieza("Cumala", 4, 2, 4, 4), pieza("Cumala", 6, 2, 2, 8)];
/* Bloque 3 · Capirona: Comercial tildada, 31 medidas de Corta sin tildar. */
const CAPIRONA = [
  pieza("Capirona", 2, 2, 8, 10),
  pieza("Capirona", 3, 3, 10, 12),
  ...combos([2, 3, 4], [2, 3, 4, 5, 7, 8], [2, 3]).slice(0, 31).map(([e, a, l]) => pieza("Capirona", 1, e, a, l)),
];

const B1 = bloque({ id: "b1", etiqueta: "Bloque 1", especie: "Tornillo", permiso: "PLT-2021-017" });
const B2 = bloque({ id: "b2", etiqueta: "Bloque 2", especie: "Cumala", permiso: "PLT-2025-096" });
const B3 = bloque({ id: "b3", etiqueta: "Bloque 3", especie: "Capirona", permiso: "PLT-2025-167" });

const DIST: Distribucion = distribuirPorCapacidad([B1, B2, B3], [...TORNILLO, ...CUMALA, ...CAPIRONA], "tipo");
const VISTA = distConVolumenOficial(DIST);

const bloqueDe = (d: Distribucion, id: string): { b: BloqueDistribuido; especie: string } => {
  for (const e of d.especies) for (const b of e.bloques) if (b.bloque.id === id) return { b, especie: e.especie };
  throw new Error(`no está ${id}`);
};
const grupoDe = (d: Distribucion, id: string, rotulo: RegExp) => {
  const { b } = bloqueDe(d, id);
  const g = b.porDia[0].grupos.find((x) => rotulo.test(x.label));
  if (!g) throw new Error(`${id} sin ${rotulo}`);
  return g;
};

/* Lo tildado en las capturas: todo, menos la L. angosta del 1 y la Corta del 3. */
const SIN_MARCA = new Set([
  claveMarca("b1", 1, grupoDe(VISTA, "b1", /angosta/i).clave),
  claveMarca("b3", 1, grupoDe(VISTA, "b3", /^corta/i).clave),
]);
const MARCADAS = new Set(
  ["b1", "b2", "b3"].flatMap((id) => clavesDelBloque(bloqueDe(VISTA, id).b)).filter((k) => !SIN_MARCA.has(k)),
);

describe("el caso de las capturas", () => {
  it("arma los bloques con las medidas de las capturas", () => {
    expect(grupoDe(VISTA, "b1", /comercial/i).medidas.length).toBe(120);
    expect(grupoDe(VISTA, "b1", /^corta/i).medidas.length).toBe(72);
    expect(grupoDe(VISTA, "b1", /angosta/i).medidas.length).toBe(2);
    expect(grupoDe(VISTA, "b3", /^corta/i).medidas.length).toBe(31);
    expect(clavesDelBloque(bloqueDe(VISTA, "b2").b).length).toBe(3);
  });

  it("«Por distribuir» junta sólo lo sin tildar, por permiso", () => {
    const pd = porDistribuir(VISTA, MARCADAS);
    expect(pd.lineas.map((l) => l.clave).sort()).toEqual([...SIN_MARCA].sort());
    expect(pd.porPermiso.map((p) => p.label).sort()).toEqual(["PLT-2021-017", "PLT-2025-167"]);
    /* Cada permiso trae su bloque de origen y nada del otro. */
    for (const p of pd.porPermiso) {
      expect(p.bloques.length).toBe(1);
      expect(p.bloques[0].permiso).toBe(p.label);
    }
    expect(pd.porPermiso.find((p) => p.label === "PLT-2025-167")?.bloques[0].lineas[0].grupo.medidas.length).toBe(31);
  });

  it("se deriva de las casillas: tildar la saca, destildar la devuelve", () => {
    const todo = new Set([...MARCADAS, ...SIN_MARCA]);
    expect(porDistribuir(VISTA, todo).lineas).toEqual([]);
    const sinNada = porDistribuir(VISTA, new Set());
    expect(sinNada.porPermiso.length).toBe(3);
  });

  it("el Anexo 04 del bloque lleva sólo lo tildado", () => {
    const { b, especie } = bloqueDe(VISTA, "b1");
    const piezas = piezasFiltradasDelBloque(b, especie, marcadoEn(MARCADAS));
    expect(piezas.length).toBe(120 + 72);
    expect(piezas.some((p) => /angosta/i.test(String(p.tipo)))).toBe(false);
    /* Sin nada tildado no hay papel. */
    expect(piezasFiltradasDelBloque(b, especie, marcadoEn(new Set()))).toEqual([]);
  });

  it("tildado + por distribuir = todo, exacto en piezas, PT y m³", () => {
    const c = cuadreMarcado(VISTA, MARCADAS);
    expect(c.cuadra).toBe(true);
    expect(c.pendiente.m3).toBeGreaterThan(0);
    expect(Math.round((c.marcado.m3 + c.pendiente.m3) * 1000)).toBe(Math.round(c.todo.m3 * 1000));
    expect(c.marcado.piezas + c.pendiente.piezas).toBe(c.todo.piezas);
    /* El todo es lo que el reparto oficial dice que amparan los bloques. */
    const amparado = VISTA.especies.flatMap((e) => e.bloques).reduce((a, b) => a + Math.round(b.usadoM3 * 1000), 0);
    expect(Math.round(c.todo.m3 * 1000)).toBe(amparado);
  });
});

describe("Anexo 04 por permiso con `incluir`", () => {
  const todo = anexosPorPermiso(DIST);
  const marcado = anexosPorPermiso(DIST, { incluir: marcadoEn(MARCADAS) });
  const pendiente = anexosPorPermiso(DIST, { incluir: pendienteEn(MARCADAS) });
  const de = (xs: typeof todo, label: string) => xs.find((x) => x.label === label);

  it("sólo lo tildado: los tres permisos, el 096 entero", () => {
    expect(marcado.map((a) => a.label).sort()).toEqual(["PLT-2021-017", "PLT-2025-096", "PLT-2025-167"]);
    expect(de(marcado, "PLT-2025-096")?.totalM3).toBe(de(todo, "PLT-2025-096")?.totalM3);
    expect(de(marcado, "PLT-2021-017")?.tipos.some((t) => /angosta/i.test(t))).toBe(false);
  });

  it("sólo lo pendiente: un papel por permiso, nunca dos permisos juntos", () => {
    expect(pendiente.map((a) => a.label).sort()).toEqual(["PLT-2021-017", "PLT-2025-167"]);
    for (const a of pendiente) expect(new Set(a.bloques.map((b) => b.id)).size).toBe(1);
  });

  it("marcado + pendiente = todo, permiso por permiso y fila por fila", () => {
    for (const t of todo) {
      const m = de(marcado, t.label);
      const p = de(pendiente, t.label);
      const mil = (x: number | undefined) => Math.round((x ?? 0) * 1000);
      expect(mil(m?.totalM3) + mil(p?.totalM3)).toBe(mil(t.totalM3));
      expect((m?.totalPiezas ?? 0) + (p?.totalPiezas ?? 0)).toBe(t.totalPiezas);
      for (const [fila, v] of Object.entries(t.oficial.filas)) {
        expect(mil(m?.oficial.filas[fila]) + mil(p?.oficial.filas[fila]), `${t.label} ${fila}`).toBe(mil(v));
      }
      expect(m?.cuadra ?? true).toBe(true);
      expect(p?.cuadra ?? true).toBe(true);
    }
  });

  it("el interruptor y su cuenta dicen los mismos m³ que los papeles", () => {
    const c = cuadreMarcado(VISTA, MARCADAS);
    const mil = (xs: typeof todo) => xs.reduce((a, x) => a + Math.round(x.totalM3 * 1000), 0);
    expect(mil(marcado)).toBe(Math.round(c.marcado.m3 * 1000));
    expect(mil(pendiente)).toBe(Math.round(c.pendiente.m3 * 1000));
    expect(mil(todo)).toBe(Math.round(c.todo.m3 * 1000));
  });

  it("todo tildado = el anexo de siempre", () => {
    const todas = new Set(["b1", "b2", "b3"].flatMap((id) => clavesDelBloque(bloqueDe(VISTA, id).b)));
    const igual = anexosPorPermiso(DIST, { incluir: marcadoEn(todas) });
    expect(igual.map((a) => [a.label, a.totalM3, a.totalPiezas])).toEqual(todo.map((a) => [a.label, a.totalM3, a.totalPiezas]));
  });
});

describe("jornadas", () => {
  it("con dos días, tildar el día 1 deja el día 2 por distribuir", () => {
    const b = bloque({ id: "d1", etiqueta: "Dos días", especie: "Tornillo", permiso: "P-1", dias: 2 });
    const d = distConVolumenOficial(distribuirPorCapacidad([b], TORNILLO.slice(0, 20), "tipo"));
    const { b: bd } = bloqueDe(d, "d1");
    expect(bd.porDia.length).toBe(2);
    const dia1 = new Set(bd.porDia[0].grupos.map((g) => claveMarca("d1", 1, g.clave)));
    const pd = porDistribuir(d, dia1);
    expect(pd.lineas.every((l) => l.dia === 2)).toBe(true);
    const c = cuadreMarcado(d, dia1);
    expect(c.cuadra).toBe(true);
  });
});
