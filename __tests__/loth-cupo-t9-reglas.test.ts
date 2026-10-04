/**
 * T9 — las dos correcciones del revisor (30-09):
 *  1. El lock del cupo es el ÚLTIMO de la tx del alta: después del FOR UPDATE
 *     del correlativo, nunca en medio de dos bloqueos del libro (deadlock).
 *  2. Sólo el cupo AUTORIZADO exige motivo; el del censo avisa y audita. Y las
 *     talas fuera del censo no suman contra el cupo (igual que `talasDelPlan`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { avisoCupoAlTalar, entradaDelPlan } from "@/lib/forestal/loth-cupo-especie";

describe("T9 · orden de los locks en ForestLothDB.create", () => {
  it("enforceCupoEspecie va DESPUÉS del FOR UPDATE del correlativo", () => {
    const src = readFileSync("lib/db/forest-loth.db.ts", "utf8");
    const create = src.slice(src.indexOf("static async create("), src.indexOf("static async trozasParaGuia("));
    const correlativo = create.indexOf('"caratulaId" IS NOT DISTINCT FROM');
    const cupo = create.indexOf("enforceCupoEspecie(tx");
    expect(correlativo).toBeGreaterThan(0);
    expect(cupo).toBeGreaterThan(correlativo);
  });
});

const CENSO = [
  { treeCode: "85-TOR", speciesCommon: "Tornillo", volumenEstimadoM3: 2.9 },
  { treeCode: "86-TOR", speciesCommon: "Tornillo", volumenEstimadoM3: 3.3 },
];

describe("T9 · quién exige motivo", () => {
  const nueva = { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: 5.973 };
  const talas = [{ treeCode: "85-TOR", speciesCommon: "Tornillo", volumeM3: 3.564 }];

  it("cupo del CENSO: avisa pero no exige motivo", () => {
    expect(avisoCupoAlTalar({ censo: CENSO, talas }, nueva)).toMatchObject({ fuente: "censo", exigeMotivo: false });
  });

  it("cupo AUTORIZADO: exige motivo", () => {
    expect(
      avisoCupoAlTalar({ censo: CENSO, talas, autorizadas: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 8 }] }, nueva),
    ).toMatchObject({ fuente: "autorizado", exigeMotivo: true });
  });
});

describe("T9 · las talas que cuentan contra el cupo (entradaDelPlan)", () => {
  it("una tala fuera del censo, o de otro plan, no suma", () => {
    const e = entradaDelPlan(
      "p1",
      CENSO,
      [
        { treeCode: "85-TOR", speciesCommon: "Tornillo", volumeM3: 3.564, planId: "p1" },
        { treeCode: "X-99", speciesCommon: "Tornillo", volumeM3: 50, planId: "p1" }, // fuera del censo
        { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: 50, planId: "p2" }, // otro plan
        { treeCode: null, speciesCommon: "Tornillo", volumeM3: 50, planId: null }, // sin código
      ],
      [],
    );
    expect(e.talas.map((t) => t.treeCode)).toEqual(["85-TOR"]);
    // 3,564 + 2 = 5,564 de 6,2 → sin aviso (con las de afuera habría dado exceso).
    expect(avisoCupoAlTalar(e, { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: 2 })).toBeNull();
  });

  it("la tala nueva fuera del censo tampoco se mide contra el cupo", () => {
    const e = entradaDelPlan("p1", CENSO, [], []);
    expect(avisoCupoAlTalar(e, { treeCode: "X-99", speciesCommon: "Tornillo", volumeM3: 50 })).toBeNull();
  });
});
