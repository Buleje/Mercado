import { describe, expect, it } from "vitest";
import {
  armarCadena,
  consumosDeCorrida,
  estadoDelLibro,
  guiaDelCodigo,
  mapaCodigoAGuia,
  normalizarLote,
  origenesDelDespacho,
  repartirConsumos,
  seResuelveAlImportar,
} from "@/lib/forestal/ctp-cadena-import";

/** Una fila ya parseada, como sale del lector del archivo. */
const f = (datos: Record<string, unknown>, problemas: string[] = []) =>
  ({ fila: 7, datos, problemas }) as never;

describe("normalizarLote", () => {
  it("el mismo lote escrito de tres formas es uno solo", () => {
    // Si «09-2026» y «9-2026» quedan separados, la corrida se parte en dos y
    // cada mitad denuncia a la otra: una sin consumo, la otra sin producción.
    expect(normalizarLote("9-2026")).toBe("9-2026");
    expect(normalizarLote("09-2026")).toBe("9-2026");
    expect(normalizarLote(" 9 - 2026 ")).toBe("9-2026");
  });

  it("los lotes REALES del libro son «001», «002»: los ceros no crean lotes nuevos", () => {
    // Es el formato que usa el libro de verdad. Si «001» y «1» quedan separados,
    // el consumo va a una corrida y la producción a otra.
    expect(normalizarLote("001")).toBe("1");
    expect(normalizarLote("01")).toBe("1");
    expect(normalizarLote("1")).toBe("1");
    expect(normalizarLote("005")).toBe("5");
    expect(normalizarLote("010")).toBe("10");
  });

  it("«-» y «null» del libro NO son un lote: crean una corrida fantasma", () => {
    // En Salidas la mayoría de las filas traen «-». Tomarlo como texto juntaba
    // despachos que no tienen nada que ver en una corrida inventada.
    expect(normalizarLote("-")).toBe("");
    expect(normalizarLote("--")).toBe("");
    expect(normalizarLote("null")).toBe("");
    expect(normalizarLote("N/A")).toBe("");
  });

  it("un lote con texto se deja intacto: fundirlos sería inventar", () => {
    expect(normalizarLote("CUM R 01/30")).toBe("CUMR01/30");
  });

  it("un lote que no sigue el patrón se respeta tal cual", () => {
    // No inventamos: si el operador usa «LOTE-A», ese es su lote.
    expect(normalizarLote("LOTE-A")).toBe("LOTE-A");
    expect(normalizarLote("")).toBe("");
    expect(normalizarLote(null)).toBe("");
  });
});

describe("armarCadena · el lote enlaza las tres secciones", () => {
  it("consumo, producción y salida del mismo lote arman UNA corrida", () => {
    const plan = armarCadena({
      consumos: [f({ codigoOrigen: "3012263", especieComun: "Copaiba", cantidad: 3.0, lote: "9-2026" })],
      produccion: [f({ tipoProducto: "MADERA ASERRADA", especieComun: "Copaiba", cantidad: 1.5, lote: "9-2026" })],
      salidas: [f({ numeroDocumento: "19-001-51", tipoProducto: "MADERA ASERRADA", cantidad: 1.5, lote: "9-2026" })],
    });

    expect(plan.corridas).toHaveLength(1);
    const [c] = plan.corridas;
    expect(c).toMatchObject({ lote: "9-2026", entradaM3: 3.0, salidaProducidaM3: 1.5, despachadoM3: 1.5 });
    expect(c.rendimientoPct).toBe(50);
    expect(plan.avisos).toEqual([]);
  });

  it("«09-2026» y «9-2026» caen en la misma corrida", () => {
    const plan = armarCadena({
      consumos: [f({ codigoOrigen: "A", cantidad: 2, lote: "09-2026" })],
      produccion: [f({ tipoProducto: "MA", cantidad: 1, lote: "9-2026" })],
    });
    expect(plan.corridas).toHaveLength(1);
    expect(plan.corridas[0].rendimientoPct).toBe(50);
  });

  it("varias trozas al mismo lote suman una sola entrada", () => {
    const plan = armarCadena({
      consumos: [
        f({ codigoOrigen: "3012263", cantidad: 1.5, lote: "9-2026" }),
        f({ codigoOrigen: "3012264", cantidad: 2.5, lote: "9-2026" }),
      ],
      produccion: [f({ tipoProducto: "MA", cantidad: 2, lote: "9-2026" })],
    });
    expect(plan.corridas[0].entradaM3).toBe(4);
    expect(plan.corridas[0].consumos).toHaveLength(2);
    expect(plan.corridas[0].rendimientoPct).toBe(50);
  });

  it("lotes distintos son corridas distintas, ordenadas por número", () => {
    const plan = armarCadena({
      consumos: [
        f({ codigoOrigen: "A", cantidad: 1, lote: "10-2026" }),
        f({ codigoOrigen: "B", cantidad: 1, lote: "2-2026" }),
      ],
    });
    // Orden natural: 2 antes que 10. Con orden alfabético «10» iría primero.
    expect(plan.corridas.map((c) => c.lote)).toEqual(["2-2026", "10-2026"]);
  });
});

describe("armarCadena · los avisos son los hallazgos de un fiscalizador", () => {
  it("producir sin consumo declarado es un error, no un detalle", () => {
    const plan = armarCadena({ produccion: [f({ tipoProducto: "MA", cantidad: 5, lote: "9-2026" })] });
    expect(plan.corridas[0].rendimientoPct).toBeNull();
    expect(plan.avisos).toContainEqual(
      expect.objectContaining({ lote: "9-2026", nivel: "error", mensaje: expect.stringContaining("sin consumo") }),
    );
  });

  it("una milésima de diferencia NO es romper I3: es redondeo", () => {
    // Medido en el libro real: 7 lotes daban «rompe I3» por 0.001-0.002 m³ de
    // sumar cientos de filas con 3 decimales. Siete rojos falsos enseñan a
    // ignorar la lista donde tiene que estar la atención.
    const plan = armarCadena({
      consumos: [f({ codigoOrigen: "A", cantidad: 40, lote: "1" })],
      produccion: [f({ tipoProducto: "MA", cantidad: 22.473, lote: "1" })],
      salidas: [f({ numeroDocumento: "G-1", cantidad: 22.474, lote: "1" })],
    });
    expect(plan.avisos.filter((a) => a.mensaje.includes("I3"))).toEqual([]);
  });

  it("un desvío REAL sí se avisa: no es de milésimas", () => {
    const plan = armarCadena({
      consumos: [f({ codigoOrigen: "A", cantidad: 40, lote: "1" })],
      produccion: [f({ tipoProducto: "MA", cantidad: 22.4, lote: "1" })],
      salidas: [f({ numeroDocumento: "G-1", cantidad: 25, lote: "1" })],
    });
    expect(plan.avisos.some((a) => a.mensaje.includes("I3"))).toBe(true);
  });

  it("despachar más de lo producido rompe I3 y se avisa antes de escribir", () => {
    const plan = armarCadena({
      consumos: [f({ codigoOrigen: "A", cantidad: 10, lote: "9-2026" })],
      produccion: [f({ tipoProducto: "MA", cantidad: 4, lote: "9-2026" })],
      salidas: [f({ numeroDocumento: "G-1", cantidad: 6, lote: "9-2026" })],
    });
    expect(plan.avisos).toContainEqual(
      expect.objectContaining({ nivel: "error", mensaje: expect.stringContaining("sólo produjo 4") }),
    );
  });

  it("despachar sin producción declarada también rompe I3", () => {
    const plan = armarCadena({ salidas: [f({ numeroDocumento: "G-1", cantidad: 2, lote: "9-2026" })] });
    expect(plan.avisos.some((a) => a.nivel === "error" && a.mensaje.includes("I3"))).toBe(true);
  });

  it("rendimiento sobre 100% es imposible: sale más de lo que entró", () => {
    const plan = armarCadena({
      consumos: [f({ codigoOrigen: "A", cantidad: 1, lote: "9-2026" })],
      produccion: [f({ tipoProducto: "MA", cantidad: 2, lote: "9-2026" })],
    });
    expect(plan.corridas[0].rendimientoPct).toBe(200);
    expect(plan.avisos).toContainEqual(
      expect.objectContaining({ nivel: "error", mensaje: expect.stringContaining("más de lo que consume") }),
    );
  });

  it("un rendimiento muy bajo avisa, pero no bloquea: puede faltar cargar producción", () => {
    const plan = armarCadena({
      consumos: [f({ codigoOrigen: "A", cantidad: 10, lote: "9-2026" })],
      produccion: [f({ tipoProducto: "MA", cantidad: 1, lote: "9-2026" })],
    });
    expect(plan.avisos).toContainEqual(expect.objectContaining({ nivel: "aviso" }));
    expect(plan.avisos.every((a) => a.nivel !== "error")).toBe(true);
  });

  it("un rendimiento normal de aserradero no molesta con avisos", () => {
    const plan = armarCadena({
      consumos: [f({ codigoOrigen: "A", cantidad: 10, lote: "9-2026" })],
      produccion: [f({ tipoProducto: "MA", cantidad: 5, lote: "9-2026" })],
    });
    expect(plan.corridas[0].rendimientoPct).toBe(50);
    expect(plan.avisos).toEqual([]);
  });
});

describe("armarCadena · lo que no se puede enlazar no se inventa", () => {
  it("un consumo sin lote queda suelto y se reporta", () => {
    const plan = armarCadena({ consumos: [f({ codigoOrigen: "3012263", cantidad: 1 })] });
    expect(plan.corridas).toHaveLength(0);
    expect(plan.sueltos.consumos).toHaveLength(1);
    expect(plan.avisos).toContainEqual(expect.objectContaining({ nivel: "aviso", lote: "—" }));
  });

  it("las filas con problemas no entran: contaminarían el rendimiento", () => {
    // Una fila cuyo volumen no se pudo leer entraría como 0 y hundiría el
    // rendimiento de la corrida con un número que nadie declaró.
    const plan = armarCadena({
      consumos: [
        f({ codigoOrigen: "A", cantidad: 4, lote: "9-2026" }),
        f({ codigoOrigen: "B", cantidad: 0, lote: "9-2026" }, ["Falta Cantidad"]),
      ],
      produccion: [f({ tipoProducto: "MA", cantidad: 2, lote: "9-2026" })],
    });
    expect(plan.corridas[0].entradaM3).toBe(4);
    expect(plan.corridas[0].rendimientoPct).toBe(50);
  });

  it("un libro vacío no rompe", () => {
    expect(armarCadena({})).toMatchObject({ corridas: [], avisos: [] });
  });
});

describe("mapaCodigoAGuia · el código de troza lleva a su guía de ingreso", () => {
  const ingresos = [
    f({ numeroDocumento: "019-0000002", codigoCtp: "3012263", cantidad: 3.01 }),
    f({ numeroDocumento: "019-0000007", codigoCtp: "3012264", cantidad: 5.0 }),
  ];

  it("arma el puente con las dos columnas del mismo archivo", () => {
    expect(mapaCodigoAGuia(ingresos).get("3012263")).toBe("019-0000002");
  });

  it("un retrozo hereda la guía de su troza madre", () => {
    // Cortar una troza no le cambia el origen legal: 3012263/A entró con la
    // misma GTF que 3012263.
    expect(guiaDelCodigo("3012263/A", mapaCodigoAGuia(ingresos))).toBe("019-0000002");
    expect(guiaDelCodigo("3012263-B", mapaCodigoAGuia(ingresos))).toBe("019-0000002");
  });

  it("un código con guión adentro resuelve a su madre, no al primer trozo", () => {
    // `R7-900/A`.split(/[/-]/)[0] daba «R7»: cualquier código con un guión
    // quedaba sin resolver y la corrida entraba con cero consumos.
    const m = mapaCodigoAGuia([f({ numeroDocumento: "GTF-R7", codigoCtp: "R7-900", cantidad: 12 })]);
    expect(guiaDelCodigo("R7-900/A", m)).toBe("GTF-R7");
    expect(guiaDelCodigo("R7-900", m)).toBe("GTF-R7");
  });

  it("un código que no está en el libro no resuelve: no se adivina", () => {
    expect(guiaDelCodigo("9999999", mapaCodigoAGuia(ingresos))).toBeNull();
    expect(guiaDelCodigo("", mapaCodigoAGuia(ingresos))).toBeNull();
  });

  it("si dos ingresos declaran el mismo código, gana el primero", () => {
    // Pisar el mapa escondería un libro que ya está mal.
    const m = mapaCodigoAGuia([
      f({ numeroDocumento: "G-1", codigoCtp: "X" }),
      f({ numeroDocumento: "G-2", codigoCtp: "X" }),
    ]);
    expect(m.get("X")).toBe("G-1");
  });
});

describe("consumosDeCorrida · de códigos de troza a atribución por guía", () => {
  const mapa = mapaCodigoAGuia([
    f({ numeroDocumento: "G-1", codigoCtp: "100" }),
    f({ numeroDocumento: "G-2", codigoCtp: "200" }),
  ]);

  it("suma por guía: tres trozas de la misma GTF son un consumo", () => {
    const [c] = armarCadena({
      consumos: [
        f({ codigoOrigen: "100", cantidad: 1.5, lote: "9-2026" }),
        f({ codigoOrigen: "100/A", cantidad: 0.5, lote: "9-2026" }),
        f({ codigoOrigen: "200", cantidad: 2.0, lote: "9-2026" }),
      ],
    }).corridas;

    const r = consumosDeCorrida(c, mapa);
    expect(r.atribuidos).toEqual([
      { gtfIngreso: "G-1", volumeM3: 2.0 },
      { gtfIngreso: "G-2", volumeM3: 2.0 },
    ]);
    expect(r.sinResolver).toEqual([]);
  });

  it("lo que no resuelve se reporta, no se descarta en silencio", () => {
    const [c] = armarCadena({ consumos: [f({ codigoOrigen: "999", cantidad: 1, lote: "9-2026" })] }).corridas;
    const r = consumosDeCorrida(c, mapa);
    expect(r.atribuidos).toEqual([]);
    expect(r.sinResolver).toEqual(["999"]);
  });
});

describe("repartirConsumos · la misma madera no se cuenta dos veces", () => {
  it("una sola producción se lleva todo el consumo", () => {
    const r = repartirConsumos([{ gtfIngreso: "G-1", volumeM3: 10 }], [{ cantidad: 5 }]);
    expect(r).toEqual([[{ gtfIngreso: "G-1", volumeM3: 10 }]]);
  });

  it("dos productos del mismo lote reparten a prorrata de lo producido", () => {
    // 10 m³ consumidos, 3 de tablas y 1 de tablillas → 7.5 y 2.5.
    const r = repartirConsumos([{ gtfIngreso: "G-1", volumeM3: 10 }], [{ cantidad: 3 }, { cantidad: 1 }]);
    expect(r[0]).toEqual([{ gtfIngreso: "G-1", volumeM3: 7.5 }]);
    expect(r[1]).toEqual([{ gtfIngreso: "G-1", volumeM3: 2.5 }]);
  });

  it("la suma de las partes es EXACTAMENTE el consumo, sin m³ fantasma", () => {
    // Tres tercios de 10 dan 3.3333 × 3 = 9.9999: falta un m³ que nadie
    // consumió y la corrida quedaría con un hueco sin atribuir.
    const r = repartirConsumos([{ gtfIngreso: "G-1", volumeM3: 10 }], [{ cantidad: 1 }, { cantidad: 1 }, { cantidad: 1 }]);
    const total = r.flat().reduce((s, c) => s + c.volumeM3, 0);
    expect(Math.round(total * 10_000) / 10_000).toBe(10);
  });

  it("NUNCA reparte más de lo consumido: eso rompería I1 e I2", () => {
    const consumo = [{ gtfIngreso: "G-1", volumeM3: 4 }, { gtfIngreso: "G-2", volumeM3: 6 }];
    const r = repartirConsumos(consumo, [{ cantidad: 2 }, { cantidad: 3 }, { cantidad: 5 }]);
    for (const gtf of ["G-1", "G-2"]) {
      const suma = r.flat().filter((c) => c.gtfIngreso === gtf).reduce((s, c) => s + c.volumeM3, 0);
      const declarado = consumo.find((c) => c.gtfIngreso === gtf)!.volumeM3;
      expect(Math.round(suma * 10_000) / 10_000).toBeLessThanOrEqual(declarado);
    }
  });

  it("sin producción no hay a quién repartirle", () => {
    expect(repartirConsumos([{ gtfIngreso: "G-1", volumeM3: 10 }], [])).toEqual([]);
  });

  it("producciones en cero reparten en partes iguales antes que perder el consumo", () => {
    const r = repartirConsumos([{ gtfIngreso: "G-1", volumeM3: 10 }], [{ cantidad: 0 }, { cantidad: 0 }]);
    const total = r.flat().reduce((s, c) => s + c.volumeM3, 0);
    expect(total).toBe(10);
  });
});

describe("estadoDelLibro · el estado del aserradero sale de las cuatro secciones", () => {
  it("calcula patio y depósito con la fórmula del libro", () => {
    const e = estadoDelLibro({
      ingresos: [f({ cantidad: 10 }), f({ cantidad: 5 })],
      consumos: [f({ cantidad: 6, lote: "9-2026" })],
      produccion: [f({ cantidad: 3, lote: "9-2026" })],
      salidas: [f({ cantidad: 1, lote: "9-2026" })],
    });
    expect(e).toMatchObject({
      ingresadoM3: 15,
      consumidoM3: 6,
      enPatioM3: 9, // 15 − 6: lo que sigue en el patio
      producidoM3: 3,
      despachadoM3: 1,
      enDepositoM3: 2, // 3 − 1: producto terminado sin despachar
      rendimientoPct: 50,
      lotes: 1,
    });
  });

  it("las trozas revendidas salen del PATIO, no del depósito", () => {
    // El libro pone todas las salidas juntas, pero una troza revendida entera
    // nunca pasó por la sierra. Contarla como producto infla la aserrada con
    // madera que salió como entró: en el libro real son 222.968 m³.
    const e = estadoDelLibro({
      ingresos: [f({ cantidad: 20 })],
      consumos: [f({ cantidad: 8 })],
      produccion: [f({ cantidad: 5 })],
      salidas: [
        f({ cantidad: 6, tipoProducto: "MADERA EN ROLLO" }),
        f({ cantidad: 3, tipoProducto: "MADERA ASERRADA (COMERCIAL)" }),
      ],
    });
    expect(e.salidaRollizaM3).toBe(6);
    expect(e.despachadoM3).toBe(3); // sólo la aserrada
    expect(e.enPatioM3).toBe(6); // 20 − 8 consumidos − 6 revendidos
    expect(e.enDepositoM3).toBe(2); // 5 producidos − 3 despachados
  });

  it("las salidas C/I NO son despachos: son consumo interno", () => {
    // En el libro real son 516 de 771 filas (423 m³). Contarlas como despacho
    // infla la salida comercial en dos tercios.
    const e = estadoDelLibro({
      produccion: [f({ cantidad: 10 })],
      salidas: [f({ cantidad: 3 }), f({ cantidad: 4, observaciones: "C/I: Consumo Interno" })],
    });
    expect(e.despachadoM3).toBe(3);
    expect(e.consumoInternoM3).toBe(4);
    // Las dos vacían el depósito: 10 − 3 − 4.
    expect(e.enDepositoM3).toBe(3);
  });

  it("calcula la apertura que el libro necesita para no quedar en negativo", () => {
    // Un libro que arranca a mitad despacha producto aserrado antes: acá sale
    // 5 el día 1 y recién el día 2 se produce 3. Sin 5 de apertura, no cierra.
    const e = estadoDelLibro({
      produccion: [f({ cantidad: 3, fecha: "2024-06-06" })],
      salidas: [f({ cantidad: 5, fecha: "2024-05-17" })],
    });
    expect(e.aperturaNecesariaM3).toBe(5);
  });

  it("un libro que arranca en cero no necesita apertura", () => {
    const e = estadoDelLibro({
      produccion: [f({ cantidad: 10, fecha: "2024-06-01" })],
      salidas: [f({ cantidad: 4, fecha: "2024-06-05" })],
    });
    expect(e.aperturaNecesariaM3).toBe(0);
    expect(e.enDepositoM3).toBe(6);
  });

  it("el consumo interno también consume la apertura", () => {
    const e = estadoDelLibro({
      salidas: [f({ cantidad: 2, fecha: "2024-05-01", observaciones: "C/I" })],
    });
    expect(e.aperturaNecesariaM3).toBe(2);
  });

  it("un patio negativo se MUESTRA: es el hallazgo, no un error a esconder", () => {
    // Consumir más de lo que ingresó es exactamente lo que la invariante I2
    // previene. Recortarlo a 0 dejaría el libro «cuadrado» y sin evidencia.
    const e = estadoDelLibro({ ingresos: [f({ cantidad: 2 })], consumos: [f({ cantidad: 5 })] });
    expect(e.enPatioM3).toBe(-3);
  });

  it("sin consumo no hay rendimiento: 0% se leería como que no rindió", () => {
    const e = estadoDelLibro({ ingresos: [f({ cantidad: 10 })] });
    expect(e.rendimientoPct).toBeNull();
  });

  it("no arrastra el error del punto flotante", () => {
    const e = estadoDelLibro({ ingresos: [f({ cantidad: 0.1 }), f({ cantidad: 0.2 })] });
    expect(e.ingresadoM3).toBe(0.3);
  });

  it("cuenta los lotes distintos una sola vez", () => {
    const e = estadoDelLibro({
      consumos: [f({ cantidad: 1, lote: "9-2026" })],
      produccion: [f({ cantidad: 1, lote: "09-2026" })],
      salidas: [f({ cantidad: 1, lote: "10-2026" })],
    });
    expect(e.lotes).toBe(2);
  });
});

describe("seResuelveAlImportar · el preview no debe asustar con errores falsos", () => {
  const mapa = mapaCodigoAGuia([f({ numeroDocumento: "019-0000004", codigoCtp: "3036392", cantidad: 3.896 })]);

  it("«falta el ingreso» es mentira si el ingreso viene en el mismo archivo", () => {
    // El preview no escribe: mira los consumos cuando los ingresos todavía no
    // existen. Al importar de verdad van primero y el consumo los encuentra.
    expect(seResuelveAlImportar("Ese código no existe en el libro: cargá primero el ingreso.", "3036392", mapa)).toBe(true);
    expect(seResuelveAlImportar("GTF de ingreso no encontrado: 019-0000004 — importá los ingresos primero", "", mapa)).toBe(true);
  });

  it("si el código NO está en el archivo, el error es de verdad", () => {
    expect(seResuelveAlImportar("Ese código no existe en el libro: cargá primero el ingreso.", "9999999", mapa)).toBe(false);
  });

  it("un error de otra cosa no se disfraza de pendiente", () => {
    expect(seResuelveAlImportar("Volumen fuera de rango", "3036392", mapa)).toBe(false);
    expect(seResuelveAlImportar("Sin especie", "3036392", mapa)).toBe(false);
  });
});

describe("origenesDelDespacho · la salida se atribuye a la corrida de su lote", () => {
  it("una sola corrida respalda todo el despacho", () => {
    expect(origenesDelDespacho(3, [{ id: "c1", cantidad: 5 }])).toEqual([{ produccionEntryId: "c1", quantity: 3 }]);
  });

  it("varias corridas del lote reparten a prorrata de lo que produjo cada una", () => {
    const r = origenesDelDespacho(4, [{ id: "c1", cantidad: 6 }, { id: "c2", cantidad: 2 }]);
    expect(r).toEqual([
      { produccionEntryId: "c1", quantity: 3 },
      { produccionEntryId: "c2", quantity: 1 },
    ]);
  });

  it("NUNCA atribuye más de lo que la corrida produjo (I5)", () => {
    const r = origenesDelDespacho(10, [{ id: "c1", cantidad: 2 }, { id: "c2", cantidad: 3 }]);
    expect(r.find((o) => o.produccionEntryId === "c1")!.quantity).toBeLessThanOrEqual(2);
    expect(r.find((o) => o.produccionEntryId === "c2")!.quantity).toBeLessThanOrEqual(3);
  });

  it("despachar más de lo producido deja el faltante SIN atribuir, no lo fuerza", () => {
    // Forzar el cuadre inventaría el origen que la invariante I5 protege.
    const r = origenesDelDespacho(10, [{ id: "c1", cantidad: 4 }]);
    const suma = r.reduce((s, o) => s + o.quantity, 0);
    expect(suma).toBe(4);
    expect(suma).toBeLessThan(10);
  });

  it("la suma nunca supera lo despachado", () => {
    const r = origenesDelDespacho(5, [{ id: "a", cantidad: 10 }, { id: "b", cantidad: 10 }]);
    expect(r.reduce((s, o) => s + o.quantity, 0)).toBeLessThanOrEqual(5);
  });

  it("sin corridas del lote no se atribuye nada: queda para el operador", () => {
    expect(origenesDelDespacho(5, [])).toEqual([]);
    expect(origenesDelDespacho(0, [{ id: "c1", cantidad: 5 }])).toEqual([]);
  });
});
