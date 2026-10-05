import { describe, expect, it } from "vitest";
import {
  DIAS_RIESGO,
  clasesDiametricas,
  costoM3DeGuia,
  fiscalizacionDelPatio,
  flujoDelPatio,
  primeroALaSierra,
  ptEstimados,
  riesgoDelPatio,
  valorDelPatio,
  type PiezaKpi,
} from "@/lib/forestal/trozas-patio-kpis";
import { antiguedadDelPatio } from "@/lib/forestal/trozas-patio";

const HOY = new Date("2026-10-05T15:00:00Z");

const pieza = (o: Partial<PiezaKpi> = {}): PiezaKpi => ({
  id: o.id ?? "t1",
  woodEntryId: "g1",
  especieComun: "Tornillo",
  volumenM3: 2,
  gtfNumber: "001",
  fechaIngreso: "2026-10-01",
  consumidaEnId: null,
  despachadaEnId: null,
  noRecepcionada: false,
  guiaRecepcionada: true,
  descarte: false,
  retrozos: 0,
  trozaOrigenId: null,
  loteAserrioCode: null,
  permiso: "CONC-1",
  codificacion: "29/A",
  d1Cm: 60,
  d2Cm: 58,
  ...o,
});

describe("valorDelPatio — a costo de su guía, nunca S/ 0 inventado", () => {
  it("sin ninguna factura el valor es null, no 0, y cuenta las guías que faltan", () => {
    const v = valorDelPatio([pieza(), pieza({ id: "t2", woodEntryId: "g2" })]);
    expect(v.soles).toBeNull();
    expect(v.guiasSinCosto).toBe(2);
    expect(v.m3SinCosto).toBe(4);
  });
  it("pieza × (factura ÷ m³ del asiento), y lo parcial se separa", () => {
    const v = valorDelPatio([
      pieza({ guiaCostoTotal: 1000, guiaVolumenM3: 10 }), // 100 S/ por m³ → 200
      pieza({ id: "t2", woodEntryId: "g2", guiaCostoTotal: null, guiaVolumenM3: 5 }),
    ]);
    expect(v.soles).toBe(200);
    expect(v.m3Costeado).toBe(2);
    expect(v.m3SinCosto).toBe(2);
    expect(v.guiasConCosto).toBe(1);
    expect(v.guiasSinCosto).toBe(1);
  });
  it("la madera de servicio no es valor ni «sin costo»", () => {
    const v = valorDelPatio([pieza({ guiaMaderaDeTercero: true })]);
    expect(v.soles).toBeNull();
    expect(v.guiasSinCosto).toBe(0);
    expect(v.m3DeServicio).toBe(2);
  });
  it("lo ya aserrado no cuenta: sólo lo parado", () => {
    const v = valorDelPatio([pieza({ consumidaEnId: "c1", guiaCostoTotal: 1000, guiaVolumenM3: 10 })]);
    expect(v.m3Total).toBe(0);
    expect(v.soles).toBeNull();
  });
  it("un costo 0 o un asiento sin volumen no es un costo", () => {
    expect(costoM3DeGuia({ guiaCostoTotal: 0, guiaVolumenM3: 5 })).toBeNull();
    expect(costoM3DeGuia({ guiaCostoTotal: 500, guiaVolumenM3: 0 })).toBeNull();
  });
});

describe("primeroALaSierra — las libres más viejas", () => {
  it("elige el tramo más viejo que tenga libres, sin mirar las apartadas", () => {
    const p = primeroALaSierra(
      [
        pieza({ id: "a", fechaIngreso: "2026-10-03" }),
        pieza({ id: "b", fechaIngreso: "2026-09-18" }), // 17 d
        pieza({ id: "c", fechaIngreso: "2026-08-01", loteAserrioCode: "L-1" }), // apartada, no cuenta
      ],
      HOY,
    );
    expect(p).toMatchObject({ tramo: "16a30", piezas: 1, m3: 2, diasMax: 17, desde: 15 });
  });
  it("sin libres con fecha devuelve null", () => {
    expect(primeroALaSierra([pieza({ consumidaEnId: "c1" })], HOY)).toBeNull();
  });
});

describe("ptEstimados — derivado del rendimiento REAL del libro", () => {
  it("m³ × rendimiento × 424", () => {
    expect(ptEstimados(13.517, 49.25)).toBe(2823);
  });
  it("sin rendimiento no se estima (nunca se supone el 56 %)", () => {
    expect(ptEstimados(10, null)).toBeNull();
    expect(ptEstimados(10, 0)).toBeNull();
    expect(ptEstimados(0, 50)).toBeNull();
  });
});

describe("riesgoDelPatio — 30 días o más", () => {
  it("suma los tramos de riesgo y dice cuánto le falta a la más vieja", () => {
    const edad = antiguedadDelPatio([pieza({ fechaIngreso: "2026-09-15" })], HOY); // 20 d
    const r = riesgoDelPatio(edad.tramos, edad.masVieja);
    expect(DIAS_RIESGO).toBe(30);
    expect(r.piezas).toBe(0);
    expect(r.faltanDias).toBe(10);
    expect(r.claves).toEqual(["31a60", "mas60"]);
  });
  it("con piezas viejas las cuenta y ya no hay cuenta regresiva", () => {
    const edad = antiguedadDelPatio([pieza({ fechaIngreso: "2026-08-01" }), pieza({ id: "t2" })], HOY);
    const r = riesgoDelPatio(edad.tramos, edad.masVieja);
    expect(r).toMatchObject({ piezas: 1, m3: 2, faltanDias: null });
  });
});

describe("flujoDelPatio — entradas contra sierra", () => {
  it("cuenta entradas y consumos de la ventana y los días hasta la sierra", () => {
    const f = flujoDelPatio(
      [
        pieza({ id: "a", fechaIngreso: "2026-09-20", consumidaEnId: "c1", consumidaFecha: "2026-09-23" }), // 3 d
        pieza({ id: "b", fechaIngreso: "2026-09-20", consumidaEnId: "c1", consumidaFecha: "2026-09-21" }), // 1 d
        pieza({ id: "c", fechaIngreso: "2026-10-01" }),
        pieza({ id: "d", fechaIngreso: "2026-07-01" }), // fuera de la ventana
      ],
      HOY,
    );
    expect(f.entradas).toEqual({ piezas: 3, m3: 6 });
    expect(f.aSierra).toEqual({ piezas: 2, m3: 4 });
    expect(f.diasASierra).toEqual({ promedio: 2, piezas: 2 });
  });
  it("un pedazo de retrozado, una que no llegó o una guía en bandeja no son entradas", () => {
    const f = flujoDelPatio(
      [pieza({ trozaOrigenId: "m" }), pieza({ id: "x", noRecepcionada: true }), pieza({ id: "y", guiaRecepcionada: false })],
      HOY,
    );
    expect(f.entradas.piezas).toBe(0);
  });
  it("la fecha de recepción de la pieza manda sobre la del asiento", () => {
    const f = flujoDelPatio([pieza({ fechaIngreso: "2026-07-01", fechaRecepcion: "2026-10-02T14:00:00Z" })], HOY);
    expect(f.entradas.piezas).toBe(1);
  });
  it("sin ninguna aserrada no hay promedio", () => {
    expect(flujoDelPatio([pieza()], HOY).diasASierra).toBeNull();
  });
  it("las despachadas enteras se cuentan aparte", () => {
    const f = flujoDelPatio([pieza({ despachadaEnId: "d1", despachadaFecha: "2026-10-04" })], HOY);
    expect(f.enteras).toEqual({ piezas: 1, m3: 2 });
    expect(f.aSierra.piezas).toBe(0);
  });
});

describe("clasesDiametricas", () => {
  it("de 10 en 10 cm por D medio, con los huecos intermedios", () => {
    const c = clasesDiametricas([
      pieza({ id: "a", d1Cm: 46, d2Cm: 46 }),
      pieza({ id: "b", d1Cm: 72, d2Cm: 68 }), // 70
      pieza({ id: "c", d1Cm: null, d2Cm: null }),
    ]);
    expect(c.clases.map((x) => [x.desde, x.piezas])).toEqual([[40, 1], [50, 0], [60, 0], [70, 1]]);
    expect(c.sinMedidas).toBe(1);
  });
  it("sin D1/D2 no inventa clases (el diámetro equivalente es pista, no medida)", () => {
    const c = clasesDiametricas([pieza({ d1Cm: null, d2Cm: null })]);
    expect(c.clases).toEqual([]);
    expect(c.sinMedidas).toBe(1);
  });
  it("una pila muy dispareja pasa a clases de 20 cm", () => {
    const c = clasesDiametricas([pieza({ id: "a", d1Cm: 20, d2Cm: 20 }), pieza({ id: "b", d1Cm: 130, d2Cm: 130 })]);
    expect(c.clases[0]).toMatchObject({ desde: 20, hasta: 40 });
    expect(c.clases.length).toBe(6);
  });
});

describe("fiscalizacionDelPatio", () => {
  it("lista = código + D1/D2 + título; QR y cancha ayudan pero no son el papel", () => {
    const f = fiscalizacionDelPatio([
      pieza({ id: "a", zonaId: "z1" }),
      pieza({ id: "b", permiso: null, zonaId: null }),
      pieza({ id: "c", consumidaEnId: "c1", permiso: null }), // ya aserrada: no cuenta
    ]);
    expect(f.total).toBe(2);
    expect(f.listas).toBe(1);
    const fila = (k: string) => f.filas.find((x) => x.clave === k);
    expect(fila("titulo")).toMatchObject({ con: 1, faltan: ["b"] });
    expect(fila("etiqueta")).toMatchObject({ con: 0, faltan: ["a", "b"] });
    expect(fila("ubicacion")).toMatchObject({ con: 1 });
  });
  it("sin el dato de cancha, «Ubicada» no aparece (no es un 0)", () => {
    const f = fiscalizacionDelPatio([pieza()]);
    expect(f.filas.some((x) => x.clave === "ubicacion")).toBe(false);
  });
  it("«-» como codificación es sin código", () => {
    const f = fiscalizacionDelPatio([pieza({ codificacion: "-" })]);
    expect(f.listas).toBe(0);
  });
});
