import { describe, it, expect } from "vitest";
import {
  agruparPorGuia,
  avisosSeleccion,
  bloquesDeGuiaDe,
  estaDisponible,
  filtrarTrozas,
  motivoBloqueo,
  totalesSeleccion,
  type TrozaConsumible,
  cuposDeGuia,
  motivosDeCupo,
} from "@/lib/forestal/consumo-trozas";

/**
 * ADR-326 — elegir QUÉ PIEZAS entran a la sierra.
 *
 * El consumo del libro sigue siendo m³ por guía (ahí viven I1-I6). Lo que se
 * testea acá es lo que decide qué se puede tildar y cómo se deriva el volumen:
 * un fiscalizador no cuenta metros cúbicos abstractos, cuenta piezas.
 */

const troza = (over: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: "t1",
  woodEntryId: "w1",
  codificacion: "52/A",
  codigoPlanta: "118",
  especieComun: "Tornillo",
  volumenM3: 3,
  gtfNumber: "001-0000120",
  proveedor: "Maderera El Aguajal SAC",
  ...over,
});

describe("qué troza se puede consumir", () => {
  it("una troza normal del patio, sí", () => {
    expect(motivoBloqueo(troza())).toBeNull();
    expect(estaDisponible(troza())).toBe(true);
  });

  it("la que ya se comió otra corrida, no", () => {
    expect(motivoBloqueo(troza({ consumidaEnId: "c9" }))).toBe("ya_consumida");
  });

  it("la que nunca llegó al patio, no (ADR-325)", () => {
    expect(motivoBloqueo(troza({ noRecepcionada: true }))).toBe("no_recepcionada");
  });

  it("el descarte del retrozado, no: ocupa volumen pero no es producto", () => {
    expect(motivoBloqueo(troza({ descarte: true }))).toBe("descarte");
  });

  it("la MADRE partida en pedazos, no: van los pedazos", () => {
    // Consumir la madre Y sus pedazos contaría la misma madera dos veces.
    expect(motivoBloqueo(troza({ retrozos: 2 }))).toBe("madre_retrozada");
    // El pedazo sí se puede.
    expect(motivoBloqueo(troza({ id: "p1", trozaOrigenId: "t1", volumenM3: 1.8 }))).toBeNull();
  });

  it("sin volumen registrado, no: no habría qué atribuir", () => {
    expect(motivoBloqueo(troza({ volumenM3: null }))).toBe("sin_volumen");
    expect(motivoBloqueo(troza({ volumenM3: 0 }))).toBe("sin_volumen");
  });
});

describe("filtros de la tabla", () => {
  const lista = [
    troza({ id: "a", codificacion: "52/A", codigoPlanta: "118", especieComun: "Tornillo" }),
    troza({ id: "b", codificacion: "13/C", codigoPlanta: "204", especieComun: "Copaiba", gtfNumber: "019-0000003" }),
    troza({ id: "c", codificacion: "77/B", codigoPlanta: "310", especieComun: "Tornillo", consumidaEnId: "c9" }),
  ];

  it("busca por la codificación del bosque y por la que marcó el patio", () => {
    expect(filtrarTrozas(lista, { texto: "52/A" }).map((t) => t.id)).toEqual(["a"]);
    // 204 es el código pintado en la testa: en planta se pregunta por ese.
    expect(filtrarTrozas(lista, { texto: "204" }).map((t) => t.id)).toEqual(["b"]);
  });

  it("ignora tildes y mayúsculas", () => {
    const conTilde = [troza({ id: "x", especieComun: "Marupá" })];
    expect(filtrarTrozas(conTilde, { texto: "MARUPA" })).toHaveLength(1);
  });

  it("filtra por especie y por guía", () => {
    expect(filtrarTrozas(lista, { especie: "Tornillo" }).map((t) => t.id)).toEqual(["a", "c"]);
    expect(filtrarTrozas(lista, { gtf: "019-0000003" }).map((t) => t.id)).toEqual(["b"]);
  });

  it("«sólo disponibles» esconde las bloqueadas", () => {
    expect(filtrarTrozas(lista, { soloDisponibles: true }).map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("totales de la selección", () => {
  it("suma piezas, m³ y pie tablar", () => {
    const t = totalesSeleccion([troza({ id: "a", volumenM3: 3 }), troza({ id: "b", volumenM3: 2 })]);
    expect(t.piezas).toBe(2);
    expect(t.volumenM3).toBe(5);
    // 1 m³ = 424 pt, el mismo factor del cubicador (PT_POR_M3).
    expect(t.pieTablar).toBe(Math.round(5 * 424));
    expect(t.guias).toBe(1);
    expect(t.especies).toBe(1);
  });

  it("cuenta guías y especies distintas", () => {
    const t = totalesSeleccion([
      troza({ id: "a", woodEntryId: "w1", especieComun: "Tornillo" }),
      troza({ id: "b", woodEntryId: "w2", especieComun: "Copaiba" }),
    ]);
    expect(t.guias).toBe(2);
    expect(t.especies).toBe(2);
  });
});

describe("de las piezas al consumo por guía", () => {
  it("agrupa y deriva el volumen — nadie tipea un número que no cuadre", () => {
    const g = agruparPorGuia([
      troza({ id: "a", woodEntryId: "w1", volumenM3: 3 }),
      troza({ id: "b", woodEntryId: "w1", volumenM3: 2.5 }),
      troza({ id: "c", woodEntryId: "w2", volumenM3: 1, gtfNumber: "019-0000003" }),
    ]);
    expect(g).toHaveLength(2);
    // Ordenado por volumen: la guía que más aporta va primero.
    expect(g[0].woodEntryId).toBe("w1");
    expect(g[0].piezas).toBe(2);
    expect(g[0].volumenM3).toBe(5.5);
    expect(g[0].trozaIds).toEqual(["a", "b"]);
    expect(g[1].volumenM3).toBe(1);
  });

  it("sin selección no hay consumo", () => {
    expect(agruparPorGuia([])).toEqual([]);
  });
});

describe("avisos de la selección", () => {
  it("avisa que mezclar especies rompe la comparación del rendimiento", () => {
    const avisos = avisosSeleccion([
      troza({ id: "a", especieComun: "Tornillo" }),
      troza({ id: "b", especieComun: "Copaiba" }),
    ]);
    expect(avisos.join(" ")).toMatch(/mezcla 2 especies/);
  });

  it("avisa cuando el consumo se reparte entre varias guías", () => {
    const avisos = avisosSeleccion([
      troza({ id: "a", woodEntryId: "w1" }),
      troza({ id: "b", woodEntryId: "w2" }),
    ]);
    expect(avisos.join(" ")).toMatch(/2 guías distintas/);
  });

  it("una corrida de una especie y una guía no genera ruido", () => {
    expect(avisosSeleccion([troza({ id: "a" }), troza({ id: "b" })])).toEqual([]);
  });
});

/**
 * Regresión (auditoría adversarial 2026-08-01): anular una corrida devuelve sus
 * piezas al patio.
 *
 * El bug original dejaba `consumidaEnId` apuntando a una corrida anulada, así
 * que la troza quedaba bloqueada para siempre con "Ya entró a otra corrida"
 * aunque la madera estuviera ahí. El arreglo a medias fue PEOR: la pantalla la
 * mostraba libre y el servidor la rechazaba al guardar.
 *
 * Contrato: el endpoint manda `consumidaEnId: null` cuando la corrida murió, y
 * el guard del servidor mira el mismo estado. La lib pura sólo tiene que
 * respetar ese contrato.
 */
describe("corrida anulada ⇒ la pieza vuelve al patio", () => {
  it("sin corrida viva que la tome, está disponible", () => {
    // Así la sirve el endpoint tras anular la corrida que se la había comido.
    expect(motivoBloqueo(troza({ consumidaEnId: null }))).toBeNull();
  });

  it("con una corrida viva, sigue bloqueada", () => {
    expect(motivoBloqueo(troza({ consumidaEnId: "c-viva" }))).toBe("ya_consumida");
  });

  it("el filtro «sólo disponibles» la vuelve a mostrar", () => {
    const lista = [troza({ id: "a", consumidaEnId: null }), troza({ id: "b", consumidaEnId: "c-viva" })];
    expect(filtrarTrozas(lista, { soloDisponibles: true }).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("cuposDeGuia — el tope de I2, antes de firmar (ADR-353)", () => {
  const pieza = (over: Partial<TrozaConsumible>): TrozaConsumible => ({
    id: Math.random().toString(36).slice(2),
    woodEntryId: "w1",
    codificacion: "C-1",
    especieComun: "Mashonaste",
    gtfNumber: "019-0000016",
    volumenM3: 1,
    ...over,
  });

  it("suma lo pedido por guía y lo compara con lo que queda", () => {
    const [c] = cuposDeGuia([
      pieza({ volumenM3: 2.118, guiaVolumenM3: 4.161, guiaConsumidoM3: 0 }),
      pieza({ volumenM3: 6.129, guiaVolumenM3: 4.161, guiaConsumidoM3: 0 }),
    ]);
    expect(c).toMatchObject({ pedido: 8.247, declarado: 4.161, disponible: 4.161 });
    expect(c.exceso).toBeCloseTo(4.086, 3);
  });

  it("distingue «falta cupo» de «la guía no cuadra consigo misma»", () => {
    // Nada consumido y aun así se pasa → el asiento declara menos que sus piezas.
    // No es culpa de quien consume: el mensaje manda a CUADRAR la guía (ADR-353).
    const [malDeclarado] = cuposDeGuia([pieza({ volumenM3: 8.247, guiaVolumenM3: 4.161, guiaConsumidoM3: 0 })]);
    expect(malDeclarado.descuadrado).toBe(true);
    expect(motivosDeCupo([malDeclarado])[0]).toMatch(/no cuadra consigo misma/);
    expect(motivosDeCupo([malDeclarado])[0]).toMatch(/cuadrarla antes de llevar/);

    // Con consumo previo, es cupo: el arreglo es elegir menos.
    const [sinCupo] = cuposDeGuia([pieza({ volumenM3: 6, guiaVolumenM3: 10, guiaConsumidoM3: 8 })]);
    expect(sinCupo.descuadrado).toBe(false);
    expect(motivosDeCupo([sinCupo])[0]).toMatch(/Sacá 4.000 m³/);
  });

  it("un litro de redondeo NO es un exceso", () => {
    const [c] = cuposDeGuia([pieza({ volumenM3: 4.1615, guiaVolumenM3: 4.161, guiaConsumidoM3: 0 })]);
    expect(c.exceso).toBe(0);
    expect(motivosDeCupo([c])).toEqual([]);
  });

  it("sin volumen declarado no se opina: el tope lo pone el servidor", () => {
    const [c] = cuposDeGuia([pieza({ volumenM3: 99, guiaVolumenM3: null })]);
    expect(c.disponible).toBeNull();
    expect(c.exceso).toBe(0);
  });

  it("separa las guías: una que no entra no arrastra a las que sí", () => {
    const cupos = cuposDeGuia([
      pieza({ woodEntryId: "w1", gtfNumber: "A", volumenM3: 9, guiaVolumenM3: 4 }),
      pieza({ woodEntryId: "w2", gtfNumber: "B", volumenM3: 2, guiaVolumenM3: 10 }),
    ]);
    expect(cupos.filter((c) => c.exceso > 0).map((c) => c.gtfNumber)).toEqual(["A"]);
  });
});

describe("bloquesDeGuiaDe — sembrar la Distribución de rolliza desde el Libro (2026-09-01)", () => {
  it("un bloque por guía+especie, con el permiso de sus trozas", () => {
    const bloques = bloquesDeGuiaDe([
      troza({ gtfNumber: "019-001-0000011", especieComun: "Tornillo", volumenM3: 0.6, permiso: "19-SEC/REG-PLT-2018-020" }),
      troza({ gtfNumber: "019-001-0000011", especieComun: "Tornillo", volumenM3: 0.4, permiso: "19-SEC/REG-PLT-2018-020" }),
    ]);
    expect(bloques).toEqual([
      { etiqueta: "019-001-0000011", especie: "Tornillo", m3: 1, permiso: "19-SEC/REG-PLT-2018-020" },
    ]);
  });

  it("nunca funde dos permisos en un bloque, aunque compartan especie", () => {
    const bloques = bloquesDeGuiaDe([
      troza({ gtfNumber: "A", especieComun: "Tornillo", volumenM3: 5, permiso: "19-SEC/REG-PLT-2018-020" }),
      troza({ gtfNumber: "B", especieComun: "Tornillo", volumenM3: 3, permiso: "19-SEC/REG-PLT-2026-032" }),
    ]);
    expect(bloques.map((b) => b.permiso).sort()).toEqual(["19-SEC/REG-PLT-2018-020", "19-SEC/REG-PLT-2026-032"]);
  });

  it("sin permiso en la troza, el bloque queda con `null` — no con un string vacío que parezca dato", () => {
    const [b] = bloquesDeGuiaDe([troza({ permiso: undefined })]);
    expect(b.permiso).toBeNull();
  });
});
