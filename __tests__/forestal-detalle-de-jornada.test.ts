/**
 * Las jornadas de la tira de días y el detalle de un día de producción.
 *
 * Se prueba la cuenta pura —la que `ForestCtpDB.jornadasDeProduccion` delega
 * en `jornadasDesdeFilas`— porque de ella salen las cifras que el operador
 * compara contra el parte de la sierra:
 *
 *  · el detalle viaja SÓLO en producción;
 *  · las cifras contiguas CIERRAN: el PT de las especies suma el PT del día y
 *    el m³ de las clasificaciones suma el m³ declarado;
 *  · «TORNILLO» y «Tornillo» son una especie;
 *  · «sin trozas vinculadas» es la regla de Consumos (`corridaSinOrigen`): el
 *    volumen de entrada escrito no la salva — el 01/08 de Blas declaraba 142 m³
 *    de entrada y ninguna troza;
 *  · «no se declaró» no es «es propia»; seis corridas como mucho.
 */

import { describe, it, expect } from "vitest";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { corridaSinOrigen } from "@/lib/forestal/loctp-consumos-analisis";
import {
  clasificacionCorta,
  detalleDeJornada,
  jornadasDesdeFilas,
  SIN_CLASIFICACION,
  SIN_DUENO,
  SIN_ESPECIE,
  TOPE_CORRIDAS_DEL_DETALLE,
  type FilaDeJornada,
  type FilaDeLaSemana,
} from "@/lib/forestal/detalle-de-jornada";

const fila = (p: Partial<FilaDeJornada> = {}): FilaDeJornada => ({
  lineNo: 1,
  quantity: 1,
  unit: "m3",
  pieces: 0,
  volumeInputM3: null,
  consumos: 0,
  reprocesosEntrada: 0,
  speciesCommon: "Tornillo",
  duenoMadera: null,
  titularNombre: null,
  originCode: null,
  lineaProduccion: "LP",
  materiaPrimaRef: null,
  paquetes: [],
  ...p,
});

const delDia = (dia: string, p: Partial<FilaDeJornada> = {}): FilaDeLaSemana => ({ ...fila(p), dia });

describe("las jornadas de la semana", () => {
  it("en producción cada día trae su detalle, y el PT de sus especies suma el del día", () => {
    const js = jornadasDesdeFilas(
      [
        /* 0.0012 m³ = 0.51 PT: redondeando cada especie sola, darían 1 + 1 de más. */
        delDia("2026-09-17", { lineNo: 1, speciesCommon: "Tornillo", quantity: 0.0012, pieces: 3 }),
        delDia("2026-09-17", { lineNo: 2, speciesCommon: "Capirona", quantity: 0.0012, pieces: 2 }),
        delDia("2026-09-17", { lineNo: 3, speciesCommon: "Cumala", quantity: 1.2345 }),
        delDia("2026-09-15", { lineNo: 4, speciesCommon: "Tornillo", quantity: 5.6, unit: "m3" }),
      ],
      "produccion",
    );
    expect(js.map((j) => j.dia)).toEqual(["2026-09-15", "2026-09-17"]);
    for (const j of js) {
      expect(j.detalle).toBeDefined();
      expect(j.detalle!.especies.reduce((a, e) => a + e.pt, 0)).toBe(j.pt);
    }
    expect(js[1]).toMatchObject({ corridas: 3, m3: 1.2369, pt: Math.round(1.2369 * PT_POR_M3), piezas: 5 });
  });

  it("en consumo NO viaja el detalle: m³ de entrada y piezas del puente", () => {
    const [j] = jornadasDesdeFilas(
      [
        delDia("2026-09-17", { quantity: 3, volumeInputM3: "5.411", consumos: 12 }),
        delDia("2026-09-17", { lineNo: 2, quantity: 1, volumeInputM3: 1.2, consumos: 3 }),
      ],
      "consumo",
    );
    expect(j).toEqual({ dia: "2026-09-17", corridas: 2, m3: 6.611, pt: Math.round(6.611 * PT_POR_M3), piezas: 15 });
    expect("detalle" in j!).toBe(false);
  });

  it("en despacho tampoco, y el m³ sólo cuenta en m³", () => {
    const [j] = jornadasDesdeFilas(
      [delDia("2026-09-17", { quantity: 2, pieces: 4 }), delDia("2026-09-17", { lineNo: 2, unit: "pt", quantity: 900 })],
      "despacho",
    );
    expect(j).toEqual({ dia: "2026-09-17", corridas: 2, m3: 2, pt: 2 * PT_POR_M3, piezas: 4 });
  });
});

describe("especies", () => {
  it("van por m³ de mayor a menor, y la corrida sin especie tiene su renglón", () => {
    const d = detalleDeJornada([
      fila({ lineNo: 1, speciesCommon: "Tornillo", quantity: 1 }),
      fila({ lineNo: 2, speciesCommon: "Capirona", quantity: 3 }),
      fila({ lineNo: 3, speciesCommon: "   ", quantity: 0.5 }),
      fila({ lineNo: 4, speciesCommon: "Tornillo", quantity: 0.5 }),
    ]);
    expect(d.especies.map((e) => e.especie)).toEqual(["Capirona", "Tornillo", SIN_ESPECIE]);
    expect(d.especies[1]).toMatchObject({ especie: "Tornillo", corridas: 2, m3: 1.5 });
  });

  it("«TORNILLO» y «Tornillo» son una: se muestra el nombre de la corrida más vieja", () => {
    const d = detalleDeJornada([
      fila({ lineNo: 9, speciesCommon: "TORNILLO", quantity: 1 }),
      fila({ lineNo: 4, speciesCommon: "Tornillo", quantity: 2 }),
      fila({ lineNo: 7, speciesCommon: "tornillo (Cedrelinga cateniformis)", quantity: 0.5 }),
    ]);
    expect(d.especies).toEqual([{ especie: "Tornillo", corridas: 3, m3: 3.5, pt: Math.round(3.5 * PT_POR_M3) }]);
  });

  it("el m³ sólo se suma si el asiento está en m³: la corrida se cuenta igual", () => {
    const d = detalleDeJornada([
      fila({ lineNo: 1, unit: "pt", quantity: 500 }),
      fila({ lineNo: 2, unit: null, quantity: 2 }),
    ]);
    expect(d.especies).toEqual([{ especie: "Tornillo", corridas: 2, m3: 2, pt: 2 * PT_POR_M3 }]);
    expect(d.corridas.map((c) => c.m3)).toEqual([0, 2]);
  });

  it("lee el Decimal de Prisma sin romperse", () => {
    const d = detalleDeJornada([fila({ quantity: { valueOf: () => "1.5" } })]);
    expect(d.especies[0]!.m3).toBe(1.5);
  });
});

describe("clasificación", () => {
  it("agrupa los paquetes por producto y lo no detallado va a «Sin clasificación»", () => {
    const d = detalleDeJornada([
      /* Sin paquetes: todo lo declarado, con las piezas del asiento. */
      fila({ lineNo: 1, quantity: 0.3, pieces: 20 }),
      /* Con paquetes que detallan 0.3 de 0.5: el resto es «sin clasificación». */
      fila({
        lineNo: 2,
        quantity: 0.5,
        pieces: 15,
        paquetes: [
          { productType: "MADERA ASERRADA (COMERCIAL)", cantidad: 10, volumenM3: 0.2 },
          { productType: null, cantidad: 5, volumenM3: 0.1 },
        ],
      }),
    ]);
    expect(d.clasificaciones).toEqual([
      { producto: SIN_CLASIFICACION, piezas: 25, m3: 0.6 },
      { producto: "MADERA ASERRADA (COMERCIAL)", piezas: 10, m3: 0.2 },
    ]);
    const m3 = d.clasificaciones.reduce((a, c) => a + c.m3, 0);
    expect(m3).toBeCloseTo(0.8, 4);
    expect(d.paquetes).toBe(2);
  });

  it("un sobrante menor a un litro no inventa un renglón", () => {
    const d = detalleDeJornada([
      fila({
        quantity: 0.2005,
        paquetes: [{ productType: "MADERA ASERRADA (TABLA)", cantidad: 4, volumenM3: 0.2 }],
      }),
    ]);
    expect(d.clasificaciones.map((c) => c.producto)).toEqual(["MADERA ASERRADA (TABLA)"]);
  });

  it("se lee corta sin perder qué es", () => {
    expect(clasificacionCorta("MADERA ASERRADA (PAQUETERIA LARGA)")).toBe("PAQUETERIA LARGA");
    expect(clasificacionCorta("MADERA ASERRADA (COMERCIAL)")).toBe("COMERCIAL");
    expect(clasificacionCorta("MADERA ASERRADA")).toBe("MADERA ASERRADA");
    expect(clasificacionCorta("Tablillas")).toBe("Tablillas");
    expect(clasificacionCorta(SIN_CLASIFICACION)).toBe(SIN_CLASIFICACION);
  });
});

describe("dueño de la madera", () => {
  it("sin elección dice «Sin declarar» — nunca «del centro»", () => {
    const d = detalleDeJornada([
      fila({ lineNo: 1 }),
      fila({ lineNo: 2, duenoMadera: "tercero", titularNombre: "CC.NN. San Luis" }),
      fila({ lineNo: 3, duenoMadera: "tercero", titularNombre: "CC.NN. San Luis" }),
      fila({ lineNo: 4, duenoMadera: "propia" }),
      /* Un valor que el libro no entiende no se lee como uno de los dos. */
      fila({ lineNo: 5, duenoMadera: "quien sabe" }),
    ]);
    expect(d.duenos).toEqual([
      { etiqueta: "De tercero · CC.NN. San Luis", corridas: 2 },
      { etiqueta: SIN_DUENO, corridas: 2 },
      { etiqueta: "Del centro", corridas: 1 },
    ]);
  });
});

describe("sin trozas vinculadas = la regla de Consumos", () => {
  it("`corridaSinOrigen`: ni consumo ni reproceso", () => {
    expect(corridaSinOrigen({ consumos: 0, reprocesos: 0 })).toBe(true);
    expect(corridaSinOrigen({ consumos: 2, reprocesos: 0 })).toBe(false);
    expect(corridaSinOrigen({ consumos: 0, reprocesos: 1 })).toBe(false);
  });

  it("el volumen de entrada escrito NO la salva; un consumo o un reproceso sí", () => {
    const d = detalleDeJornada([
      fila({ lineNo: 1 }), // sin nada
      fila({ lineNo: 2, volumeInputM3: 5.411 }), // declaró entrada, sin trozas: sigue sin origen
      fila({ lineNo: 3, consumos: 3 }), // consumió trozas
      fila({ lineNo: 4, reprocesosEntrada: 1 }), // nació de un reproceso (ADR-316)
      fila({ lineNo: 5, materiaPrimaRef: "15-2026" }), // el texto no es consumo
    ]);
    expect(d.sinMateriaPrima).toBe(3);
  });

  it("el 01/08 de Blas: 5 corridas con 142 m³ de entrada y 0 trozas son 5 sin trozas", () => {
    const entradas = [27.522, 5.411, 6.381, 67.691, 35.257];
    const d = detalleDeJornada(entradas.map((v, i) => fila({ lineNo: 15 + i, volumeInputM3: v })));
    expect(d.sinMateriaPrima).toBe(5);
  });
});

describe("corridas, permisos y líneas", () => {
  it("muestra hasta seis corridas, en orden de libro", () => {
    const filas = Array.from({ length: 8 }, (_, i) =>
      fila({ lineNo: 8 - i, speciesCommon: i === 7 ? "" : "Tornillo", materiaPrimaRef: "  15-2026 " }),
    );
    const d = detalleDeJornada(filas);
    expect(d.corridas).toHaveLength(TOPE_CORRIDAS_DEL_DETALLE);
    expect(d.corridas.map((c) => c.lineNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(d.corridas[0]).toEqual({ lineNo: 1, especie: null, m3: 1, materiaPrimaRef: "15-2026" });
  });

  it("permisos y líneas distintos y sin vacíos", () => {
    const d = detalleDeJornada([
      fila({ lineNo: 1, originCode: "19-SEC/REG-PLT-2026-032", lineaProduccion: "LP" }),
      fila({ lineNo: 2, originCode: " 19-SEC/REG-PLT-2026-032 ", lineaProduccion: "L2" }),
      fila({ lineNo: 3, originCode: "", lineaProduccion: null }),
    ]);
    expect(d.permisos).toEqual(["19-SEC/REG-PLT-2026-032"]);
    expect(d.lineas).toEqual(["L2", "LP"]);
  });

  it("un día sin corridas no inventa renglones", () => {
    expect(detalleDeJornada([])).toEqual({
      especies: [],
      clasificaciones: [],
      duenos: [],
      permisos: [],
      lineas: [],
      sinMateriaPrima: 0,
      paquetes: 0,
      piezasSinCuadrar: [],
      corridas: [],
    });
  });
});

describe("piezas: la regla del casillero es la del resumen (23-09)", () => {
  it("cuentan las de los paquetes; las del asiento sólo si ningún paquete trae cantidad", async () => {
    const { piezasDeLaCorrida } = await import("@/lib/forestal/detalle-de-jornada");
    expect(piezasDeLaCorrida([{ cantidad: 200 }, { cantidad: 136 }], 156)).toBe(336);
    expect(piezasDeLaCorrida([{ cantidad: null }], 156)).toBe(156);
    expect(piezasDeLaCorrida([], null)).toBe(0);
  });
});
