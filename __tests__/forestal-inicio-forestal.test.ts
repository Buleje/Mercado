import { describe, expect, it } from "vitest";
import { agruparMovimiento } from "@/lib/forestal/movimiento-libro";
import { cascadaDelPlan } from "@/lib/forestal/loth-saldo-cascada";
import {
  cantidadDelPeriodo,
  guiasLothDelPeriodo,
  permisoInicio,
  puedeVerInicioForestal,
  serieSemanal,
} from "@/lib/forestal/inicio-forestal";

const d = (s: string) => new Date(`${s}T12:00:00.000Z`);

/** Un mes con movimiento repartido: ingresos, corridas y despachos en días sueltos. */
function movimientoDeSetiembre(paso?: "dia" | "semana") {
  return agruparMovimiento({
    ingresos: [
      { fecha: d("2026-09-01"), volumenM3: 10.5 },
      { fecha: d("2026-09-03"), volumenM3: 4.25 },
      { fecha: d("2026-09-15"), volumenM3: 7 },
      { fecha: d("2026-09-30"), volumenM3: 1.125 },
    ],
    corridas: [
      { fecha: d("2026-09-02"), consumidoM3: 6, producido: 2.4, unidad: "m3" },
      { fecha: d("2026-09-16"), consumidoM3: 5, producido: 2, unidad: "m3" },
      { fecha: d("2026-09-28"), consumidoM3: 1, producido: 300, unidad: "pt" },
    ],
    despachos: [
      { fecha: d("2026-09-07"), cantidad: 1.5 },
      { fecha: d("2026-09-29"), cantidad: 2 },
    ],
    desde: new Date("2026-09-01T05:00:00.000Z"),
    hasta: new Date("2026-09-30T23:00:00.000Z"),
    paso,
  });
}

describe("serieSemanal", () => {
  it("agrupar los días del Tablero en semanas da lo mismo que pedirle semanas al Tablero", () => {
    const diario = movimientoDeSetiembre();
    expect(diario.paso).toBe("dia");
    const semanal = serieSemanal(diario);
    const delTablero = movimientoDeSetiembre("semana");
    expect(semanal.paso).toBe("semana");
    expect(semanal.puntos.map((p) => [p.fecha, p.ingresoM3, p.producido, p.despachado])).toEqual(
      delTablero.puntos.map((p) => [p.fecha, p.ingresoM3, p.producido, p.despachado]),
    );
  });

  it("la suma de las semanas es el total del período (no se pierde ni se inventa madera)", () => {
    const diario = movimientoDeSetiembre();
    const { puntos } = serieSemanal(diario);
    const suma = (k: "ingresoM3" | "producido" | "despachado") =>
      Math.round(puntos.reduce((a, p) => a + p[k], 0) * 10_000) / 10_000;
    expect(suma("ingresoM3")).toBe(diario.totales.ingresoM3);
    expect(suma("producido")).toBe(diario.totales.producido);
    expect(suma("despachado")).toBe(diario.totales.despachado);
  });

  it("las semanas arrancan lunes y se rotulan por su lunes", () => {
    const { puntos } = serieSemanal(movimientoDeSetiembre());
    expect(puntos[0].fecha).toBe("2026-08-31"); // el 1/09/2026 es martes
    expect(puntos[0].etiqueta).toBe("31/08");
    expect(puntos.every((p) => new Date(`${p.fecha}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
  });

  it("con meses ya armados devuelve el eje del Tablero tal cual", () => {
    const mensual = serieSemanal({
      paso: "mes",
      puntos: [{ fecha: "2026-01-01", ingresoM3: 3, consumoM3: 1, producido: 1, despachado: 0, rendimiento: 0 }],
    });
    expect(mensual.paso).toBe("mes");
    expect(mensual.puntos).toEqual([
      { fecha: "2026-01-01", etiqueta: "ene 26", ingresoM3: 3, producido: 1, despachado: 0 },
    ]);
  });
});

describe("guiasLothDelPeriodo", () => {
  const gtfs = [
    { status: "emitida", gtfDate: "2026-09-01T00:00:00.000Z", createdAt: "2026-09-02T15:00:00.000Z" },
    { status: "emitida", gtfDate: "2026-09-30T00:00:00.000Z", createdAt: "2026-10-01T15:00:00.000Z" },
    { status: "anulada", gtfDate: "2026-09-10T00:00:00.000Z", createdAt: "2026-09-10T15:00:00.000Z" },
    { status: "emitida", gtfDate: "2026-10-01T00:00:00.000Z", createdAt: "2026-10-01T15:00:00.000Z" },
    { status: "emitida", gtfDate: null, createdAt: "2026-09-20T15:00:00.000Z" },
  ];

  it("cuenta por el día de la guía (date-only en UTC), ambos bordes incluidos", () => {
    expect(guiasLothDelPeriodo(gtfs, "2026-09-01", "2026-09-30")).toEqual({ emitidas: 3, anuladas: 1 });
  });

  it("sin fecha de guía cuenta el día en que se anotó", () => {
    expect(guiasLothDelPeriodo(gtfs, "2026-09-20", "2026-09-20")).toEqual({ emitidas: 1, anuladas: 0 });
  });
});

describe("permisoInicio", () => {
  it("toma el total de la cascada del permiso sin recalcularlo", () => {
    const { total } = cascadaDelPlan([
      { species: "Bolaina", cites: false, autorizado: 100, talado: 40, trozado: 38, movilizado: 12, consumido: 0 },
      { species: "Capirona", cites: false, autorizado: 50, talado: 10, trozado: 10, movilizado: 0, consumido: 0 },
    ]);
    const p = permisoInicio(
      { id: "p1", planNumber: " 19-SEC/REG-PLT-2025-096 ", planType: "PLANTACION" },
      total,
      [{ taladoM3: 1.5 }, { taladoM3: 2.25 }],
    );
    expect(p).toMatchObject({
      numero: "19-SEC/REG-PLT-2025-096",
      baseM3: 150,
      taladoM3: 50,
      despachadoM3: 12,
      enPieM3: 100,
      pctTalado: 33.3,
      excedido: false,
      taladoSinRegistrarM3: 3.75,
    });
  });
});

describe("puedeVerInicioForestal", () => {
  it("los roles del libro y el management tier la ven; el cajero no (recibiría un 403)", () => {
    expect(["admin", "owner", "manager", "almacenero"].map((r) => puedeVerInicioForestal(r as never))).toEqual([true, true, true, true]);
    expect(puedeVerInicioForestal("cajero")).toBe(false);
    expect(puedeVerInicioForestal(null)).toBe(false);
  });
});

describe("cantidadDelPeriodo — producido y despachado llevan unidad sólo si es una", () => {
  const periodo = { desde: new Date("2026-09-01T05:00:00.000Z"), hasta: new Date("2026-09-30T23:00:00.000Z") };

  it("despacho en pt no lleva m³", () => {
    const mov = agruparMovimiento({
      ingresos: [],
      corridas: [],
      despachos: [{ fecha: d("2026-09-07"), cantidad: 300, unidad: "pt" }],
      ...periodo,
    });
    expect(mov.totales.unidadDespachado).toBe("pt");
    const texto = cantidadDelPeriodo(mov.totales.despachado, mov.totales.unidadDespachado);
    expect(texto).not.toMatch(/m³/);
    expect(texto).toMatch(/^300[.,]00 pt$/);
  });

  it("si el período mezcla m³ con pt, el total va SIN unidad, como el Tablero", () => {
    const mov = agruparMovimiento({
      ingresos: [],
      corridas: [],
      despachos: [
        { fecha: d("2026-09-07"), cantidad: 1.5, unidad: "m3" },
        { fecha: d("2026-09-08"), cantidad: 300, unidad: "pt" },
      ],
      ...periodo,
    });
    expect(mov.totales.unidadDespachado).toBeNull();
    expect(cantidadDelPeriodo(mov.totales.despachado, mov.totales.unidadDespachado)).toMatch(/^301[.,]50$/);
    /* Setiembre: dos corridas en m³ y una en pt → producido sin unidad. */
    expect(movimientoDeSetiembre().totales.unidadProducido).toBeNull();
  });

  it("todo en m³ (o sin unidad declarada, el default del libro) sí lleva m³", () => {
    const mov = movimientoDeSetiembre();
    expect(mov.totales.unidadDespachado).toBe("m3");
    expect(cantidadDelPeriodo(mov.totales.despachado, mov.totales.unidadDespachado)).toMatch(/^3[.,]50 m³$/);
  });
});
