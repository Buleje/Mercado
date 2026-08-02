import { describe, expect, it } from "vitest";
import {
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
