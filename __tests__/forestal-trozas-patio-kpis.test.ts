import { describe, expect, it } from "vitest";
import {
  DIAS_RIESGO,
  clasesDiametricas,
  conCostosCargados,
  costoM3DeGuia,
  fiscalizacionDelPatio,
  flujoDelPatio,
  guiasSinCostoDelPatio,
  primeroALaSierra,
  ptEstimados,
  repartoDeGuia,
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
    const v = valorDelPatio([pieza(), pieza({ id: "t2", woodEntryId: "g2", gtfNumber: "002" })]);
    expect(v.soles).toBeNull();
    expect(v.guiasSinCosto).toBe(2);
    expect(v.m3SinCosto).toBe(4);
  });
  it("pieza × (factura ÷ m³ del asiento), y lo parcial se separa", () => {
    const v = valorDelPatio([
      pieza({ guiaCostoTotal: 1000, guiaVolumenM3: 10 }), // 100 S/ por m³ → 200
      pieza({ id: "t2", woodEntryId: "g2", gtfNumber: "002", guiaCostoTotal: null, guiaVolumenM3: 5 }),
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

describe("valorDelPatio — por guía, la más cara y la más vieja", () => {
  it("dos asientos de la MISMA guía (dos especies) son una guía, no dos", () => {
    const v = valorDelPatio([pieza(), pieza({ id: "t2", woodEntryId: "g2", especieComun: "Cumala" })]);
    expect(v.guiasSinCosto).toBe(1);
  });
  it("la guía con más soles parados y la pieza costeada más vieja con su valor", () => {
    const v = valorDelPatio(
      [
        pieza({ id: "a", guiaCostoTotal: 1000, guiaVolumenM3: 10, fechaIngreso: "2026-10-03" }), // 2 m³ × 100 = 200
        pieza({ id: "b", codificacion: "7/B", woodEntryId: "g2", gtfNumber: "002", proveedor: "Ríos", guiaCostoTotal: 3000, guiaVolumenM3: 10, fechaIngreso: "2026-09-15" }), // 600, 20 d
        pieza({ id: "c", woodEntryId: "g2", gtfNumber: "002", guiaCostoTotal: 3000, guiaVolumenM3: 10, volumenM3: 1 }), // 300
        pieza({ id: "d", woodEntryId: "g3", gtfNumber: "003", fechaIngreso: "2026-08-01" }), // sin costo: no es «la más vieja costeada»
      ],
      HOY,
    );
    expect(v.soles).toBe(1100);
    expect(v.guiasConCosto).toBe(2);
    expect(v.guiaMayor).toEqual({ gtfNumber: "002", proveedor: "Ríos", soles: 900, m3: 3 });
    expect(v.masVieja).toEqual({ id: "b", codigo: "7/B", gtfNumber: "002", dias: 20, soles: 600 });
  });
  it("sin `hoy` no inventa la más vieja", () => {
    expect(valorDelPatio([pieza({ guiaCostoTotal: 1000, guiaVolumenM3: 10 })]).masVieja).toBeNull();
  });
});

describe("guiasSinCostoDelPatio — lo que el modal «Cargar costos» lista", () => {
  it("agrupa por N° de guía, sólo lo parado y sin servicio, la de más m³ primero", () => {
    const g = guiasSinCostoDelPatio(
      [
        pieza({ id: "a", proveedor: "Ríos", fechaIngreso: "2026-09-25" }),
        pieza({ id: "b", woodEntryId: "g1b", especieComun: "Cumala", volumenM3: 1.5 }),
        pieza({ id: "c", consumidaEnId: "x" }), // ya aserrada
        pieza({ id: "d", woodEntryId: "g2", gtfNumber: "002", volumenM3: 9 }),
        pieza({ id: "e", woodEntryId: "g3", gtfNumber: "003", guiaMaderaDeTercero: true }),
        pieza({ id: "f", woodEntryId: "g4", gtfNumber: "004", guiaCostoTotal: 500, guiaVolumenM3: 5 }),
      ],
      HOY,
    );
    expect(g.map((x) => x.gtfNumber)).toEqual(["002", "001"]);
    expect(g[1]).toEqual({ gtfNumber: "001", proveedor: "Ríos", especies: ["Cumala", "Tornillo"], piezas: 2, m3Patio: 3.5, diasMax: 10 });
  });
});

describe("repartoDeGuia — un costo para la guía entera, por m³ de cada asiento", () => {
  const asientos = [
    { id: "tornillo", volumeM3: 10 },
    { id: "cumala", volumeM3: 5 },
  ];
  it("un total se reparte por m³ y todas las especies quedan al mismo S/ por m³", () => {
    const r = repartoDeGuia({ de: "total", valor: 6000 }, asientos);
    expect(r).toEqual({
      total: 6000,
      porM3: 400,
      m3Guia: 15,
      lineas: [
        { id: "tornillo", costoTotal: 4000 },
        { id: "cumala", costoTotal: 2000 },
      ],
    });
  });
  it("S/ por m³ × m³ de la guía da el total, y la suma cierra al céntimo", () => {
    const r = repartoDeGuia({ de: "m3", valor: 333.33 }, [
      { id: "a", volumeM3: 1 },
      { id: "b", volumeM3: 1 },
      { id: "c", volumeM3: 1 },
    ]);
    expect(r?.total).toBe(999.99);
    expect(r?.lineas.reduce((a, l) => a + l.costoTotal, 0)).toBeCloseTo(999.99, 2);
  });
  it("un costo 0, negativo o sin m³ no es un costo: null", () => {
    expect(repartoDeGuia({ de: "total", valor: 0 }, asientos)).toBeNull();
    expect(repartoDeGuia({ de: "m3", valor: -5 }, asientos)).toBeNull();
    expect(repartoDeGuia({ de: "total", valor: Number.NaN }, asientos)).toBeNull();
    expect(repartoDeGuia({ de: "total", valor: 100 }, [{ id: "a", volumeM3: 0 }])).toBeNull();
  });
});

describe("conCostosCargados — la tarjeta cambia con lo que contestó el servidor", () => {
  it("pisa el costo sólo de los asientos guardados", () => {
    const t = conCostosCargados([pieza(), pieza({ id: "t2", woodEntryId: "g2" })], new Map([["g2", 800]]));
    expect(t.map((x) => x.guiaCostoTotal ?? null)).toEqual([null, 800]);
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
