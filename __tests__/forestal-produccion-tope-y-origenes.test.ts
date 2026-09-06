import { describe, expect, it } from "vitest";
import {
  MARGEN_MINIMO_M3,
  RENDIMIENTO_TOPE_PCT,
  corridasAMedioDeclarar,
  margenDeclarableM3,
  motivosParaGuardar,
  corridasSobreTope,
  origenesDeTrozas,
  type CorridaParaTope,
  type PaqueteBorrador,
  repartirEntreOrigenes,
  sugerirCodigoPaquete,
  topeDeclarableM3,
} from "@/lib/forestal/produccion-paquetes";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";

describe("el tope de rendimiento", () => {
  it("es el MISMO 0.56 del catálogo, no una constante paralela", () => {
    // Dos constantes para el mismo número ya divergieron una vez (56 vs 75).
    expect(RENDIMIENTO_TOPE_PCT).toBe(56);
    // `0.56 * 100` da 56.00000000000001: el tope se guarda redondo a propósito.
    expect(RENDIMIENTO_TOPE_PCT).toBeCloseTo(RENDIMIENTO_META * 100, 6);
    expect(Number.isInteger(RENDIMIENTO_TOPE_PCT)).toBe(true);
  });

  it("de 10 m³ de troza no salen más de 5.6 de tabla", () => {
    expect(topeDeclarableM3(10)).toBe(5.6);
    expect(topeDeclarableM3(8)).toBe(4.48);
  });

  it("trunca en vez de redondear: redondear hacia arriba deja pasar el tope", () => {
    // 1.00001 × 0.56 = 0.5600056 → 0.5600, nunca 0.5601.
    expect(topeDeclarableM3(1.00001)).toBe(0.56);
  });

  it("sin materia prima no hay nada declarable", () => {
    expect(topeDeclarableM3(0)).toBe(0);
    expect(topeDeclarableM3(-5)).toBe(0);
  });

  it("el margen dice cuánto MÁS entra", () => {
    expect(margenDeclarableM3(10, 0)).toBe(5.6);
    expect(margenDeclarableM3(10, 4)).toBe(1.6);
    expect(margenDeclarableM3(10, 5.6)).toBe(0);
  });

  it("pasado el tope el margen es 0, nunca negativo", () => {
    // Con un margen negativo el formulario ofrecería «agregar −2 m³».
    expect(margenDeclarableM3(10, 9)).toBe(0);
  });
});

describe("origenesDeTrozas", () => {
  it("agrupa por título habilitante y ordena por volumen", () => {
    expect(
      origenesDeTrozas([
        { permiso: "CON-25-UCA-0142", volumenM3: 3 },
        { permiso: "PMF-01", volumenM3: 5 },
        { permiso: "CON-25-UCA-0142", volumenM3: 4 },
      ]),
    ).toEqual([
      { permiso: "CON-25-UCA-0142", volumenM3: 7, piezas: 2 },
      { permiso: "PMF-01", volumenM3: 5, piezas: 1 },
    ]);
  });

  it("las trozas sin permiso se agrupan y se NOMBRAN, no se descartan", () => {
    const r = origenesDeTrozas([{ permiso: "  ", volumenM3: 2 }, { permiso: null, volumenM3: 1 }]);
    expect(r).toEqual([{ permiso: null, volumenM3: 3, piezas: 2 }]);
  });

  it("un volumen nulo cuenta como pieza pero no suma m³", () => {
    const r = origenesDeTrozas([{ permiso: "A", volumenM3: null }, { permiso: "A", volumenM3: 2 }]);
    expect(r[0]).toEqual({ permiso: "A", volumenM3: 2, piezas: 2 });
  });
});

describe("repartirEntreOrigenes", () => {
  it("reparte proporcional al volumen de materia prima", () => {
    const r = repartirEntreOrigenes(10, [
      { permiso: "A", volumenM3: 15, piezas: 3 },
      { permiso: "B", volumenM3: 5, piezas: 1 },
    ]);
    expect(r.map((x) => x.produccionM3)).toEqual([7.5, 2.5]);
    expect(r.map((x) => x.pctMateriaPrima)).toEqual([75, 25]);
  });

  it("el reparto CIERRA exacto: el último absorbe el redondeo", () => {
    // Tres tercios de 100 dan 33.3333 × 3 = 99.9999 sin esta regla.
    const r = repartirEntreOrigenes(100, [
      { permiso: "A", volumenM3: 1, piezas: 1 },
      { permiso: "B", volumenM3: 1, piezas: 1 },
      { permiso: "C", volumenM3: 1, piezas: 1 },
    ]);
    expect(Number(r.reduce((a, x) => a + x.produccionM3, 0).toFixed(4))).toBe(100);
  });

  it("un solo origen se lleva todo", () => {
    const r = repartirEntreOrigenes(4, [{ permiso: "A", volumenM3: 8, piezas: 2 }]);
    expect(r).toEqual([{ permiso: "A", volumenM3: 8, piezas: 2, produccionM3: 4, pctMateriaPrima: 100 }]);
  });

  it("sin orígenes o sin volumen no inventa un reparto", () => {
    expect(repartirEntreOrigenes(10, [])).toEqual([]);
    expect(repartirEntreOrigenes(10, [{ permiso: "A", volumenM3: 0, piezas: 1 }])).toEqual([]);
  });

  it("una producción en cero reparte ceros, no falla", () => {
    const r = repartirEntreOrigenes(0, [
      { permiso: "A", volumenM3: 5, piezas: 1 },
      { permiso: "B", volumenM3: 5, piezas: 1 },
    ]);
    expect(r.map((x) => x.produccionM3)).toEqual([0, 0]);
  });
});

describe("motivosParaGuardar con el tope", () => {
  const paq = (volumenM3: number, codigo = "P1") => ({
    id: codigo,
    codigo, productType: "Madera aserrada", presentacion: "Paquete",
    cantidad: 1, volumenM3, espesorCm: null, anchoCm: null, largoM: null, observations: "",
  });

  it("sin materia prima no aplica el tope: no hay contra qué medirlo", () => {
    expect(motivosParaGuardar([paq(99)])).toEqual([]);
  });

  it("dentro del tope no dice nada", () => {
    expect(motivosParaGuardar([paq(5.6)], { consumidoM3: 10 })).toEqual([]);
  });

  it("pasado el tope lo frena y dice cuánto sacar", () => {
    const m = motivosParaGuardar([paq(6)], { consumidoM3: 10 });
    expect(m).toHaveLength(1);
    expect(m[0]).toContain("56 %");
    expect(m[0]).toContain("5.600 m³");
    expect(m[0]).toContain("Sacá 0.400 m³");
  });

  it("el tope mira la SUMA de los paquetes, no cada uno", () => {
    // Tres de 2 pasan el tope de 5.6 aunque ninguno solo lo pase.
    expect(motivosParaGuardar([paq(2, "A"), paq(2, "B"), paq(2, "C")], { consumidoM3: 10 })).toHaveLength(1);
  });
});

describe("corridasSobreTope — el barrido de lo que ya estaba cargado", () => {
  const corrida = (over: Partial<CorridaParaTope> = {}): CorridaParaTope => ({
    id: "c1", lineNo: 1, productType: "Madera aserrada", speciesCommon: "Tornillo",
    volumeInputM3: 10, quantity: 5, unit: "m3", materiaPrimaRef: "LA-1",
    ...over,
  });

  it("una corrida dentro del tope no aparece", () => {
    expect(corridasSobreTope([corrida({ quantity: 5.6 })])).toEqual([]);
  });

  it("los dos casos reales del tenant de pruebas salen listados", () => {
    const r = corridasSobreTope([
      corrida({ id: "a", lineNo: 1, volumeInputM3: 8.45, quantity: 6.2 }),
      corrida({ id: "b", lineNo: 95001, volumeInputM3: 5.1342, quantity: 2.9778 }),
    ]);
    expect(r.map((x) => x.rendimientoPct)).toEqual([73.4, 58]);
    // Ordena por el peor primero: es el que hay que mirar.
    expect(r[0].lineNo).toBe(1);
    expect(r[0].excesoM3).toBe(1.468); // 6.2 − 4.732
  });

  it("un litro de redondeo NO es un exceso", () => {
    // 10 × 0.56 = 5.6 exacto; 5.6005 está dentro de la tolerancia del negocio.
    expect(corridasSobreTope([corrida({ quantity: 5.6005 })])).toEqual([]);
  });

  it("una corrida en otra unidad no entra: sería mezclar pt con m³", () => {
    expect(corridasSobreTope([corrida({ quantity: 900, unit: "pt" })])).toEqual([]);
  });

  it("sin materia prima o sin producción declarada no hay rendimiento que juzgar", () => {
    expect(corridasSobreTope([corrida({ volumeInputM3: 0 })])).toEqual([]);
    expect(corridasSobreTope([corrida({ quantity: null })])).toEqual([]);
  });

  it("nombra el producto y el lote para poder ir a buscarla", () => {
    const [r] = corridasSobreTope([corrida({ quantity: 9 })]);
    expect(r.producto).toBe("Madera aserrada · Tornillo");
    expect(r.lote).toBe("LA-1");
  });
});

describe("corridasAMedioDeclarar (ADR-365)", () => {
  const corrida = (over: Partial<CorridaParaTope> = {}): CorridaParaTope => ({
    id: "c1", lineNo: 12, entryDate: "2026-08-06T00:00:00.000Z",
    productType: "Madera aserrada", speciesCommon: "Tornillo",
    volumeInputM3: 8.9286, quantity: 3, unit: "m3", status: "registrado",
    materiaPrimaRef: "LA-2026-004",
    ...over,
  });

  it("el caso de Brandon: aserró 3 de los 5 m³ que esa madera permite", () => {
    // 8.9286 × 0.56 = 5.0000 (truncado). Declaró 3 → todavía entran 2.
    const [r] = corridasAMedioDeclarar([corrida()]);
    expect(r.topeM3).toBe(5);
    expect(r.declaradoM3).toBe(3);
    expect(r.margenM3).toBe(2);
    expect(r.rendimientoPct).toBe(33.6);
    expect(r.lote).toBe("LA-2026-004");
  });

  it("la que llegó al tope no se ofrece", () => {
    expect(corridasAMedioDeclarar([corrida({ quantity: 5 })])).toEqual([]);
  });

  it("la que todavía NO declaró no es de esta lista: tiene su propia puerta", () => {
    // `quantity: null` es «corrida sin declarar» (ADR-340) — ampliar lo que
    // nunca se declaró sería declarar por primera vez, con otro endpoint.
    expect(corridasAMedioDeclarar([corrida({ quantity: null })])).toEqual([]);
  });

  it("la anulada no cuenta: su madera volvió al patio", () => {
    expect(corridasAMedioDeclarar([corrida({ status: "anulado" })])).toEqual([]);
  });

  it("en otra unidad no se juzga: pt sobre m³ no es un rendimiento", () => {
    expect(corridasAMedioDeclarar([corrida({ quantity: 900, unit: "pt" })])).toEqual([]);
  });

  it("un margen menor a un litro es ruido, no una oportunidad", () => {
    // 8.9286 × 0.56 = 5.0000 y ya declaró 4.9995 → 0.0005 m³ de margen.
    expect(corridasAMedioDeclarar([corrida({ quantity: 4.9995 })])).toEqual([]);
    expect(MARGEN_MINIMO_M3).toBe(0.001);
  });

  it("la más nueva primero: el turno de ayer es el que se viene a completar", () => {
    const r = corridasAMedioDeclarar([
      corrida({ id: "a", lineNo: 3 }),
      corrida({ id: "b", lineNo: 41 }),
    ]);
    expect(r.map((x) => x.lineNo)).toEqual([41, 3]);
  });
});

describe("motivosParaGuardar al AMPLIAR (ADR-361/365)", () => {
  const pq = (over: Partial<PaqueteBorrador> = {}): PaqueteBorrador => ({
    id: "1", codigo: "PQ-004", productType: "Madera aserrada", presentacion: "PAQUETES",
    cantidad: 10, volumenM3: 1.5, espesorCm: null, anchoCm: null, largoM: null, observations: "",
    ...over,
  });

  it("el tope se mide sobre el TOTAL: dos tandas del 40 % no dan 80 %", () => {
    // 10 m³ de materia prima → tope 5.6. Ya declaró 4 y quiere agregar 2.
    const motivos = motivosParaGuardar([pq({ volumenM3: 2 })], { consumidoM3: 10, yaDeclaradoM3: 4 });
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toContain("6.000");
    expect(motivos[0]).toContain("5.600");
  });

  it("lo que entra en el margen pasa sin ruido", () => {
    expect(motivosParaGuardar([pq({ volumenM3: 1.6 })], { consumidoM3: 10, yaDeclaradoM3: 4 })).toEqual([]);
  });

  it("un código que la corrida ya tiene se frena acá, no en el 422 del servidor", () => {
    const motivos = motivosParaGuardar([pq({ codigo: "PQ-002" })], {
      consumidoM3: 10,
      yaDeclaradoM3: 1,
      codigosUsados: ["PQ-001", "PQ-002"],
    });
    expect(motivos.some((m) => m.includes("«pq-002»"))).toBe(true);
  });

  it("sin ampliación se comporta igual que siempre", () => {
    expect(motivosParaGuardar([pq({ volumenM3: 5.6 })], { consumidoM3: 10 })).toEqual([]);
    expect(motivosParaGuardar([pq({ volumenM3: 5.7 })], { consumidoM3: 10 })).toHaveLength(1);
  });
});

describe("sugerirCodigoPaquete — el código que todavía está libre", () => {
  const hoy = new Date("2026-08-08T12:00:00.000Z");

  it("continúa la serie de la planta conservando los ceros", () => {
    expect(sugerirCodigoPaquete(["PQ-014", "PQ-013", "PQ-012"], { hoy })).toBe("PQ-015");
  });

  it("salta el que ya está tomado en vez de proponer un choque", () => {
    // PQ-015 existe en otra corrida: proponerlo es un 422 asegurado.
    expect(sugerirCodigoPaquete(["PQ-015", "PQ-013"], { hoy })).toBe("PQ-016");
  });

  it("también esquiva los del borrador que todavía no se guardaron", () => {
    expect(sugerirCodigoPaquete(["PQ-014"], { hoy, ocupados: ["PQ-015", "PQ-016"] })).toBe("PQ-017");
  });

  it("manda la serie MÁS USADA, no la del último código suelto", () => {
    // Un `X-9` cargado a mano no arrastra a toda la planta.
    expect(sugerirCodigoPaquete(["X-9", "PQ-003", "PQ-002", "PQ-001"], { hoy })).toBe("PQ-004");
  });

  it("sin ninguna serie previa arranca con año y mes", () => {
    expect(sugerirCodigoPaquete([], { hoy })).toBe("PQ-2608-001");
    expect(sugerirCodigoPaquete(["SIN-NUMERO"], { hoy })).toBe("PQ-2608-001");
  });

  it("ignora mayúsculas al comparar: PQ-015 y pq-015 son el mismo cartel", () => {
    expect(sugerirCodigoPaquete(["PQ-014"], { hoy, ocupados: ["pq-015"] })).toBe("PQ-016");
  });
});
