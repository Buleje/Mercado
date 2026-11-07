/**
 * La tarifa del servicio de aserrío (ADR-412).
 *
 * Lo que se prueba es que el precio se explique solo y que nunca se cobre un
 * cero: una tarifa que no alcanza dice que no alcanza.
 */

import { describe, expect, it } from "vitest";
import {
  TARIFARIO_VACIO,
  bloquesDeCorrida,
  cotizarAserrio,
  etiquetaTramo,
  explicarPrecio,
  guardarVersion,
  normalizarTarifario,
  quitarVersion,
  revisarVersion,
  versionTarifaInputSchema,
  versionVigente,
  NOTA_BORRADOR,
  baseDelBorrador,
  borradorDeTarifa,
  tramosSugeridos,
  corridaSinPt,
  desdeHaceMeses,
  type BloqueACobrar,
  type VersionTarifa,
} from "@/lib/forestal/tarifa-aserrio";
import { claveEspecie } from "@/lib/forestal/loth-constants";

const version = (o: Partial<VersionTarifa> = {}): VersionTarifa => ({
  id: "v1",
  vigenteDesde: "2026-09-01",
  basePt: 0.3,
  especies: [],
  tipos: [],
  largos: [],
  nota: null,
  creadoPor: null,
  creadoEn: null,
  ...o,
});

const bloque = (o: Partial<BloqueACobrar> = {}): BloqueACobrar => ({
  etiqueta: "P-1",
  especie: "Tornillo",
  volumenM3: 1,
  ...o,
});

const input = (o: Record<string, unknown>) => {
  const p = versionTarifaInputSchema.safeParse({ vigenteDesde: "2026-09-01", basePt: 0.3, ...o });
  if (!p.success) throw new Error(p.error.message);
  return p.data;
};

describe("cotizarAserrio — el precio", () => {
  it("1 m³ son 424 PT y se cobran a la base general", () => {
    const c = cotizarAserrio(version(), [bloque()]);
    expect(c.pt).toBe(424);
    expect(c.importe).toBeCloseTo(127.2, 2);
    expect(c.cobrable).toBe(true);
    expect(c.lineas[0].baseDesde).toBe("general");
  });

  it("la especie con precio propio reemplaza la base, sin importar cómo se escribió", () => {
    const v = version({ especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 0.4 }] });
    const c = cotizarAserrio(v, [bloque({ especie: "TORNILLO" })]);
    expect(c.lineas[0].basePt).toBe(0.4);
    expect(c.lineas[0].baseDesde).toBe("especie");
  });

  it("el tipo sale de las medidas antes que del producto declarado", () => {
    /* 6" × 6" × 8' es paquetería larga aunque el asiento diga COMERCIAL. */
    const c = cotizarAserrio(version(), [
      bloque({ espesorCm: 15.24, anchoCm: 15.24, largoM: 2.44, productType: "MADERA ASERRADA (COMERCIAL)" }),
    ]);
    expect(c.lineas[0].tipo).toBe("Paquetería larga");
    expect(c.lineas[0].tipoDesde).toBe("medidas");
  });

  it("sin medidas, el tipo sale del producto (27 de 33 paquetes reales no tienen medidas)", () => {
    const v = version({ tipos: [{ tipo: "Comercial", ajustePt: 0.05 }] });
    const c = cotizarAserrio(v, [bloque({ productType: "MADERA ASERRADA (COMERCIAL)" })]);
    expect(c.lineas[0].tipo).toBe("Comercial");
    expect(c.lineas[0].tipoDesde).toBe("producto");
    expect(c.lineas[0].precioPt).toBeCloseTo(0.35, 4);
  });

  it("el tramo de largo incluye su comienzo y no su final", () => {
    const v = version({
      largos: [
        { desdePies: 8, hastaPies: 12, ajustePt: 0.02 },
        { desdePies: 12, hastaPies: null, ajustePt: 0.05 },
      ],
    });
    const c = cotizarAserrio(v, [bloque({ etiqueta: "doce", largoM: 3.6576 }), bloque({ etiqueta: "ocho", largoM: 2.44 })]);
    expect(c.lineas[0].ajusteLargoPt).toBe(0.05);
    expect(c.lineas[0].tramo).toBe("12 pies o más");
    expect(c.lineas[1].ajusteLargoPt).toBe(0.02);
    expect(c.lineas[1].tramo).toBe("de 8 a 12 pies");
  });

  it("el precio a mano manda y no lleva ajustes: es un trato, no una tabla", () => {
    const v = version({ tipos: [{ tipo: "Comercial", ajustePt: 0.05 }] });
    const c = cotizarAserrio(v, [bloque({ productType: "MADERA ASERRADA (COMERCIAL)" })], { precioManualPt: 0.5 });
    expect(c.manual).toBe(true);
    expect(c.versionId).toBeNull();
    expect(c.lineas[0].precioPt).toBe(0.5);
    expect(c.lineas[0].ajusteTipoPt).toBe(0);
  });

  it("también se cobra a mano cuando no hay tarifa", () => {
    const c = cotizarAserrio(null, [bloque()], { precioManualPt: 0.3 });
    expect(c.cobrable).toBe(true);
    expect(c.importe).toBeCloseTo(127.2, 2);
  });
});

describe("cotizarAserrio — nunca un cero que parezca cobro", () => {
  it("sin tarifa y sin precio a mano no es cobrable y lo dice", () => {
    const c = cotizarAserrio(null, [bloque()]);
    expect(c.cobrable).toBe(false);
    expect(c.importe).toBe(0);
    expect(c.avisos.join(" ")).toContain("tarifa");
  });

  it("un ajuste negativo baja el precio pero no lo vuelve plata a favor", () => {
    const v = version({ basePt: 0.02, tipos: [{ tipo: "Corta", ajustePt: -0.05 }] });
    const c = cotizarAserrio(v, [bloque({ productType: "MADERA ASERRADA (CORTA)" })]);
    expect(c.lineas[0].precioPt).toBe(0);
    expect(c.cobrable).toBe(false);
  });

  it("avisa cuando hay ajuste por tipo y el paquete no dice su tipo", () => {
    const v = version({ tipos: [{ tipo: "Comercial", ajustePt: 0.05 }] });
    const c = cotizarAserrio(v, [bloque({ productType: "MADERA ASERRADA" })]);
    expect(c.lineas[0].tipo).toBeNull();
    expect(c.avisos.join(" ")).toContain("tipo");
  });

  it("avisa cuando la especie no tiene precio y la base es cero", () => {
    const v = version({ basePt: 0, especies: [{ clave: "cumala", nombre: "Cumala", precioPt: 0.3 }] });
    const c = cotizarAserrio(v, [bloque({ especie: "Tornillo" })]);
    expect(c.avisos.join(" ")).toContain("Tornillo no tiene precio");
  });

  it("una corrida real: Tornillo comercial, 35.647 m³, 0.30 + 0.05", () => {
    const v = version({ tipos: [{ tipo: "Comercial", ajustePt: 0.05 }] });
    const bs = bloquesDeCorrida(
      { lineNo: 18, speciesCommon: "Tornillo", productType: "MADERA ASERRADA (COMERCIAL)", quantity: 35.647 },
      [],
    );
    const c = cotizarAserrio(v, bs);
    expect(c.pt).toBeCloseTo(15114.33, 2);
    expect(c.importe).toBeCloseTo(5290.02, 1);
  });
});

describe("versiones de la tarifa", () => {
  const a = version({ id: "a", vigenteDesde: "2026-08-01" });
  const b = version({ id: "b", vigenteDesde: "2026-09-01" });
  const t = { versiones: [b, a] };

  it("rige la última que empezó antes o ese mismo día", () => {
    expect(versionVigente(t, "2026-08-20")?.id).toBe("a");
    expect(versionVigente(t, "2026-09-01T05:00:00.000Z")?.id).toBe("b");
    expect(versionVigente(t, "2026-07-01")).toBeNull();
    expect(versionVigente(t, "no es fecha")).toBeNull();
  });

  it("guardar el mismo día corrige la tarifa de ese día", () => {
    const r = guardarVersion({ versiones: [a] }, version({ id: "c", vigenteDesde: "2026-08-01", basePt: 0.4 }));
    expect(r.versiones.map((v) => v.id)).toEqual(["c"]);
  });

  it("quedan ordenadas por vigencia y se pueden quitar", () => {
    const r = guardarVersion({ versiones: [b] }, a);
    expect(r.versiones.map((v) => v.id)).toEqual(["a", "b"]);
    expect(quitarVersion(r, "a").versiones.map((v) => v.id)).toEqual(["b"]);
  });
});

describe("revisarVersion", () => {
  it("coerciona lo que llega del formulario", () => {
    const r = revisarVersion(input({ basePt: "0.30" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.version.basePt).toBe(0.3);
  });

  it("una especie tiene un solo precio", () => {
    const r = revisarVersion(input({ especies: [{ nombre: "Tornillo", precioPt: 0.3 }, { nombre: "TORNILLO", precioPt: 0.4 }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("dos veces");
  });

  it("dos tramos de largo no se pisan", () => {
    const pisados = revisarVersion(input({ largos: [{ desdePies: 0, hastaPies: 12, ajustePt: 0 }, { desdePies: 10, hastaPies: null, ajustePt: 0.03 }] }));
    expect(pisados.ok).toBe(false);
    const abierto = revisarVersion(input({ largos: [{ desdePies: 12, hastaPies: null, ajustePt: 0 }, { desdePies: 8, hastaPies: null, ajustePt: 0.03 }] }));
    expect(abierto.ok).toBe(false);
    const alReves = revisarVersion(input({ largos: [{ desdePies: 12, hastaPies: 8, ajustePt: 0 }] }));
    expect(alReves.ok).toBe(false);
    if (!alReves.ok) expect(alReves.motivo).toContain("antes de empezar");
  });

  it("sin ningún precio no hay tarifa", () => {
    const r = revisarVersion(input({ basePt: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("al menos un precio");
  });

  it("un ajuste por tipo en cero no se guarda", () => {
    const r = revisarVersion(input({ tipos: [{ tipo: "Comercial", ajustePt: 0 }, { tipo: "Tabla", ajustePt: 0.1 }] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.version.tipos).toEqual([{ tipo: "Tabla", ajustePt: 0.1 }]);
  });

  it("un tipo que no existe no pasa el schema", () => {
    const p = versionTarifaInputSchema.safeParse({ vigenteDesde: "2026-09-01", basePt: 0.3, tipos: [{ tipo: "Viga", ajustePt: 1 }] });
    expect(p.success).toBe(false);
  });
});

describe("normalizarTarifario", () => {
  it("descarta la versión rota entera y los tipos inventados", () => {
    const t = normalizarTarifario({
      versiones: [
        { id: "x", vigenteDesde: "mal", basePt: 1 },
        { id: "y", vigenteDesde: "2026-09-01", basePt: "0.3", tipos: [{ tipo: "Inventado", ajustePt: 1 }, { tipo: "Tabla", ajustePt: 0.1 }] },
      ],
    });
    expect(t.versiones).toHaveLength(1);
    expect(t.versiones[0].basePt).toBe(0.3);
    expect(t.versiones[0].tipos).toEqual([{ tipo: "Tabla", ajustePt: 0.1 }]);
  });

  it("lo que no es un tarifario es un tarifario vacío", () => {
    expect(normalizarTarifario(null)).toEqual(TARIFARIO_VACIO);
    expect(normalizarTarifario({ versiones: "no" })).toEqual(TARIFARIO_VACIO);
  });
});

describe("bloquesDeCorrida y cómo se lee", () => {
  it("cada paquete es un bloque con la especie de su corrida", () => {
    const bs = bloquesDeCorrida(
      { speciesCommon: "Tornillo", productType: "MADERA ASERRADA (COMERCIAL)", quantity: 2 },
      [
        { codigo: "A", volumenM3: 1.5, largoM: 2.44 },
        { codigo: "B", productType: "MADERA ASERRADA (CORTA)", volumenM3: 0.5 },
      ],
    );
    expect(bs.map((b) => [b.etiqueta, b.especie, b.productType])).toEqual([
      ["A", "Tornillo", "MADERA ASERRADA (COMERCIAL)"],
      ["B", "Tornillo", "MADERA ASERRADA (CORTA)"],
    ]);
  });

  it("una corrida sin cantidad no tiene nada que cobrar", () => {
    expect(bloquesDeCorrida({ speciesCommon: null, productType: null, quantity: null }, [])).toEqual([]);
  });

  it("el precio se explica en una línea", () => {
    const v = version({
      tipos: [{ tipo: "Comercial", ajustePt: 0.05 }],
      largos: [{ desdePies: 12, hastaPies: 16, ajustePt: 0.03 }],
    });
    const c = cotizarAserrio(v, [bloque({ productType: "MADERA ASERRADA (COMERCIAL)", largoM: 4 })]);
    const txt = explicarPrecio(c.lineas[0]);
    expect(txt).toContain("general");
    expect(txt).toContain("Comercial");
    expect(txt).toContain("de 12 a 16 pies");
    expect(txt).toContain("por PT");
  });

  it("los tramos se nombran como se dicen", () => {
    expect(etiquetaTramo({ desdePies: 0, hastaPies: 8 })).toBe("menos de 8 pies");
    expect(etiquetaTramo({ desdePies: 8, hastaPies: 12 })).toBe("de 8 a 12 pies");
    expect(etiquetaTramo({ desdePies: 16, hastaPies: null })).toBe("16 pies o más");
  });
});

describe("explicarPrecio sin ajustes", () => {
  it("dice de dónde sale el precio en vez de repetir el número", () => {
    const manual = explicarPrecio(cotizarAserrio(null, [bloque()], { precioManualPt: 0.45 }).lineas[0]);
    expect(manual).toContain("precio a mano");
    expect(manual).not.toContain("0.45 a mano");
    const especie = explicarPrecio(
      cotizarAserrio(version({ especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 0.35 }] }), [bloque()]).lineas[0],
    );
    expect(especie).toContain("precio de Tornillo");
    expect(explicarPrecio(cotizarAserrio(version(), [bloque()]).lineas[0])).toContain("precio general");
  });
});

describe("borradorDeTarifa — armado con la producción, sin inventar precios", () => {
  const HOY = "2026-09-13";
  const corridas = [
    { id: "c1", lineNo: 1, speciesCommon: "TORNILLO", productType: "MADERA ASERRADA (COMERCIAL)", quantity: 10 },
    { id: "c2", lineNo: 2, speciesCommon: "Tornillo", productType: "MADERA ASERRADA (PAQUETERIA LARGA)", quantity: 5 },
    { id: "c3", lineNo: 3, speciesCommon: "Cumala", productType: "MADERA ASERRADA (PAQUETERIA CORTA)", quantity: 1 },
    { id: "c4", lineNo: 4, speciesCommon: null, productType: null, quantity: 0.5 },
  ];
  const catalogo = new Map([[claveEspecie("Tornillo") as string, "Tornillo"]]);

  it("todos los precios en 0, con la nota y la fecha: guardarlo así lo rechaza revisarVersion", () => {
    const b = borradorDeTarifa(corridas, [], { hoy: HOY, nombres: catalogo });
    expect(b.vigenteDesde).toBe(HOY);
    expect(b.basePt).toBe(0);
    expect(b.especies.every((e) => e.precioPt === 0)).toBe(true);
    expect(b.tipos.every((t) => t.ajustePt === 0)).toBe(true);
    expect(b.nota).toBe(NOTA_BORRADOR);
    expect(versionTarifaInputSchema.safeParse(b).success).toBe(true);
    expect(revisarVersion(b).ok).toBe(false);
  });

  it("una especie por clave, con el nombre del catálogo, de la que más pesa a la que menos", () => {
    const b = borradorDeTarifa(corridas, [], { hoy: HOY, nombres: catalogo });
    expect(b.especies.map((e) => e.nombre)).toEqual(["Tornillo", "Cumala"]);
  });

  it("sin catálogo manda la grafía con más volumen en el libro", () => {
    expect(borradorDeTarifa(corridas, [], { hoy: HOY }).especies[0].nombre).toBe("TORNILLO");
  });

  it("los tipos salen del producto declarado, en el orden del cubicador", () => {
    const b = borradorDeTarifa(corridas, [], { hoy: HOY });
    expect(b.tipos.map((t) => t.tipo)).toEqual(["Comercial", "Paquetería larga", "Paquetería corta"]);
  });

  it("sin paquetes con largo no sugiere tramos", () => {
    expect(borradorDeTarifa(corridas, [], { hoy: HOY }).largos).toEqual([]);
  });

  it("con largos medidos sugiere tramos de 4 en 4 que, con un precio puesto, se pueden guardar", () => {
    const paquetes = [
      { ctpEntryId: "c1", codigo: "P1", volumenM3: 4, largoM: 2.44 },
      { ctpEntryId: "c1", codigo: "P2", volumenM3: 6, largoM: 3.66 },
    ];
    const b = borradorDeTarifa(corridas, paquetes, { hoy: HOY });
    expect(b.largos).toEqual([
      { desdePies: 0, hastaPies: 12, ajustePt: 0 },
      { desdePies: 12, hastaPies: null, ajustePt: 0 },
    ]);
    expect(revisarVersion({ ...b, basePt: 0.3 }).ok).toBe(true);
  });
});

describe("tramosSugeridos", () => {
  const cortes = (ls: number[]) => tramosSugeridos(ls).map((t) => [t.desdePies, t.hastaPies]);

  it("cubren desde el más corto hasta el más largo medido", () => {
    expect(cortes([6.56, 13.12])).toEqual([[0, 8], [8, 12], [12, null]]);
  });

  it("todos del mismo largo: se separa lo medido de lo más corto", () => {
    expect(cortes([9.84, 9.84])).toEqual([[0, 8], [8, null]]);
    expect(cortes([2, 3])).toEqual([[0, null]]);
  });

  it("nada medido, o un largo imposible, no sugiere nada", () => {
    expect(tramosSugeridos([])).toEqual([]);
    expect(tramosSugeridos([500])).toEqual([]);
  });
});

describe("baseDelBorrador — cuánto pesa cada precio", () => {
  it("cuenta las corridas y reparte el volumen por especie y por tipo", () => {
    const base = baseDelBorrador(
      [
        { id: "c1", speciesCommon: "Tornillo", productType: "MADERA ASERRADA (COMERCIAL)", quantity: 10 },
        { id: "c2", speciesCommon: "TORNILLO", productType: "MADERA ASERRADA (PAQUETERIA LARGA)", quantity: 5 },
        { id: "c3", speciesCommon: null, productType: null, quantity: 0.5 },
      ],
      [],
    );
    expect(base.corridas).toBe(3);
    expect(base.m3).toBe(15.5);
    expect(base.especies).toEqual([{ nombre: "Tornillo", m3: 15 }]);
    expect(base.tipos).toEqual([
      { tipo: "Comercial", m3: 10 },
      { tipo: "Paquetería larga", m3: 5 },
    ]);
  });
});

describe("la unidad de la corrida — sin paquetes, la cantidad se lee en su unidad", () => {
  const tarifa: VersionTarifa = {
    id: "v1",
    vigenteDesde: "2026-09-01",
    basePt: 0.3,
    especies: [],
    tipos: [],
    largos: [],
    nota: null,
    creadoPor: null,
    creadoEn: null,
  };
  const corrida = (quantity: number, unit?: string | null) => ({
    lineNo: 5,
    speciesCommon: "Tornillo",
    productType: null,
    quantity,
    unit,
  });

  it("en PT se cobra el PT declarado, sin la ida y vuelta por m³ que lo redondea", () => {
    const bloques = bloquesDeCorrida(corrida(5000, "pt"), []);
    expect(bloques).toHaveLength(1);
    expect(bloques[0].volumenM3).toBeCloseTo(5000 / 424, 4);
    const c = cotizarAserrio(tarifa, bloques);
    expect(c.pt).toBe(5000);
    expect(c.importe).toBe(1500);
  });

  it("en m³ (o sin unidad) sigue siendo m³ × 424", () => {
    expect(cotizarAserrio(tarifa, bloquesDeCorrida(corrida(1, "m3"), [])).pt).toBe(424);
    expect(cotizarAserrio(tarifa, bloquesDeCorrida(corrida(1), [])).pt).toBe(424);
    expect(cotizarAserrio(tarifa, bloquesDeCorrida(corrida(1, "M3"), [])).pt).toBe(424);
  });

  it("5000 kg no son 5000 m³: sin paquetes no hay bloque que cobrar", () => {
    expect(bloquesDeCorrida(corrida(5000, "kg"), [])).toEqual([]);
    expect(bloquesDeCorrida(corrida(12, "unidad"), [])).toEqual([]);
    expect(corridaSinPt("kg", false)).toBe(true);
    expect(corridaSinPt("unidad", false)).toBe(true);
  });

  it("con paquetes manda el m³ del paquete, sea cual sea la unidad de la corrida", () => {
    expect(corridaSinPt("kg", true)).toBe(false);
    const b = bloquesDeCorrida(corrida(5000, "kg"), [{ codigo: "P-1", volumenM3: 1 }]);
    expect(cotizarAserrio(tarifa, b).pt).toBe(424);
  });

  it("m³, PT o sin unidad sí tienen de dónde sacar el PT", () => {
    expect(corridaSinPt("m3", false)).toBe(false);
    expect(corridaSinPt("pt", false)).toBe(false);
    expect(corridaSinPt(null, false)).toBe(false);
    expect(corridaSinPt("", false)).toBe(false);
  });

  it("el borrador pesa la corrida en PT con su m³ y deja afuera la de kg", () => {
    const base = baseDelBorrador(
      [
        { id: "c1", speciesCommon: "Tornillo", productType: null, quantity: 848, unit: "pt" },
        { id: "c2", speciesCommon: "Tornillo", productType: null, quantity: 5000, unit: "kg" },
      ],
      [],
    );
    expect(base.m3).toBe(2);
  });
});

describe("desdeHaceMeses — el rango del borrador", () => {
  it("un 31 no desborda al mes siguiente: cae en el último día del mes", () => {
    expect(desdeHaceMeses("2026-08-31", 6)).toBe("2026-02-28");
    expect(desdeHaceMeses("2028-08-31", 6)).toBe("2028-02-29");
    expect(desdeHaceMeses("2026-12-31", 6)).toBe("2026-06-30");
  });

  it("cruza el año y conserva el día cuando existe", () => {
    expect(desdeHaceMeses("2026-03-15", 6)).toBe("2025-09-15");
    expect(desdeHaceMeses("2026-06-01", 6)).toBe("2025-12-01");
    expect(desdeHaceMeses("2026-09-13", 0)).toBe("2026-09-13");
  });
});

describe("borradorDeTarifa — rige desde la corrida más vieja que lo armó", () => {
  const c = (id: string, lineNo: number, fecha: string | null) => ({
    id,
    lineNo,
    fecha,
    speciesCommon: "Tornillo",
    productType: null,
    quantity: 1,
  });
  const corridas = [c("c3", 9, "2026-09-09"), c("c1", 3, "2026-07-01"), c("c2", 6, "2026-08-15")];

  it("la vigencia es la fecha de la más vieja, y la base dice cuál es", () => {
    expect(borradorDeTarifa(corridas, [], { hoy: "2026-09-13" }).vigenteDesde).toBe("2026-07-01");
    expect(baseDelBorrador(corridas, []).desdeCorrida).toEqual({ lineNo: 3, fecha: "2026-07-01" });
  });

  it("con precios puestos, esa versión rige para las tres corridas que la armaron", () => {
    const r = revisarVersion({ ...borradorDeTarifa(corridas, [], { hoy: "2026-09-13" }), basePt: 0.3 });
    if (!r.ok) throw new Error(r.motivo);
    const t = guardarVersion(TARIFARIO_VACIO, { ...r.version, id: "b", creadoPor: null, creadoEn: null });
    for (const x of corridas) expect(versionVigente(t, x.fecha)?.id).toBe("b");
  });

  it("sin corridas con fecha, rige desde hoy y no nombra ninguna", () => {
    expect(borradorDeTarifa([], [], { hoy: "2026-09-13" }).vigenteDesde).toBe("2026-09-13");
    expect(borradorDeTarifa([c("c1", 1, null)], [], { hoy: "2026-09-13" }).vigenteDesde).toBe("2026-09-13");
    expect(baseDelBorrador([], []).desdeCorrida).toBeNull();
  });
});
