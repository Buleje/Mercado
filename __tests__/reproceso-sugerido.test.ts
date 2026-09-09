/**
 * La sugerencia de reproceso: lo que sobra de un tipo contra lo que falta de
 * otro (ADR-404).
 *
 * Lo que se protege acá es la regla que Brandon puso como condición: **el
 * volumen nunca crece**. Un reproceso pierde madera; una sugerencia que
 * prometa más m³ de los que hay es una que hace declarar de más.
 */

import { describe, expect, it } from "vitest";
import {
  agruparPorOrigen,
  cuadreDeDistribucion,
  resumenDeSugerencias,
  sugerenciasDeReproceso,
} from "@/lib/forestal/reproceso-sugerido";
import { distribuirPorCapacidad, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { medidasDeMeta } from "@/lib/forestal/cubicacion-meta";

/**
 * Piezas de 6×6×10' = **paquetería larga** (sección exacta 6×6, largo ≥ 6').
 *
 * El `m3`/`pieTablar` van precomputados como en el resto del módulo: el motor
 * reparte piezas ENTERAS leyendo esos campos, y un renglón sin ellos lo deja
 * dividiendo por `undefined` (probado: cuelga el reparto).
 */
function pieza(id: string, cantidad: number, especie = "Tornillo"): PiezaCubicada {
  const base = {
    id,
    cantidad,
    espesor: 6,
    ancho: 6,
    largo: 10,
    uEspesor: "pulg" as const,
    uAncho: "pulg" as const,
    uLargo: "pies" as const,
    especie,
  };
  const { m3, pieTablar } = cubicarPieza(base);
  return { ...base, m3, pieTablar };
}

const bloque = (o: Partial<BloqueRolliza> & { id: string }): BloqueRolliza => ({
  etiqueta: o.id,
  especie: "Tornillo",
  m3: 0,
  origen: "manual",
  tipo: "aserrada",
  costoM3: null,
  aprovechablePct: null,
  ...o,
});

/** 80 paquetes de 6×6×10' ≈ 5.66 m³ — lo que hay que despachar. */
const PAQUETERIA: PiezaCubicada[] = [pieza("p1", 40), pieza("p2", 40)];
const M3_PAQUETERIA = PAQUETERIA.reduce((a, p) => a + (p.m3 ?? 0), 0);

/** Un bloque de COMERCIAL que sólo lleva comercial: rechaza la paquetería. */
const comercialQueNoAmpara = (m3: number) =>
  bloque({
    id: `c-${m3}`,
    etiqueta: "Saldo comercial",
    m3,
    tipoProducto: "Comercial",
    gruposFiltro: ["tipo|Comercial"],
  });

describe("motivo «faltante»: sobra un tipo y falta otro", () => {
  it("sugiere convertir, sin prometer más m³ de los que hay", () => {
    const d = distribuirPorCapacidad([comercialQueNoAmpara(3)], PAQUETERIA, "tipo");
    const s = sugerenciasDeReproceso(d).filter((x) => x.motivo === "faltante");
    expect(s.length).toBe(1);
    expect(s[0]).toMatchObject({
      especie: "Tornillo",
      desdeTipo: "Comercial",
      haciaTipo: "Paquetería larga",
      disponibleM3: 3,
      convertirM3: 3,
      cubreTodo: false,
    });
    expect(s[0].convertirM3).toBeLessThanOrEqual(s[0].disponibleM3);
    expect(s[0].restaM3).toBeCloseTo(M3_PAQUETERIA - 3, 3);
    expect(s[0].sobraM3).toBe(0);
  });

  it("con más madera de la que falta, el faltante queda cubierto y sobra origen", () => {
    const s = sugerenciasDeReproceso(
      distribuirPorCapacidad([comercialQueNoAmpara(50)], PAQUETERIA, "tipo"),
    ).filter((x) => x.motivo === "faltante");
    expect(s[0].cubreTodo).toBe(true);
    expect(s[0].restaM3).toBe(0);
    expect(s[0].sobraM3).toBeGreaterThan(0);
    expect(s[0].convertirM3).toBeCloseTo(M3_PAQUETERIA, 3);
    // Lo convertido nunca supera lo disponible: el reproceso no crea madera.
    expect(s[0].convertirM3).toBeLessThan(s[0].disponibleM3);
  });

  it("no sugiere un tipo hacia sí mismo: eso es capacidad sin usar, no reproceso", () => {
    const soloPaq = bloque({
      id: "b4",
      m3: 0.2,
      gruposFiltro: ["tipo|Paquetería larga"],
      tipoProducto: "Paquetería larga",
    });
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([soloPaq], PAQUETERIA, "tipo"))).toEqual([]);
  });

  it("un bloque sin tipo declarado no sugiere nada: no se adivina", () => {
    const anonimo = bloque({ id: "b5", m3: 3, gruposFiltro: ["tipo|Comercial"] , tipoProducto: null });
    /* Con «lleva sólo Comercial» el tipo SÍ se conoce; el caso sin tipo es el
       bloque que no declara ni filtro ni producto. */
    const sinNada = bloque({ id: "b6", m3: 3 });
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([sinNada], PAQUETERIA, "tipo"))).toEqual([]);
    expect(
      sugerenciasDeReproceso(distribuirPorCapacidad([anonimo], PAQUETERIA, "tipo")).length,
    ).toBeGreaterThan(0);
  });

  it("no cruza especies: reprocesar tornillo no produce cachimbo", () => {
    const otra = bloque({
      id: "b7",
      m3: 3,
      especie: "Cachimbo",
      tipoProducto: "Comercial",
      gruposFiltro: ["tipo|Comercial"],
    });
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([otra], PAQUETERIA, "tipo"))).toEqual([]);
  });

  it("«Lleva sólo» con dos tipos deja al bloque sin tipo: no hay de cuál sacar", () => {
    const mezcla = bloque({ id: "b8", m3: 3, gruposFiltro: ["tipo|Comercial", "tipo|Corta"] });
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([mezcla], PAQUETERIA, "tipo"))).toEqual([]);
  });
});

describe("motivo «amparado»: el bloque ya respalda otro tipo", () => {
  it("un respaldo comercial sobre piezas de paquetería es un reproceso sin declarar", () => {
    /* Sin «lleva sólo», el reparto le da la paquetería igual: el papel diría
       que esa paquetería salió de un respaldo comercial. */
    const comercial = bloque({ id: "a1", etiqueta: "Saldo comercial", m3: 3, tipoProducto: "Comercial" });
    const s = sugerenciasDeReproceso(distribuirPorCapacidad([comercial], PAQUETERIA, "tipo"));
    const amparado = s.filter((x) => x.motivo === "amparado");
    expect(amparado.length).toBe(1);
    expect(amparado[0]).toMatchObject({
      desdeTipo: "Comercial",
      haciaTipo: "Paquetería larga",
      cubreTodo: true,
    });
    // Lo que hay que reprocesar es lo que el bloque ampara, ni más ni menos.
    expect(amparado[0].convertirM3).toBeGreaterThan(0);
    expect(amparado[0].convertirM3).toBeLessThanOrEqual(3);
  });

  it("un bloque que ampara su propio tipo no genera sugerencia", () => {
    const paq = bloque({ id: "a2", m3: 10, tipoProducto: "Paquetería larga" });
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([paq], PAQUETERIA, "tipo"))).toEqual([]);
  });
});

describe("el piso de lo sugerible", () => {
  it("los litros que sobran por piezas enteras no se sugieren", () => {
    /* Un bloque de 0.01 m³ libres: es el resto de la pieza que ya no entraba,
       no una orden de trabajo. */
    const migaja = comercialQueNoAmpara(0.01);
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([migaja], PAQUETERIA, "tipo"))).toEqual([]);
  });
});

describe("resumenDeSugerencias", () => {
  it("no cuenta dos veces el mismo destino", () => {
    const dosOrigenes = [
      comercialQueNoAmpara(1),
      bloque({ id: "x2", m3: 1, tipoProducto: "Tabla", gruposFiltro: ["tipo|Tabla"] }),
    ];
    const s = sugerenciasDeReproceso(distribuirPorCapacidad(dosOrigenes, PAQUETERIA, "tipo")).filter(
      (x) => x.motivo === "faltante",
    );
    expect(s.length).toBe(2); // dos orígenes para el mismo destino
    const r = resumenDeSugerencias(s);
    expect(r.cuantas).toBe(2);
    expect(r.m3EnJuego).toBe(s[0].convertirM3);
  });
});

describe("cuadreDeDistribucion", () => {
  it("cuenta el aporte UNA vez por destino: dos orígenes no tapan el doble", () => {
    const dos = [
      comercialQueNoAmpara(1),
      bloque({ id: "t1", m3: 1, tipoProducto: "Tabla", gruposFiltro: ["tipo|Tabla"] }),
    ];
    const d = distribuirPorCapacidad(dos, PAQUETERIA, "tipo");
    const s = sugerenciasDeReproceso(d);
    const c = cuadreDeDistribucion(
      { faltanteM3: d.totales.faltanteM3, libreM3: d.totales.libreM3 },
      40,
      s,
    );
    // Los dos ofrecen 1 m³ para la MISMA paquetería: tapan 1, no 2.
    expect(c.cubreReprocesoM3).toBe(1);
    expect(c.faltaM3).toBeCloseTo(M3_PAQUETERIA, 3);
    expect(c.quedaM3).toBeCloseTo(M3_PAQUETERIA - 1, 3);
  });

  it("lo que ya se ampara no cuenta como tapón: ese hueco no existe", () => {
    const comercial = bloque({ id: "z1", m3: 3, tipoProducto: "Comercial" });
    const d = distribuirPorCapacidad([comercial], PAQUETERIA, "tipo");
    const c = cuadreDeDistribucion(
      { faltanteM3: d.totales.faltanteM3, libreM3: d.totales.libreM3 },
      40,
      sugerenciasDeReproceso(d),
    );
    expect(c.cubreReprocesoM3).toBe(0);
    expect(c.quedaM3).toBe(c.faltaM3);
  });
});

describe("agruparPorOrigen — el producto original con todo lo que sale de él", () => {
  /* Un bloque de comercial que ampara paquetería larga, corta y tabla: las tres
     salen del MISMO producto, que es como Brandon las quiere leer. */
  const variado: PiezaCubicada[] = [
    pieza("v1", 10), // paquetería larga (6×6×10)
    { ...pieza("v2", 20), espesor: 6, ancho: 6, largo: 4, ...cubicarPieza({ cantidad: 20, espesor: 6, ancho: 6, largo: 4, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" }) },
  ];

  it("junta las salidas del mismo bloque en un solo grupo", () => {
    const comercial = bloque({ id: "g1", etiqueta: "Saldo comercial", m3: 3, tipoProducto: "Comercial", piezasOrigen: 25 });
    const g = agruparPorOrigen(sugerenciasDeReproceso(distribuirPorCapacidad([comercial], variado, "tipo")));
    expect(g.length).toBe(1);
    expect(g[0]).toMatchObject({ desdeTipo: "Comercial", origenM3: 3, origenPiezas: 25 });
    expect(g[0].amparados.length).toBeGreaterThan(1);
  });

  it("el permiso del original es UNO solo, el que declara el bloque", () => {
    const conPermiso = bloque({ id: "gp", m3: 3, tipoProducto: "Comercial", permiso: "CON-25-UCA-0142" });
    const [g] = agruparPorOrigen(sugerenciasDeReproceso(distribuirPorCapacidad([conPermiso], variado, "tipo")));
    expect(g.permiso).toBe("CON-25-UCA-0142");
  });

  it("con bloques de permisos distintos no se elige uno: queda sin permiso", () => {
    /* Decir «CON-A» sobre madera que también salió de «CON-B» es declarar un
       origen que no es. */
    const a = bloque({ id: "ga", m3: 2, tipoProducto: "Comercial", permiso: "CON-A", gruposFiltro: ["tipo|Comercial"] });
    const b = bloque({ id: "gb", m3: 2, tipoProducto: "Comercial", permiso: "CON-B", gruposFiltro: ["tipo|Comercial"] });
    const grupos = agruparPorOrigen(
      sugerenciasDeReproceso(distribuirPorCapacidad([a, b], variado, "tipo")),
    );
    /* Los dos bloques comparten tipo: la sugerencia por faltante los junta en un
       grupo `t:` y ahí el permiso ya no es único. */
    const juntos = grupos.find((g) => g.clave.startsWith("t:"));
    if (juntos) expect(juntos.permiso).toBeNull();
    else expect(grupos.every((g) => g.permiso === "CON-A" || g.permiso === "CON-B")).toBe(true);
  });

  it("lo que sale es MENOS que lo que entró, y lo que queda cierra la resta", () => {
    const comercial = bloque({ id: "g2", m3: 3, tipoProducto: "Comercial", piezasOrigen: 25 });
    const [g] = agruparPorOrigen(sugerenciasDeReproceso(distribuirPorCapacidad([comercial], variado, "tipo")));
    expect(g.saleM3).toBeLessThanOrEqual(g.origenM3);
    expect(g.quedaM3).toBeCloseTo(g.origenM3 - g.saleM3, 4);
    // El total de piezas es la suma de las salidas, no del original.
    expect(g.salePiezas).toBe(g.amparados.reduce((a, d) => a + d.piezas, 0));
  });

  it("el cierre por medición se reporta como exceso, no como «quedan 0»", () => {
    /* El reparto deja que un bloque cierre hasta 1 % por encima para que las
       últimas piezas no queden huérfanas (medido: 2.500 → 2.520). Eso no es un
       reproceso que fabrique madera y la cuenta tiene que decirlo. */
    const chico = bloque({ id: "g3", m3: 0.05, tipoProducto: "Comercial" });
    const [g] = agruparPorOrigen(
      sugerenciasDeReproceso(distribuirPorCapacidad([chico], variado, "tipo")),
    );
    if (g && g.saleM3 > g.origenM3) {
      expect(g.excedeM3).toBeCloseTo(g.saleM3 - g.origenM3, 4);
      expect(g.quedaM3).toBe(0);
    } else {
      expect(g?.excedeM3 ?? 0).toBe(0);
    }
  });

  it("la cuenta CIERRA contra lo que el bloque ampara (el número de la tabla)", () => {
    /* El descuadre que reportó Brandon: la tabla decía «ampara 3.077» y el pie
       del reproceso «salen 2.322 · quedan 0.803». Los 0.755 que faltaban son
       comercial amparando comercial: no es reproceso, pero se ampara igual. */
    const comercial = bloque({ id: "cierra", m3: 3.078, tipoProducto: "Comercial" });
    const d = distribuirPorCapacidad([comercial], variado, "tipo");
    const [g] = agruparPorOrigen(sugerenciasDeReproceso(d));
    const bd = d.especies[0].bloques[0];
    expect(g.amparadoM3).toBeCloseTo(bd.usadoM3, 3);
    // reproceso + mismo tipo = todo lo amparado
    expect(g.saleM3 + g.mismoTipoM3).toBeCloseTo(g.amparadoM3, 3);
    // y lo que queda es lo que el bloque NO ampara
    expect(g.quedaM3).toBeCloseTo(Math.max(0, g.origenM3 - g.amparadoM3), 3);
  });

  it("las OPCIONES no suman al total: compiten por la misma capacidad libre", () => {
    const soloComercial = comercialQueNoAmpara(3);
    const [g] = agruparPorOrigen(
      sugerenciasDeReproceso(distribuirPorCapacidad([soloComercial], variado, "tipo")),
    );
    expect(g.opciones.length).toBeGreaterThan(1);
    expect(g.amparados).toEqual([]);
    // Nada salió todavía: el total es 0 y el original sigue entero.
    expect(g.saleM3).toBe(0);
    expect(g.quedaM3).toBe(g.origenM3);
  });
});

describe("medidasDeMeta — la meta también se corta en escuadrías", () => {
  it("desglosa el tipo de la meta y los porcentajes suman 100", () => {
    const rows: PiezaCubicada[] = [pieza("m1", 20), pieza("m2", 10)];
    const { filas, piezas, pieTablar } = medidasDeMeta(rows, "Paquetería larga");
    expect(piezas).toBe(30);
    expect(filas.length).toBe(1); // misma medida en los dos renglones
    expect(filas[0].pctDelTipo).toBe(100);
    expect(pieTablar).toBeCloseTo(rows.reduce((a, p) => a + (p.pieTablar ?? 0), 0), 2);
  });

  it("un tipo que el lote no tiene devuelve vacío, no ceros inventados", () => {
    const { filas, pieTablar } = medidasDeMeta([pieza("m3", 5)], "Tabla");
    expect(filas).toEqual([]);
    expect(pieTablar).toBe(0);
  });
});
