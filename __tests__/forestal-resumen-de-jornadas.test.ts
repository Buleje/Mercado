/**
 * El resumen de jornadas en tres cortes (Brandon, 2026-09-23): por especie,
 * por día, y por día · especie · tipo. Lo que se prueba es que las cifras
 * contiguas CIERREN: el PT de cada día es el de su casillero, y todo lo demás
 * son sumas de eso.
 */
import { describe, expect, it } from "vitest";
import { resumirJornadas, SIN_PRODUCTO, type CorridaParaResumen } from "@/lib/forestal/resumen-de-jornadas";
import { jornadasDesdeFilas } from "@/lib/forestal/detalle-de-jornada";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";

let n = 0;
const corrida = (dia: string, especie: string | null, paquetes: [string | null, number, number][], extra: Partial<CorridaParaResumen> = {}): CorridaParaResumen => ({
  id: `c${++n}`,
  lineNo: n,
  dia,
  especie,
  linea: null,
  dueno: "Del centro",
  m3: paquetes.reduce((a, [, , m3]) => a + m3, 0),
  piezasAsiento: 0,
  materiaPrimaRef: null,
  paquetes: paquetes.map(([productType, cantidad, volumenM3]) => ({ productType, cantidad, volumenM3 })),
  ...extra,
});

/* Una semana chica con volúmenes que NO caen en PT enteros. */
const LUNES = "2026-09-21";
const MARTES = "2026-09-22";
const semana = [
  corrida(LUNES, "Tornillo", [["Comercial", 40, 0.4123], ["Tabla", 11, 0.0891]], { linea: "Sierra 1" }),
  corrida(LUNES, "TORNILLO", [["Comercial", 20, 0.2007]]),
  corrida(LUNES, "Cumala", [["Comercial", 8, 0.0617]], { linea: "Sierra 2" }),
  corrida(MARTES, "Tornillo", [["Paq. corta", 30, 0.3333]]),
  corrida(MARTES, "Cumala", [["Comercial", 5, 0.0412], ["Tabla", 3, 0.0209]]),
];

describe("resumirJornadas — por día", () => {
  const r = resumirJornadas([LUNES, MARTES], semana);

  it("un renglón por día, en orden, con sus corridas, piezas y líneas", () => {
    expect(r.porDia.map((d) => d.dia)).toEqual([LUNES, MARTES]);
    expect(r.porDia[0]).toMatchObject({ corridas: 3, piezas: 79, lineas: ["Sierra 1", "Sierra 2"] });
    expect(r.porDia[1]).toMatchObject({ corridas: 2, piezas: 38, lineas: [] });
  });

  it("el PT de cada día es el de su casillero en la tira (jornadasDesdeFilas)", () => {
    const casilleros = jornadasDesdeFilas(
      semana.map((c) => ({
        dia: c.dia, lineNo: c.lineNo, quantity: c.m3, unit: "m3", pieces: 0, volumeInputM3: null,
        consumos: 0, reprocesosEntrada: 0, speciesCommon: c.especie, duenoMadera: null, titularNombre: null,
        originCode: null, lineaProduccion: c.linea, materiaPrimaRef: null, paquetes: c.paquetes,
      })),
      "produccion",
    );
    for (const d of r.porDia) {
      expect(d.pt).toBe(casilleros.find((c) => c.dia === d.dia)?.pt);
      expect(d.pt).toBe(Math.round(d.m3 * PT_POR_M3));
    }
  });

  it("especies y tipos de cada día suman exactamente el día", () => {
    for (const d of r.porDia) {
      expect(d.especies.reduce((a, e) => a + e.pt, 0)).toBe(d.pt);
      for (const e of d.especies) {
        expect(e.productos.reduce((a, p) => a + p.pt, 0)).toBe(e.pt);
        expect(e.productos.reduce((a, p) => a + p.piezas, 0)).toBe(e.piezas);
      }
    }
  });

  it("«TORNILLO» y «Tornillo» son una especie, con el nombre de la primera corrida", () => {
    const lunes = r.porDia[0]!;
    expect(lunes.especies.map((e) => e.especie)).toEqual(["Tornillo", "Cumala"]);
    const tornillo = lunes.especies[0]!;
    expect(tornillo.corridas).toBe(2);
    expect(tornillo.productos.map((p) => [p.producto, p.piezas])).toEqual([["Comercial", 60], ["Tabla", 11]]);
  });
});

describe("resumirJornadas — la semana y por especie cierran con los días", () => {
  const r = resumirJornadas([LUNES, MARTES], semana);

  it("el total es la suma de los días", () => {
    expect(r.totales.pt).toBe(r.porDia.reduce((a, d) => a + d.pt, 0));
    expect(r.totales.piezas).toBe(117);
    expect(r.totales.corridas).toBe(5);
  });

  it("cada especie de la semana es la suma de esa especie en cada día", () => {
    for (const e of r.porEspecie) {
      const enLosDias = r.porDia.flatMap((d) => d.especies.filter((x) => x.especie === e.especie));
      expect(e.pt).toBe(enLosDias.reduce((a, x) => a + x.pt, 0));
      expect(e.piezas).toBe(enLosDias.reduce((a, x) => a + x.piezas, 0));
    }
    expect(r.porEspecie.reduce((a, e) => a + e.pt, 0)).toBe(r.totales.pt);
  });
});

describe("resumirJornadas — lo que el libro deja a medias", () => {
  it("lo declarado sin paquete va a «Sin producto declarado», con las piezas del asiento", () => {
    const r = resumirJornadas([LUNES], [
      corrida(LUNES, "Moena", [], { m3: 0.5, piezasAsiento: 12 }),
    ]);
    expect(r.porDia[0]!.especies[0]!.productos).toEqual([
      { producto: SIN_PRODUCTO, piezas: 12, m3: 0.5, pt: 212 },
    ]);
  });

  it("un asiento en otra unidad no suma volumen (no se convierte a ojo)", () => {
    const r = resumirJornadas([LUNES], [corrida(LUNES, "Moena", [], { m3: 0, piezasAsiento: 4 })]);
    expect(r.porDia[0]).toMatchObject({ m3: 0, pt: 0, piezas: 4 });
  });

  it("sin corridas, todo vacío y en cero", () => {
    const r = resumirJornadas([LUNES], []);
    expect(r).toMatchObject({ porDia: [], porEspecie: [], totales: { corridas: 0, piezas: 0, m3: 0, pt: 0 } });
  });
});

describe("resumirJornadas — elegir dueños de un día (2026-09-23)", () => {
  const conDueno = (c: CorridaParaResumen, dueno: string) => ({ ...c, dueno });
  const dia = [
    conDueno(corrida(LUNES, "Tornillo", [["Comercial", 10, 0.2]]), "De tercero · WASACO"),
    conDueno(corrida(LUNES, "Tornillo", [["Comercial", 5, 0.1]]), "Del centro"),
    conDueno(corrida(MARTES, "Cumala", [["Tabla", 4, 0.05]]), "De tercero · WASACO"),
  ];

  it("sin filtro entran los dos dueños y el día los nombra", () => {
    const r = resumirJornadas([LUNES, MARTES], dia);
    expect(r.porDia[0]!.duenos).toEqual(["De tercero · WASACO", "Del centro"]);
    expect(r.porDia[0]!.piezas).toBe(15);
  });

  it("con uno elegido, ese día sólo cuenta ése — los otros días entran enteros", () => {
    const r = resumirJornadas([LUNES, MARTES], dia, { [LUNES]: ["Del centro"] });
    expect(r.porDia.map((d) => [d.dia, d.piezas, d.duenos])).toEqual([
      [LUNES, 5, ["Del centro"]],
      [MARTES, 4, ["De tercero · WASACO"]],
    ]);
    expect(r.totales).toMatchObject({ corridas: 2, piezas: 9 });
    expect(r.corridas.map((c) => c.dueno)).toEqual(["Del centro", "De tercero · WASACO"]);
  });
});

describe("elegir dueños en la barra de días marcados", () => {
  const A = "Del centro";
  const B = "De tercero · WASACO";

  it("sacar uno se puede; sacar el último no (para eso se desmarca el día)", async () => {
    const { alternarDuenoExcluido } = await import("@/lib/forestal/resumen-de-jornadas");
    expect(alternarDuenoExcluido([], [A, B], B)).toEqual([B]);
    expect(alternarDuenoExcluido([B], [A, B], A)).toEqual([B]);
    expect(alternarDuenoExcluido([B], [A, B], B)).toEqual([]);
  });

  it("el filtro sólo lleva los días recortados, con los que quedan", async () => {
    const { filtroDeDuenos } = await import("@/lib/forestal/resumen-de-jornadas");
    expect(filtroDeDuenos([LUNES, MARTES], { [LUNES]: [A, B], [MARTES]: [A, B] }, { [LUNES]: [B] })).toEqual({ [LUNES]: [A] });
    expect(filtroDeDuenos([MARTES], { [LUNES]: [A, B] }, { [LUNES]: [B] })).toEqual({});
  });
});
