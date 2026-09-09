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
  amparosImposibles,
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

/** Piezas de 6×6×4' = **paquetería corta** (sección 6×6, largo < 6'). */
function piezaCorta(id: string, cantidad: number, especie = "Tornillo"): PiezaCubicada {
  const base = {
    id,
    cantidad,
    espesor: 6,
    ancho: 6,
    largo: 4,
    uEspesor: "pulg" as const,
    uAncho: "pulg" as const,
    uLargo: "pies" as const,
    especie,
  };
  const { m3, pieTablar } = cubicarPieza(base);
  return { ...base, m3, pieTablar };
}

/** Piezas de 2×8×10' = **comercial** (espesor ≥ 1.5", ancho ≥ 6", largo ≥ 6'). */
function piezaComercial(id: string, cantidad: number, especie = "Tornillo"): PiezaCubicada {
  const base = {
    id,
    cantidad,
    espesor: 2,
    ancho: 8,
    largo: 10,
    uEspesor: "pulg" as const,
    uAncho: "pulg" as const,
    uLargo: "pies" as const,
    especie,
  };
  const { m3, pieTablar } = cubicarPieza(base);
  return { ...base, m3, pieTablar };
}

/** 80 paquetes de 6×6×10' ≈ 5.66 m³ — lo que hay que despachar. */
const PAQUETERIA: PiezaCubicada[] = [pieza("p1", 40), pieza("p2", 40)];
const M3_PAQUETERIA = PAQUETERIA.reduce((a, p) => a + (p.m3 ?? 0), 0);

/** Lo que hay que despachar cuando el destino es paquetería CORTA. */
const PAQ_CORTA: PiezaCubicada[] = [piezaCorta("pc1", 40), piezaCorta("pc2", 40)];
/** Lo que hay que despachar cuando el destino es COMERCIAL. */
const COMERCIAL: PiezaCubicada[] = [piezaComercial("cm1", 30)];

/**
 * Piezas de 1.25×8×10' = **«Otro»**: no es tabla (espesor ≠ 1"), no es comercial
 * (espesor < 1.5") y no es larga angosta (ancho > 5"). Nadie puede reprocesarse
 * en «Otro»: no es un producto del Libro.
 */
function piezaOtro(id: string, cantidad: number): PiezaCubicada {
  const base = {
    id,
    cantidad,
    espesor: 1.25,
    ancho: 8,
    largo: 10,
    uEspesor: "pulg" as const,
    uAncho: "pulg" as const,
    uLargo: "pies" as const,
    especie: "Tornillo",
  };
  const { m3, pieTablar } = cubicarPieza(base);
  return { ...base, m3, pieTablar };
}

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

describe("sólo lo que la sierra puede hacer (ADR-407)", () => {
  it("un producto terminado no se ofrece como origen: de una tabla no sale comercial", () => {
    /* Sobra tabla (con «lleva sólo», así queda capacidad libre) y falta
       comercial. La tabla ya salió de la sierra: no vuelve a entrar. */
    const tablaLibre = bloque({
      id: "r1",
      etiqueta: "Saldo tabla",
      m3: 5,
      tipoProducto: "Tabla",
      gruposFiltro: ["tipo|Tabla"],
    });
    const d = distribuirPorCapacidad([tablaLibre], COMERCIAL, "tipo");
    expect(d.totales.faltanteM3).toBeGreaterThan(0); // hay comercial sin respaldo
    expect(sugerenciasDeReproceso(d)).toEqual([]);
  });

  it("de paquetería larga SÍ sale comercial: Brandon lo corrigió el 2026-09-09", () => {
    const paqLibre = bloque({
      id: "r1b",
      m3: 5,
      tipoProducto: "Paquetería larga",
      gruposFiltro: ["tipo|Paquetería larga"],
    });
    const s = sugerenciasDeReproceso(
      distribuirPorCapacidad([paqLibre], COMERCIAL, "tipo"),
    ).filter((x) => x.motivo === "faltante");
    expect(s.length).toBe(1);
    expect(s[0]).toMatchObject({ desdeTipo: "Paquetería larga", haciaTipo: "Comercial" });
  });

  it("de paquetería larga SÍ sale paquetería corta: es un recorte de largo", () => {
    const paqLibre = bloque({
      id: "r2",
      m3: 5,
      tipoProducto: "Paquetería larga",
      gruposFiltro: ["tipo|Paquetería larga"],
    });
    const s = sugerenciasDeReproceso(
      distribuirPorCapacidad([paqLibre], PAQ_CORTA, "tipo"),
    ).filter((x) => x.motivo === "faltante");
    expect(s.length).toBe(1);
    expect(s[0]).toMatchObject({ desdeTipo: "Paquetería larga", haciaTipo: "Paquetería corta" });
  });

  it("un respaldo imposible NO se ofrece declarar: sale como advertencia aparte", () => {
    /* Un bloque de TABLA que ampara comercial. El reparto lo permite —no mira
       tipos—, pero declararlo sería firmar que una tabla volvió a la sierra y
       salió comercial. */
    const tabla = bloque({ id: "r3", etiqueta: "GTF-9", m3: 5, tipoProducto: "Tabla" });
    const d = distribuirPorCapacidad([tabla], COMERCIAL, "tipo");
    expect(sugerenciasDeReproceso(d).filter((x) => x.motivo === "amparado")).toEqual([]);

    const imp = amparosImposibles(d);
    expect(imp.length).toBe(1);
    expect(imp[0]).toMatchObject({
      desdeTipo: "Tabla",
      haciaTipo: "Comercial",
      etiqueta: "GTF-9",
    });
    expect(imp[0].m3).toBeGreaterThan(0);
    expect(imp[0].piezas).toBeGreaterThan(0);
    expect(imp[0].porque).toMatch(/producto terminado/);
  });

  it("un reproceso posible sigue siendo sugerencia, no advertencia", () => {
    const comercial = bloque({ id: "r4", m3: 3, tipoProducto: "Comercial" });
    const d = distribuirPorCapacidad([comercial], PAQUETERIA, "tipo");
    expect(amparosImposibles(d)).toEqual([]);
    expect(sugerenciasDeReproceso(d).some((x) => x.motivo === "amparado")).toBe(true);
  });

  it("la cuenta del producto CIERRA con lo imposible incluido", () => {
    /* Un bloque de paquetería larga que ampara las tres cosas: su mismo tipo,
       paquetería corta (reproceso válido) y «Otro» (imposible: no es un
       producto del Libro). Sin el renglón de lo imposible, «sale + mismo tipo»
       no llega a lo amparado y se lee como un descuadre inventado. */
    const mezcla: PiezaCubicada[] = [pieza("m1", 10), piezaCorta("m2", 10), piezaOtro("m3", 10)];
    const paq = bloque({ id: "r5", m3: 6, tipoProducto: "Paquetería larga" });
    const d = distribuirPorCapacidad([paq], mezcla, "tipo");
    const imp = amparosImposibles(d);
    expect(imp.length).toBe(1);
    const [g] = agruparPorOrigen(sugerenciasDeReproceso(d), imp);
    expect(g.imposibleM3).toBeCloseTo(imp[0].m3, 4);
    expect(g.imposiblePiezas).toBe(imp[0].piezas);
    expect(g.saleM3 + g.mismoTipoM3 + g.imposibleM3).toBeCloseTo(g.amparadoM3, 3);
  });
});

describe("las opciones que entran juntas se suman; las que no, compiten", () => {
  /* Faltan paquetería larga y paquetería corta; sobra comercial. Las dos
     salidas caben en la capacidad libre: «de 2.500 salen 1.500 y 0.800»
     (Brandon, 2026-09-09). */
  const dosDestinos: PiezaCubicada[] = [pieza("o1", 10), piezaCorta("o2", 10)];

  it("con capacidad de sobra, entran las dos y el total se muestra", () => {
    const grande = bloque({
      id: "o-big",
      m3: 50,
      tipoProducto: "Comercial",
      gruposFiltro: ["tipo|Comercial"],
    });
    const [g] = agruparPorOrigen(
      sugerenciasDeReproceso(distribuirPorCapacidad([grande], dosDestinos, "tipo")),
    );
    expect(g.opciones.length).toBe(2);
    expect(g.opcionesM3).toBeCloseTo(g.opciones.reduce((a, d) => a + d.m3, 0), 4);
    expect(g.opcionesM3).toBeLessThanOrEqual(g.libreM3);
    expect(g.opcionesCabenJuntas).toBe(true);
    expect(g.opcionesPiezas).toBe(g.opciones.reduce((a, d) => a + d.piezas, 0));
    // Sumarlas para preguntar si entran NO las convierte en madera que salió.
    expect(g.saleM3).toBe(0);
  });

  it("con poca capacidad compiten: elegir una es elegir la otra", () => {
    const chico = bloque({
      id: "o-min",
      m3: 0.3,
      tipoProducto: "Comercial",
      gruposFiltro: ["tipo|Comercial"],
    });
    const [g] = agruparPorOrigen(
      sugerenciasDeReproceso(distribuirPorCapacidad([chico], dosDestinos, "tipo")),
    );
    expect(g.opciones.length).toBe(2);
    expect(g.opcionesM3).toBeGreaterThan(g.libreM3);
    expect(g.opcionesCabenJuntas).toBe(false);
  });
});

describe("resumenDeSugerencias", () => {
  it("no cuenta dos veces el mismo destino", () => {
    /* Los dos orígenes tienen que poder DAR el destino (ADR-407): comercial y
       paquetería larga son los dos que dan paquetería corta. */
    const dosOrigenes = [
      comercialQueNoAmpara(1),
      bloque({
        id: "x2",
        m3: 1,
        tipoProducto: "Paquetería larga",
        gruposFiltro: ["tipo|Paquetería larga"],
      }),
    ];
    const s = sugerenciasDeReproceso(distribuirPorCapacidad(dosOrigenes, PAQ_CORTA, "tipo")).filter(
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
      bloque({
        id: "t1",
        m3: 1,
        tipoProducto: "Paquetería larga",
        gruposFiltro: ["tipo|Paquetería larga"],
      }),
    ];
    const d = distribuirPorCapacidad(dos, PAQ_CORTA, "tipo");
    const s = sugerenciasDeReproceso(d);
    const c = cuadreDeDistribucion(
      { faltanteM3: d.totales.faltanteM3, libreM3: d.totales.libreM3 },
      40,
      s,
    );
    // Los dos ofrecen 1 m³ para la MISMA paquetería corta: tapan 1, no 2.
    expect(c.cubreReprocesoM3).toBe(1);
    expect(c.faltaM3).toBeCloseTo(d.totales.faltanteM3, 3);
    expect(c.quedaM3).toBeCloseTo(d.totales.faltanteM3 - 1, 3);
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

  it("lo que ampara de su MISMO tipo trae sus escuadrías (la fila «comercial → comercial»)", () => {
    /* Brandon 2026-09-09: «poné ahí también cuando comercial se reprocesó en sí
       mismo». Sin las medidas, esa fila es un total que no se puede ir a buscar
       al patio — y la tabla no cierra contra el m³ del bloque. */
    const comercial = bloque({ id: "mismo", m3: 3.078, tipoProducto: "Comercial" });
    /* La aserrada tiene que traer COMERCIAL para que el bloque ampare de su
       propio tipo: con sólo paquetería, «comercial → comercial» no existe. */
    const conComercial = [...variado, piezaComercial("vc", 5)];
    const [g] = agruparPorOrigen(
      sugerenciasDeReproceso(distribuirPorCapacidad([comercial], conComercial, "tipo")),
    );
    expect(g.mismoTipoM3).toBeGreaterThan(0);
    expect(g.mismoTipoMedidas.length).toBeGreaterThan(0);
    const m3 = g.mismoTipoMedidas.reduce((a, m) => a + m.m3, 0);
    const piezas = g.mismoTipoMedidas.reduce((a, m) => a + m.piezas, 0);
    expect(m3).toBeCloseTo(g.mismoTipoM3, 3);
    expect(piezas).toBe(g.mismoTipoPiezas);
    // Sin claves repetidas: una medida = una línea.
    expect(new Set(g.mismoTipoMedidas.map((m) => m.clave)).size).toBe(g.mismoTipoMedidas.length);
  });

  it("un bloque de ROLLIZA no mezcla m³ (R) con m³ (A): la cuenta va contra la capacidad", () => {
    /* Bug visto en pantalla (2026-09-09): un bloque de rolliza de 3 m³ al 55 %
       amparaba sus 1.650 m³ enteros y el pie igual anunciaba «quedan 1.351 m³
       sin amparar» — restaba troza menos aserrada. Con la capacidad de por
       medio, un bloque lleno dice que no queda nada. */
    const troza = bloque({
      id: "roll", etiqueta: "TROZA 001", m3: 3, tipo: "rolliza",
      tipoProducto: "Comercial", aprovechablePct: 55,
    });
    const conComercial = [...variado, piezaComercial("rc", 5)];
    const [g] = agruparPorOrigen(
      sugerenciasDeReproceso(distribuirPorCapacidad([troza], conComercial, "tipo")),
    );
    expect(g.esRolliza).toBe(true);
    expect(g.capacidadM3).toBeCloseTo(1.65, 3);
    expect(g.origenM3).toBe(3);
    // Todo lo que ampara sale de la CAPACIDAD, no del m³ de troza.
    expect(g.amparadoM3).toBeLessThanOrEqual(g.capacidadM3 + 0.001);
    expect(g.quedaM3).toBeCloseTo(Math.max(0, g.capacidadM3 - g.amparadoM3), 3);
    expect(g.quedaM3).toBeLessThan(3 - g.amparadoM3); // ya no es la resta contra la troza
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
