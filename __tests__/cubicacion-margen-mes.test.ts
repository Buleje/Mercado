/**
 * Margen del mes y precio de compra anotado a mano (Cubicador › Guardadas, 24-10).
 *
 * Lo que se protege: el mes suma el MISMO margen que el detalle de cada camión
 * (`armarMargen`, no otra fórmula); el camión sin precio de compra no entra y
 * se cuenta aparte (no como 0); las compras de una comunidad se juntan como el
 * servidor con `?conBeneficiario=1`; y el precio anotado se guarda normalizado,
 * se conserva si el guardado no lo trae y se borra con `null`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/platform-settings.db", () => ({ PlatformSettingsDB: {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {} }));

import { datosQueSeConservan } from "@/lib/db/forest-cubicaciones.db";
import { armarMargenGuardado, guardadaParaMargen, precioGuardado, type ComercialParaMargen } from "@/lib/forestal/cubicacion-margen";
import { deLaComunidad, margenDeLaGuardada, margenDelMes, mesDe, mesesParaElegir, nombreDelMes } from "@/lib/forestal/cubicacion-margen-mes";
import { construirRegistro, normalizarCompraAMano, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

const com = (o: Partial<ComercialParaMargen> & Pick<ComercialParaMargen, "id">): ComercialParaMargen => ({
  codigo: `CUB-${o.id}`, fecha: "2026-10-24", sentido: "compra", estado: "aplicada", material: "aserrada", formula: "tablar",
  unidad: "PT", volumen: 2000, monto: 3600, gtfNumber: null, parteId: null, beneficiarioId: null, personaNombre: "CCNN QA", cubicacionRefId: null, ...o,
});

const guardada = (id: string, o: Partial<CubicacionRegistro> & { pt: number }): CubicacionRegistro => {
  const { pt, ...resto } = o;
  return {
    id, nombre: `Camión ${id}`, fecha: "2026-10-10", precioPt: 0, valor: 0, piezas: [],
    totales: { piezas: 1, pieTablar: pt }, createdAt: "", updatedAt: "", ...resto,
  } as unknown as CubicacionRegistro;
};

const SAN_LUIS = { comunidad: "CCNN San Luis", comunidadParteId: "p1" };
const CHIVIS = { comunidad: "CCNN Chivis", comunidadParteId: "p2" };
const anotado = (precioPt: number) => ({ precioPt, fecha: "2026-10-24T15:00:00.000Z", por: "qaadmin" });

/* A: compra y venta del mismo lote en la cuenta. B: precio anotado a mano, venta sin cobrar.
   C: sin compra. E: compra por la GTF atada a la comunidad SÓLO por su beneficiario.
   F: sin comunidad y sin precio de venta. D: de setiembre (no entra en octubre). */
const LISTA: CubicacionRegistro[] = [
  guardada("A", { pt: 2000, valor: 5000, gtfNumber: "001-0000120", ficha: SAN_LUIS }),
  guardada("B", { pt: 1000, valor: 2400, ficha: SAN_LUIS, compraAMano: anotado(1.9) }),
  guardada("C", { pt: 800, valor: 2000, gtfNumber: "001-0000125", ficha: CHIVIS }),
  guardada("E", { pt: 1000, valor: 3000, gtfNumber: "001-0000130", ficha: CHIVIS }),
  guardada("F", { pt: 500, valor: 0, compraAMano: anotado(2) }),
  guardada("D", { pt: 1000, valor: 3000, fecha: "2026-09-30", ficha: SAN_LUIS, compraAMano: anotado(1) }),
];
const COMERCIALES: ComercialParaMargen[] = [
  com({ id: "ca", cubicacionRefId: "A", parteId: "p1", monto: 3600, volumen: 2000 }),
  com({ id: "va", sentido: "venta", cubicacionRefId: "A", monto: 5000, volumen: 2000, parteId: "comprador" }),
  com({ id: "ce", gtfNumber: "130", beneficiarioId: "b2", monto: 2000, volumen: 1000 }),
  /* De otra comunidad con la misma GTF que C: no calza sola. */
  com({ id: "cx", gtfNumber: "001-0000125", parteId: "otra" }),
];
const BENEF = new Map([["p2", ["b2"]]]);
const base = { lista: LISTA, comerciales: COMERCIALES, beneficiariosDeLaParte: BENEF, guias: new Map(), cargandoGuias: false };

describe("normalizarCompraAMano · el precio anotado", () => {
  it("redondea a 2 decimales y acepta el texto de un número", () => {
    expect(normalizarCompraAMano({ precioPt: 1.805, fecha: "2026-10-24T15:00:00.000Z", por: " qaadmin " })).toEqual({ precioPt: 1.81, fecha: "2026-10-24T15:00:00.000Z", por: "qaadmin" });
    expect(normalizarCompraAMano({ precioPt: "2.5" })?.precioPt).toBe(2.5);
  });
  it("0, negativo, más de 99 999 o texto no es un precio", () => {
    for (const precioPt of [0, -1, 100_000, "x", null, 0.004]) expect(normalizarCompraAMano({ precioPt })).toBeUndefined();
    expect(normalizarCompraAMano(null)).toBeUndefined();
  });
  it("construirRegistro lo guarda; sin él no hay campo", () => {
    const con = construirRegistro({ nombre: "L", fecha: "2026-10-24", precioPt: 2, piezas: [], compraAMano: { precioPt: 1.8 } });
    expect(con.compraAMano?.precioPt).toBe(1.8);
    expect(construirRegistro({ nombre: "L", fecha: "2026-10-24", precioPt: 2, piezas: [] }).compraAMano).toBeUndefined();
  });
});

describe("datosQueSeConservan · el precio anotado", () => {
  const existente = guardada("A", { pt: 10, compraAMano: anotado(1.9) });
  it("si el guardado no lo trae, se queda el anotado (abrir y guardar en el cubicador no lo borra)", () => {
    expect(datosQueSeConservan({ nombre: "L", piezas: [] }, existente).compraAMano).toEqual(anotado(1.9));
  });
  it("null lo borra; uno nuevo lo cambia", () => {
    expect(datosQueSeConservan({ nombre: "L", piezas: [], compraAMano: null }, existente).compraAMano).toBeUndefined();
    expect(datosQueSeConservan({ nombre: "L", piezas: [], compraAMano: anotado(2.2) }, existente).compraAMano?.precioPt).toBe(2.2);
  });
});

describe("armarMargenGuardado · con qué compra arranca", () => {
  const entrada = (c: CubicacionRegistro, comerciales: ComercialParaMargen[]) => ({
    guardada: guardadaParaMargen(c),
    deLaRef: comerciales.filter((x) => x.cubicacionRefId === c.id),
    deLaComunidad: comerciales,
    comunidadParteId: "p1",
    precioAMano: precioGuardado(c.compraAMano),
    rendimiento: { falta: "x" },
  });
  const venta = (id: string) => com({ id: `v${id}`, sentido: "venta", cubicacionRefId: id, monto: 5000, volumen: 2000 });

  it("con precio anotado y sin compra del lote, arranca en «mano»; sin él, la que calza sola", () => {
    const g = guardada("H", { pt: 2000, ficha: SAN_LUIS, compraAMano: anotado(1.9) });
    expect(armarMargenGuardado(entrada(g, [venta("H")]))).toMatchObject({ eleccion: "mano", respaldo: false, compra: { ok: true, compra: { origen: "a-mano", porPt: 1.9 } } });
    expect(armarMargenGuardado(entrada({ ...g, compraAMano: undefined }, [venta("H")]))).toMatchObject({ eleccion: "", respaldo: false, compra: null });
  });

  it("la compra del lote registrada después le gana al precio a mano, que queda de respaldo (2.000 a mano contra 3.600 reales)", () => {
    const g = guardada("H", { pt: 2000, ficha: SAN_LUIS, compraAMano: anotado(1) });
    const r = armarMargenGuardado(entrada(g, [venta("H"), com({ id: "cH", cubicacionRefId: "H", parteId: "p1", monto: 3600, volumen: 2000 })]));
    expect(r).toMatchObject({ eleccion: "", respaldo: true, compra: { ok: true, compra: { origen: "lote" } } });
    expect(r.margen?.compraTotal).toBe(3600);
  });

  it("si la compra del lote no se puede usar (troza sin rendimiento), entra el precio a mano", () => {
    const g = guardada("H", { pt: 2000, ficha: SAN_LUIS, compraAMano: anotado(1.5) });
    const r = armarMargenGuardado(entrada(g, [venta("H"), com({ id: "cH", cubicacionRefId: "H", unidad: "m³", volumen: 8, monto: 3200 })]));
    expect(r).toMatchObject({ eleccion: "mano", respaldo: false });
    expect(r.margen?.compraTotal).toBe(3000);
  });
});

describe("deLaComunidad · como el servidor con ?conBeneficiario=1", () => {
  it("la de la ficha o la del beneficiario atado a ella; sin ficha, todas", () => {
    const todas = [com({ id: "1", parteId: "p2" }), com({ id: "2", beneficiarioId: "b2" }), com({ id: "3", parteId: "otra" })];
    expect(deLaComunidad(todas, "p2", BENEF).map((c) => c.id)).toEqual(["1", "2"]);
    expect(deLaComunidad(todas, undefined, BENEF)).toHaveLength(3);
  });
});

describe("mes", () => {
  it("se corta de la fecha date-only; los meses del selector llevan el actual", () => {
    expect(mesDe("2026-10-31")).toBe("2026-10");
    expect(mesDe("")).toBe("");
    expect(nombreDelMes("2026-09")).toBe("setiembre 2026");
    expect(mesesParaElegir(LISTA, "2026-11")).toEqual(["2026-11", "2026-10", "2026-09"]);
  });
});

describe("margenDelMes", () => {
  const { filas, total } = margenDelMes({ ...base, mes: "2026-10", por: "comunidad" });

  it("cada camión es el MISMO armarMargen del detalle (sin otra fórmula)", () => {
    for (const c of LISTA.filter((x) => x.fecha.startsWith("2026-10"))) {
      const parteId = c.ficha?.comunidadParteId;
      const solo = armarMargenGuardado({
        guardada: guardadaParaMargen(c),
        deLaRef: COMERCIALES.filter((x) => x.cubicacionRefId === c.id),
        deLaComunidad: deLaComunidad(COMERCIALES, parteId, BENEF),
        comunidadParteId: parteId,
        precioAMano: precioGuardado(c.compraAMano),
        rendimiento: { falta: "x" },
      });
      expect(margenDeLaGuardada(c, base).margen).toEqual(solo.margen);
    }
  });

  it("cuadra a mano: San Luis = (5.000 − 3.600) + (2.400 − 1,90 × 1.000)", () => {
    const sanLuis = filas.find((f) => f.clave === "id:p1");
    expect(sanLuis).toMatchObject({ etiqueta: "CCNN San Luis", camiones: 2, conMargen: 2, pt: 3000, venta: 7400, compra: 5500, margen: 1900, pct: 25.7, aMano: 1, derivados: 1, sinCompra: 0 });
  });

  it("el camión sin precio de compra no entra ni como 0: se cuenta aparte", () => {
    const chivis = filas.find((f) => f.clave === "id:p2");
    /* Sólo E (compra atada por el beneficiario b2, misma GTF «130»): 3.000 − 2 × 1.000. */
    expect(chivis).toMatchObject({ camiones: 2, conMargen: 1, sinCompra: 1, pt: 1000, venta: 3000, compra: 2000, margen: 1000, pct: 33.3 });
    expect(chivis?.fuera).toEqual([{ id: "C", nombre: "Camión C", falta: "compra" }]);
  });

  it("sin la persona de Adelantos, la compra de E tampoco entra (la regla del servidor, no otra)", () => {
    const sin = margenDelMes({ ...base, beneficiariosDeLaParte: new Map(), mes: "2026-10", por: "comunidad" });
    expect(sin.filas.find((f) => f.clave === "id:p2")).toMatchObject({ conMargen: 0, sinCompra: 2, margen: 0 });
  });

  it("«Sin comunidad» va al final; sin precio de venta también queda fuera; setiembre no entra", () => {
    expect(filas.map((f) => f.clave)).toEqual(["id:p1", "id:p2", "sin"]);
    expect(filas[2]).toMatchObject({ etiqueta: "Sin comunidad", camiones: 1, conMargen: 0, sinVenta: 1 });
    expect(total).toMatchObject({ camiones: 5, conMargen: 3, pt: 4000, venta: 10400, compra: 7500, margen: 2900, pct: 27.9, sinCompra: 1, sinVenta: 1 });
  });

  it("una compra por m³ de troza sin rendimiento de la guía cuenta como sin precio de compra", () => {
    const g = guardada("M", { pt: 1000, valor: 2500, gtfNumber: "001-0000140", ficha: SAN_LUIS });
    const r = margenDelMes({ ...base, lista: [g], comerciales: [com({ id: "m", cubicacionRefId: "M", unidad: "m³", volumen: 4, monto: 1600 })], mes: "2026-10", por: "comunidad" });
    expect(r.total).toMatchObject({ camiones: 1, conMargen: 0, sinCompra: 1, margen: 0 });
  });

  it("dos camiones de la misma GTF y comunidad, sólo la compra del lote de A: B no toma esa compra (no se cuenta dos veces)", () => {
    const lista = [
      guardada("A", { pt: 2000, valor: 5000, gtfNumber: "001-0000150", ficha: SAN_LUIS }),
      guardada("B", { pt: 2000, valor: 5000, gtfNumber: "001-0000150", ficha: SAN_LUIS }),
    ];
    const comerciales = [com({ id: "cA", cubicacionRefId: "A", parteId: "p1", gtfNumber: "001-0000150", monto: 3000, volumen: 2000 })];
    const r = margenDelMes({ ...base, lista, comerciales, mes: "2026-10", por: "comunidad" });
    expect(r.total).toMatchObject({ camiones: 2, conMargen: 1, compra: 3000, sinCompra: 1 });
    expect(r.total.fuera).toEqual([{ id: "B", nombre: "Camión B", falta: "compra" }]);
  });

  it("una compra por la GTF sin lote, de dos camiones: precio por PT × los PT de cada uno (no entera dos veces) y es derivado", () => {
    const lista = [
      guardada("G1", { pt: 1000, valor: 2500, gtfNumber: "001-0000160", ficha: SAN_LUIS }),
      guardada("G2", { pt: 3000, valor: 7500, gtfNumber: "001-0000160", ficha: SAN_LUIS }),
    ];
    /* 4.000 PT por S/ 6.000 = S/ 1,50 el PT: G1 1.500, G2 4.500; juntos los 6.000 de la cuenta, no 12.000. */
    const comerciales = [
      com({ id: "cg", parteId: "p1", gtfNumber: "160", monto: 6000, volumen: 4000 }),
      /* G1 con su venta cobrada: su único derivado es la compra por la GTF. */
      com({ id: "vg1", sentido: "venta", cubicacionRefId: "G1", monto: 2500, volumen: 1000 }),
    ];
    const r = margenDelMes({ ...base, lista, comerciales, mes: "2026-10", por: "comunidad" });
    expect(r.camiones.map((c) => c.margen?.compraTotal)).toEqual([1500, 4500]);
    expect(r.camiones[0]).toMatchObject({ derivado: true, aMano: false });
    expect(r.total).toMatchObject({ compra: 6000, derivados: 2, sinCompra: 0 });
  });

  it("un precio a mano tapado por la compra del lote se cuenta como respaldo, no como «a mano»", () => {
    const lista = [guardada("R", { pt: 2000, valor: 5000, ficha: SAN_LUIS, compraAMano: anotado(1) })];
    const comerciales = [com({ id: "cR", cubicacionRefId: "R", parteId: "p1", monto: 3600, volumen: 2000 })];
    const r = margenDelMes({ ...base, lista, comerciales, mes: "2026-10", por: "comunidad" });
    expect(r.total).toMatchObject({ compra: 3600, aMano: 0, respaldo: 1 });
  });
});
