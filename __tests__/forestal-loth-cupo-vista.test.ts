import { describe, expect, it } from "vitest";
import { cupoPorEspecie } from "@/lib/forestal/loth-cupo-especie";
import { alertasDeCupo, pctCorto, talasDelPlan, textoCupoEnPie } from "@/lib/forestal/loth-cupo-vista";

/* Blas, 30-09: Tornillo autorizado 320 m³ / 45 árboles con 2 censados y 2 talados
   (9,537 m³); Copaiba sin autorizado, cupo del censo 126,9, talado 10,37. */
const filas = cupoPorEspecie({
  censo: [
    { treeCode: "85-TOR", speciesCommon: "Tornillo", volumenEstimadoM3: 2.9 },
    { treeCode: "86-TOR", speciesCommon: "Tornillo", volumenEstimadoM3: 3.3 },
    { treeCode: "111", speciesCommon: "Copaiba", volumenEstimadoM3: 60 },
    { treeCode: "112", speciesCommon: "Copaiba", volumenEstimadoM3: 66.9 },
    { treeCode: "201", speciesCommon: "Lupuna", volumenEstimadoM3: 10 },
    { treeCode: "202", speciesCommon: "Catahua", volumenEstimadoM3: 10 },
  ],
  talas: [
    { treeCode: "85-TOR", speciesCommon: "Tornillo", volumeM3: 3.564 },
    { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: 5.973 },
    { treeCode: "111", speciesCommon: "Copaiba", volumeM3: 10.37 },
    { treeCode: "201", speciesCommon: "Lupuna", volumeM3: 9.4 },
    { treeCode: "202", speciesCommon: "Catahua", volumeM3: 12 },
  ],
  autorizadas: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 320, arbolesAutorizados: 45 }],
});
const de = (n: string) => filas.find((f) => f.especie === n)!;

describe("textoCupoEnPie", () => {
  it("Tornillo: medida, fuente autorizada y dato del censo sin alarma", () => {
    const t = textoCupoEnPie(de("Tornillo"));
    expect(t.medida).toBe("9.537 de 320.000 m³ · 3 %");
    expect(t.etiqueta).toBe("En regla");
    expect(t.fuente).toBe("autorizado");
    expect(t.censo).toBe("2 de 45 árboles en el censo");
  });

  it("Copaiba: sin autorizado, el cupo sale del censo y no hay dato de árboles", () => {
    const t = textoCupoEnPie(de("Copaiba"));
    expect(t.medida).toBe("10.370 de 126.900 m³ · 8 %");
    expect(t.fuente).toBe("del censo");
    expect(t.censo).toBeNull();
  });

  it("excedida: el veredicto se escribe", () => {
    const t = textoCupoEnPie(de("Catahua"));
    expect(t.veredicto).toBe("excedido");
    expect(t.etiqueta).toBe("Excedido +2.000 m³");
  });
});

describe("pctCorto", () => {
  it("entero; menos de 1 % no se redondea a 0", () => {
    expect(pctCorto(3)).toBe("3 %");
    expect(pctCorto(0.4)).toBe("<1 %");
    expect(pctCorto(0)).toBe("0 %");
  });
});

describe("alertasDeCupo", () => {
  it("excedidas primero, luego cerca; las en regla no salen", () => {
    const a = alertasDeCupo(filas);
    expect(a.map((x) => `${x.especie}:${x.veredicto}`)).toEqual(["Catahua:excedido", "Lupuna:cerca"]);
    expect(a[0].detalle).toBe("+2.000 m³");
    expect(a[1].detalle).toBe("94.0 %");
  });

  it("sin alertas devuelve vacío", () => {
    expect(alertasDeCupo([de("Tornillo"), de("Copaiba")])).toEqual([]);
  });
});

describe("talasDelPlan (dos planes vivos)", () => {
  const censoB = new Set(["001-TOR", "002-TOR"]);
  const talas = [
    { treeCode: "001-TOR", speciesCommon: "Tornillo", volumeM3: 4, planId: "B" },
    { treeCode: "111", speciesCommon: "Copaiba", volumeM3: 10.37, planId: "A" },
    { treeCode: "999", speciesCommon: "Copaiba", volumeM3: 2, planId: null },
    { treeCode: "002-TOR", speciesCommon: "Tornillo", volumeM3: 5.5, planId: null },
  ];

  it("la Copaiba del plan A no aparece en el cupo del plan B", () => {
    const { delPlan, fuera } = talasDelPlan(talas, censoB, "B");
    expect(delPlan.map((t) => t.treeCode)).toEqual(["001-TOR", "002-TOR"]);
    expect(fuera.map((t) => t.treeCode)).toEqual(["111", "999"]);
    const cupo = cupoPorEspecie({
      censo: [
        { treeCode: "001-TOR", speciesCommon: "Tornillo", volumenEstimadoM3: 3 },
        { treeCode: "002-TOR", speciesCommon: "Tornillo", volumenEstimadoM3: 3 },
      ],
      talas: delPlan,
      autorizadas: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 320, arbolesAutorizados: 45 }],
    });
    expect(cupo.map((f) => f.especie)).toEqual(["Tornillo"]);
    expect(cupo[0].taladoM3).toBe(9.5);
  });

  it("una línea asentada a otro plan no cuenta aunque su código esté en el censo", () => {
    const { delPlan, fuera } = talasDelPlan([{ treeCode: "001-TOR", planId: "A" }], censoB, "B");
    expect(delPlan).toEqual([]);
    expect(fuera).toHaveLength(1);
  });
});
