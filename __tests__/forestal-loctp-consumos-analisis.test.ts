import { describe, expect, it } from "vitest";
import {
  agregarSinOrigen,
  agruparConsumos,
  juzgarRendimientoConsumo,
  resumenConsumos,
} from "@/lib/forestal/loctp-consumos-analisis";
import type { FilaConsumo, GrafoConsumos } from "@/lib/forestal/loctp-consumos";

const fila = (over: Partial<FilaConsumo> = {}): FilaConsumo => ({
  nro: 1,
  fecha: "2026-07-14T00:00:00.000Z",
  tipoProducto: "rolliza",
  especieComun: "Tornillo",
  especieCientifica: "Cedrelinga cateniformis",
  codigoOrigen: "CON-25-UCA-0142",
  fuenteOrigen: "",
  unidad: "m3",
  cantidad: 5,
  lote: "",
  observaciones: "Corrida #95001",
  gtf: "001-0000201",
  woodEntryId: "w1",
  corridaId: "c1",
  ...over,
});

const grafo = (over: Partial<GrafoConsumos> = {}): GrafoConsumos => ({
  ingresos: [{ id: "w1", gtf: "001-0000201", species: "Tornillo" }],
  corridas: [
    { id: "c1", lineNo: 95001, label: "Madera aserrada · Tornillo", unit: "m3", fecha: "2026-07-14" },
  ],
  consumos: [{ from: "w1", to: "c1", volumeM3: 5 }],
  ...over,
});

describe("agruparConsumos — leer doscientas filas sin leerlas", () => {
  const filas = [
    fila({ especieComun: "Tornillo", cantidad: 5, gtf: "G1" }),
    fila({ especieComun: "Copaiba", cantidad: 6, gtf: "G2" }),
    fila({ especieComun: "Tornillo", cantidad: 4, gtf: "G2" }),
  ];

  it("suma por especie y ordena por lo que más pesa", () => {
    const g = agruparConsumos(filas, "especie");
    expect(g.map((x) => x.clave)).toEqual(["Tornillo", "Copaiba"]);
    expect(g[0].cantidad).toBe(9);
    // Tornillo salió de DOS guías distintas: eso es lo que dice si el grupo
    // mezcla orígenes.
    expect(g[0].guias).toBe(2);
  });

  it("agrupa por guía cuando la pregunta es «qué salió de esta guía»", () => {
    const g = agruparConsumos(filas, "guia");
    expect(g.map((x) => x.clave)).toEqual(["G2", "G1"]);
    expect(g[0].cantidad).toBe(10);
  });

  it("dos grupos con la misma cantidad desempatan alfabéticamente", () => {
    const g = agruparConsumos(
      [fila({ especieComun: "Tornillo", cantidad: 8 }), fila({ especieComun: "Copaiba", cantidad: 8 })],
      "especie",
    );
    expect(g.map((x) => x.clave)).toEqual(["Copaiba", "Tornillo"]);
  });

  it("sin agrupación no arma grupos: la lista plana ya es la respuesta", () => {
    expect(agruparConsumos(filas, "ninguna")).toEqual([]);
  });

  it("una fila sin especie no se pierde: cae en su propio grupo", () => {
    const g = agruparConsumos([fila({ especieComun: "" })], "especie");
    expect(g).toHaveLength(1);
    expect(g[0].clave).toBe("—");
  });
});

describe("resumenConsumos — el rendimiento, o nada", () => {
  it("mide producido contra consumido de LO QUE SE ESTÁ VIENDO", () => {
    const r = resumenConsumos([fila({ cantidad: 10 })], grafo({
      corridas: [{ id: "c1", lineNo: 1, label: "x", unit: "m3", fecha: "" }],
      consumos: [{ from: "w1", to: "c1", volumeM3: 10 }],
    } as Partial<GrafoConsumos>));
    expect(r.consumido).toBe(10);
  });

  it("55 % de 10 m³ consumidos son 5.5 producidos", () => {
    const g = grafo();
    (g.corridas[0] as { quantity?: number }).quantity = 5.5;
    const r = resumenConsumos([fila({ cantidad: 10 })], g);
    expect(r.producido).toBe(5.5);
    expect(r.rendimientoPct).toBe(55);
  });

  it("NO inventa el porcentaje si la corrida produce en otra unidad", () => {
    // Dividir pies tablares por metros cúbicos da un número que no significa
    // nada; el libro no declara el factor, así que se dice y no se calcula.
    const g = grafo();
    g.corridas[0].unit = "pt";
    (g.corridas[0] as { quantity?: number }).quantity = 1200;
    const r = resumenConsumos([fila({ cantidad: 10 })], g);
    expect(r.rendimientoPct).toBeNull();
    expect(r.corridasOtraUnidad).toBe(1);
    expect(r.producido).toBe(0);
  });

  it("sin consumo no hay rendimiento (y no divide por cero)", () => {
    expect(resumenConsumos([], grafo()).rendimientoPct).toBeNull();
  });

  it("la corrida que produjo sin declarar origen SIEMPRE se lista, aunque el filtro no la alcance", () => {
    // El hueco se mide contra el grafo completo: esconderlo porque el filtro no
    // llega es justo lo que rompe la cadena sin que nadie lo note.
    const g = grafo({
      corridas: [
        { id: "c1", lineNo: 1, label: "Aserrada · Tornillo", unit: "m3", fecha: "" },
        { id: "c9", lineNo: 9, label: "Aserrada · Copaiba", unit: "m3", fecha: "" },
      ],
      consumos: [{ from: "w1", to: "c1", volumeM3: 5 }],
    });
    const r = resumenConsumos([fila()], g);
    expect(r.corridasSinOrigen).toHaveLength(1);
    expect(r.corridasSinOrigen[0].lineNo).toBe(9);
    // Lleva el label porque el N° se repite en el libro real.
    expect(r.corridasSinOrigen[0].label).toBe("Aserrada · Copaiba");
  });

  it("suma lo producido SIN respaldo: es lo que se mide, no cuántas corridas", () => {
    const g = grafo({
      corridas: [
        { id: "c1", lineNo: 1, label: "a", unit: "m3", fecha: "" },
        { id: "c8", lineNo: 8, label: "b", unit: "m3", fecha: "" },
        { id: "c9", lineNo: 9, label: "c", unit: "m3", fecha: "" },
      ],
      consumos: [{ from: "w1", to: "c1", volumeM3: 5 }],
    });
    (g.corridas[1] as { quantity?: number }).quantity = 3;
    (g.corridas[2] as { quantity?: number }).quantity = 1.5;
    expect(resumenConsumos([fila()], g).producidoSinOrigen).toBe(4.5);
  });

  it("sin grafo devuelve lo que puede, no rompe", () => {
    const r = resumenConsumos([fila({ cantidad: 4 })], null);
    expect(r).toMatchObject({ consumido: 4, producido: 0, rendimientoPct: null, corridasSinOrigen: [] });
  });
});

describe("juzgarRendimientoConsumo", () => {
  it("marca lo bajo, lo normal y lo imposible", () => {
    expect(juzgarRendimientoConsumo(32).tono).toBe("aviso");
    expect(juzgarRendimientoConsumo(55).tono).toBe("ok");
    expect(juzgarRendimientoConsumo(88).tono).toBe("malo");
  });

  it("sin dato no opina", () => {
    expect(juzgarRendimientoConsumo(null).tono).toBe("neutro");
  });
});

/* ── Corridas sin origen para los pendientes del libro ────────────────────────
   Hasta 2026-09-19 el pendiente «corridas sin materia prima» estaba hardcodeado
   en 0 en `use-ctp-pendientes.ts`: el único que bloquea el cierre no se disparó
   nunca. `agregarSinOrigen` es la cuenta que ahora lo alimenta, con LA regla
   (`corridaSinOrigen`) y no una segunda copia. Medido contra el tenant QA el
   día que se cableó: 5 de 14 corridas, 14,2525 m³, y el grafo del Radar dio los
   mismos 5 por la otra vía. */
describe("agregarSinOrigen — el pendiente que nunca se disparaba", () => {
  const corrida = (over: Partial<{ quantity: number; unit: string; consumos: number; reprocesos: number }> = {}) => ({
    quantity: 10,
    unit: "m3",
    consumos: 0,
    reprocesos: 0,
    ...over,
  });

  it("cuenta la corrida a la que no le llega ni consumo ni reproceso", () => {
    expect(agregarSinOrigen([corrida()])).toMatchObject({ corridas: 1, producidoM3: 10 });
  });

  it("no cuenta la que tiene consumo, ni la que tiene reproceso (ADR-316)", () => {
    const r = agregarSinOrigen([corrida({ consumos: 1 }), corrida({ reprocesos: 1 })]);
    expect(r).toMatchObject({ corridas: 0, producidoM3: 0 });
  });

  it("el volumen de entrada declarado NO da origen: sin arista, sigue huérfana", () => {
    // La corrida del 01/08 de Blas declaraba 142 m³ de entrada y ninguna troza.
    const r = agregarSinOrigen([corrida({ quantity: 142 })]);
    expect(r.corridas).toBe(1);
  });

  it("una corrida en PT se cuenta, pero su cifra no entra en el total de m³", () => {
    const r = agregarSinOrigen([corrida({ unit: "pt", quantity: 2374 }), corrida({ quantity: 4.25 })]);
    expect(r).toMatchObject({ corridas: 2, producidoM3: 4.25 });
  });

  it("redondea a 4 decimales, como el resto del libro", () => {
    const r = agregarSinOrigen([corrida({ quantity: 1.00005 }), corrida({ quantity: 2.00005 })]);
    expect(r.producidoM3).toBe(3.0001);
  });

  it("sin corridas devuelve cero, no null", () => {
    expect(agregarSinOrigen([])).toMatchObject({ corridas: 0, producidoM3: 0, detalle: [] });
  });
});

/* El detalle existe para que el pendiente pueda nombrar la corrida que DECLARA
   madera de entrada y no tiene ni una troza: es la que un fiscalizador mira
   primero, y decir sólo «N corridas» la promedia con las que no declararon nada. */
describe("agregarSinOrigen — el detalle pone primero lo que más duele", () => {
  const conId = (over: Partial<{ id: string; volumeInputM3: number; entryDate: string; lineNo: number }> = {}) => ({
    quantity: 1, unit: "m3", consumos: 0, reprocesos: 0,
    id: "x", lineNo: 1, entryDate: "2026-08-01", volumeInputM3: 0, ...over,
  });

  it("ordena por volumen declarado, de mayor a menor", () => {
    const r = agregarSinOrigen([
      conId({ id: "chica", volumeInputM3: 5.41 }),
      conId({ id: "grande", volumeInputM3: 67.69 }),
      conId({ id: "sin-declarar", volumeInputM3: 0 }),
    ]);
    expect(r.detalle.map((c) => c.id)).toEqual(["grande", "chica", "sin-declarar"]);
  });

  it("no lista la corrida que SÍ tiene origen", () => {
    const r = agregarSinOrigen([conId({ id: "a" }), { ...conId({ id: "b" }), consumos: 1 }]);
    expect(r.detalle.map((c) => c.id)).toEqual(["a"]);
  });

  it("una corrida en PT lleva su unidad y `producido` nulo: no se suma a los m³", () => {
    const r = agregarSinOrigen([conId({ id: "pt" , unit: "pt" } as never)]);
    expect(r.detalle[0]).toMatchObject({ unidad: "pt", producido: null });
    expect(r.producidoM3).toBe(0);
  });

  it("sin id no hay fila en el detalle, pero sí cuenta en el total", () => {
    const r = agregarSinOrigen([{ quantity: 3, unit: "m3", consumos: 0, reprocesos: 0 }]);
    expect(r.corridas).toBe(1);
    expect(r.detalle).toEqual([]);
  });
});
