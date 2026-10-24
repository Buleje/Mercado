import { describe, expect, it } from "vitest";
import {
  avisoCupoAlTalar,
  cupoPorEspecie,
  motivoCupoValido,
  notaSobreCupo,
  ordenarCupos,
  totalesCupo,
  type ArbolCensoCupo,
  type TalaCupo,
} from "@/lib/forestal/loth-cupo-especie";

/*
 * Los números de Blas medidos el 30-09 (ForestCensusTree + tala del libro):
 * 9 especies, 569,6 m³ censados. El reparto por árbol dentro de cada especie
 * es de ejemplo; los totales por especie y las talas son los reales.
 */
const arbol = (treeCode: string, speciesCommon: string, v: number): ArbolCensoCupo => ({ treeCode, speciesCommon, volumenEstimadoM3: v });

const CENSO_BLAS: ArbolCensoCupo[] = [
  arbol("85-TOR", "Tornillo", 2.9),
  arbol("86-TOR", "Tornillo", 3.3),
  arbol("111", "Copaiba", 60),
  arbol("112", "Copaiba", 66.9),
  arbol("201", "Lupuna", 92.7),
  arbol("301", "Mashonaste", 40.1),
  arbol("302", "Mashonaste", 40.1),
  arbol("401", "Sapotillo", 72.4),
  arbol("501", "Catahua", 60),
  arbol("601", "Aguanomasha", 50),
  arbol("701", "Congona", 41.2),
  arbol("801", "Quinilla", 40),
];

const TALAS_BLAS: TalaCupo[] = [
  { treeCode: "85-TOR", speciesCommon: "Tornillo", volumeM3: "3.5640" },
  { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: "5.9730" },
  { treeCode: "111", speciesCommon: "Copaiba", volumeM3: 10.37 },
  { treeCode: "201", speciesCommon: "Lupuna", volumeM3: 15.59 },
  { treeCode: "301", speciesCommon: "Mashonaste", volumeM3: 2.84 },
  { treeCode: "401", speciesCommon: "Sapotillo", volumeM3: 4.14 },
];

describe("cupoPorEspecie — datos de Blas", () => {
  const filas = cupoPorEspecie({ censo: CENSO_BLAS, talas: TALAS_BLAS });
  const de = (e: string) => filas.find((f) => f.especie === e);

  it("9 especies y 569,6 m³ censados", () => {
    const t = totalesCupo(filas);
    expect(t.especies).toBe(9);
    expect(t.censadoM3).toBeCloseTo(569.6, 4);
    expect(t.excedidas).toBe(1);
  });

  it("Tornillo: 2 de 2 talados, 9,537 de 6,2 m³ → 154 %, excedido por 3,337 m³ (contra el censo)", () => {
    const t = de("Tornillo");
    expect(t).toMatchObject({ arbolesCensados: 2, arbolesTalados: 2, fuente: "censo", cupoM3: 6.2, taladoM3: 9.537, veredicto: "excedido" });
    expect(t?.pctUsado).toBe(153.8);
    expect(Math.round(t?.pctUsado ?? 0)).toBe(154);
    expect(t?.excesoM3).toBeCloseTo(3.337, 4);
    expect(t?.restanteM3).toBeCloseTo(-3.337, 4);
  });

  it("las otras taladas van en regla", () => {
    expect(de("Copaiba")).toMatchObject({ arbolesTalados: 1, taladoM3: 10.37, cupoM3: 126.9, pctUsado: 8.2, veredicto: "ok" });
    expect(de("Lupuna")).toMatchObject({ taladoM3: 15.59, cupoM3: 92.7, veredicto: "ok" });
    expect(de("Mashonaste")).toMatchObject({ taladoM3: 2.84, cupoM3: 80.2, veredicto: "ok" });
    expect(de("Sapotillo")).toMatchObject({ taladoM3: 4.14, cupoM3: 72.4, veredicto: "ok" });
  });

  it("las sin talar quedan en 0 %", () => {
    for (const e of ["Catahua", "Aguanomasha", "Congona", "Quinilla"]) {
      expect(de(e)).toMatchObject({ arbolesTalados: 0, taladoM3: 0, pctUsado: 0, veredicto: "ok", excesoM3: 0 });
    }
  });

  it("ordena la excedida arriba", () => {
    expect(ordenarCupos(filas)[0].especie).toBe("Tornillo");
  });
});

describe("cupoPorEspecie — cupo y tolerancia", () => {
  const censo = [arbol("1", "Tornillo", 6.2)];

  it("el volumen AUTORIZADO manda sobre el censo, aunque el plan lo escriba con el científico", () => {
    const [f] = cupoPorEspecie({
      censo,
      talas: [{ treeCode: "1", speciesCommon: "Tornillo", volumeM3: 9.537 }],
      autorizadas: [{ speciesCommon: "Tornillo (Cedrelinga catenaeformis)", volumenAutorizadoM3: "12.0000", arbolesAutorizados: 3 }],
    });
    expect(f).toMatchObject({ especie: "Tornillo", fuente: "autorizado", cupoM3: 12, censadoM3: 6.2, arbolesAutorizados: 3, veredicto: "ok" });
    expect(f.pctUsado).toBe(79.5);
  });

  it("autorizada con volumen 0 o nulo → cae al censo", () => {
    const [f] = cupoPorEspecie({ censo, talas: [], autorizadas: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: null }] });
    expect(f).toMatchObject({ fuente: "censo", cupoM3: 6.2, autorizadoM3: null });
  });

  it("0,01 m³ es la cinta: 6,205 de 6,2 no es exceso (queda «cerca»); 6,211 sí", () => {
    const con = (v: number) => cupoPorEspecie({ censo, talas: [{ treeCode: "1", speciesCommon: "Tornillo", volumeM3: v }] })[0];
    expect(con(6.205).veredicto).toBe("cerca");
    expect(con(6.21).veredicto).toBe("cerca");
    expect(con(6.211).veredicto).toBe("excedido");
  });

  it("cerca desde el 90 %", () => {
    const con = (v: number) => cupoPorEspecie({ censo, talas: [{ treeCode: "1", speciesCommon: "Tornillo", volumeM3: v }] })[0].veredicto;
    expect(con(5.57)).toBe("ok"); // 89,8 %
    expect(con(5.58)).toBe("cerca"); // 90,0 %
  });

  it("especie talada que no está ni en el censo ni en el plan → sin cupo, justo debajo de las excedidas", () => {
    const filas = ordenarCupos(
      cupoPorEspecie({
        censo: [arbol("1", "Tornillo", 1), arbol("2", "Cedro", 10)],
        talas: [
          { treeCode: "1", speciesCommon: "Tornillo", volumeM3: 2 },
          { treeCode: "X9", speciesCommon: "Caoba", volumeM3: 3 },
        ],
      }),
    );
    expect(filas.map((f) => [f.especie, f.veredicto])).toEqual([
      ["Tornillo", "excedido"],
      ["Caoba", "sin_cupo"],
      ["Cedro", "ok"],
    ]);
  });

  it("una tala sin volumen cuenta como árbol, no como m³; sin especie la toma del censo", () => {
    const [f] = cupoPorEspecie({ censo, talas: [{ treeCode: "1", speciesCommon: null, volumeM3: null }] });
    expect(f).toMatchObject({ arbolesTalados: 1, taladoM3: 0, talasSinVolumen: 1 });
  });
});

describe("avisoCupoAlTalar", () => {
  const primera = TALAS_BLAS.filter((t) => t.treeCode !== "86-TOR");

  it("el segundo Tornillo de Blas cruza el cupo: aviso con el número", () => {
    const a = avisoCupoAlTalar({ censo: CENSO_BLAS, talas: primera }, { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: 5.973 });
    expect(a).not.toBeNull();
    expect(a).toMatchObject({ especie: "Tornillo", fuente: "censo", cupoM3: 6.2, taladoAntesM3: 3.564, taladoConEsteM3: 9.537, yaExcedida: false });
    expect(a?.excesoM3).toBeCloseTo(3.337, 4);
    expect(a?.mensaje).toBe("Con este árbol, Tornillo llega a 154 % de lo censado (9.537 de 6.200 m³).");
  });

  it("el primer Tornillo no avisa (57 %)", () => {
    const sinTornillo = TALAS_BLAS.filter((t) => t.speciesCommon !== "Tornillo");
    expect(avisoCupoAlTalar({ censo: CENSO_BLAS, talas: sinTornillo }, { treeCode: "85-TOR", speciesCommon: "Tornillo", volumeM3: 3.564 })).toBeNull();
  });

  it("una especie ya pasada lo dice", () => {
    const a = avisoCupoAlTalar(
      { censo: [...CENSO_BLAS, arbol("87-TOR", "Tornillo", 0)], talas: TALAS_BLAS },
      { treeCode: "87-TOR", speciesCommon: "Tornillo", volumeM3: 1 },
    );
    expect(a?.yaExcedida).toBe(true);
    expect(a?.mensaje).toMatch(/^Tornillo ya estaba por encima de lo censado \(9\.537 de 6\.200 m³\); con este árbol llega a 170 %/);
  });

  it("corregir la medida de un árbol ya talado lo reemplaza, no lo suma", () => {
    // 86-TOR re-medido en 2,5: 3,564 + 2,5 = 6,064 → 97,8 %, sin exceso.
    expect(avisoCupoAlTalar({ censo: CENSO_BLAS, talas: TALAS_BLAS }, { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: 2.5 })).toBeNull();
  });

  it("dice «de lo autorizado» cuando el cupo es el del plan", () => {
    const a = avisoCupoAlTalar(
      { censo: CENSO_BLAS, talas: primera, autorizadas: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 8 }] },
      { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: 5.973 },
    );
    expect(a?.mensaje).toBe("Con este árbol, Tornillo llega a 119 % de lo autorizado en el plan (9.537 de 8.000 m³).");
  });

  it("sin volumen o sin cupo contra el cual medir → no avisa", () => {
    expect(avisoCupoAlTalar({ censo: CENSO_BLAS, talas: primera }, { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: null })).toBeNull();
    expect(avisoCupoAlTalar({ censo: CENSO_BLAS, talas: [] }, { treeCode: "X", speciesCommon: "Caoba", volumeM3: 50 })).toBeNull();
  });

  it("toma la especie del censo si la línea no la trae", () => {
    const a = avisoCupoAlTalar({ censo: CENSO_BLAS, talas: primera }, { treeCode: "86-TOR", speciesCommon: null, volumeM3: 5.973 });
    expect(a?.especie).toBe("Tornillo");
  });

  it("el motivo y la nota que queda en el libro", () => {
    expect(motivoCupoValido("  ok ")).toBe(false);
    expect(motivoCupoValido("Árbol caído por tormenta")).toBe(true);
    const a = avisoCupoAlTalar({ censo: CENSO_BLAS, talas: primera }, { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: 5.973 });
    expect(a && notaSobreCupo(a, " censo subestimó la altura ")).toBe(
      "[Tala sobre el cupo: Tornillo 154 % de lo censado (9.537 de 6.200 m³). Motivo: censo subestimó la altura]",
    );
  });
});
