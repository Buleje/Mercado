/**
 * loth-poa — las reglas que deciden si un árbol se puede tumbar.
 *
 * Lo que se blinda: si el DMC se aplica mal, el sistema habilita a tumbar un
 * árbol que la norma protege (RJ 458-2002-INRENA) — exactamente lo que sanciona
 * OSINFOR. Y si los semilleros se calculan mal, el bosque queda sin regeneración.
 */
import { describe, expect, it } from "vitest";
import {
  analizarPoa,
  DMC_GENERAL_CM,
  dmcParaEspecie,
  normEspecie,
  ordenarAlertas,
  type PoaSpecies,
  type PoaTree,
} from "@/lib/forestal/loth-poa";

const arbol = (code: string, especie: string, dapCm: number | null, vol = 5, estado = "en_pie"): PoaTree => ({
  id: code,
  treeCode: code,
  speciesCommon: especie,
  dapM: dapCm == null ? null : dapCm / 100,
  volumenEstimadoM3: vol,
  estado,
});

describe("DMC por especie", () => {
  it("usa la tabla oficial (RJ 458-2002-INRENA)", () => {
    expect(dmcParaEspecie("Caoba").cm).toBe(75);
    expect(dmcParaEspecie("Cedro").cm).toBe(65);
    expect(dmcParaEspecie("Lupuna").cm).toBe(64);
    expect(dmcParaEspecie("Tornillo").cm).toBe(61);
    expect(dmcParaEspecie("Shihuahuaco").cm).toBe(51);
    expect(dmcParaEspecie("Capirona").cm).toBe(41);
  });

  it("cae al general de 41 cm para las no listadas", () => {
    const r = dmcParaEspecie("Misa");
    expect(r.cm).toBe(DMC_GENERAL_CM);
    expect(r.fuente).toBe("general");
  });

  it("ignora tildes y mayúsculas, y hereda por palabra", () => {
    expect(normEspecie("Azúcar  Huayo")).toBe("azucar huayo");
    expect(dmcParaEspecie("shihuahuaco negro").cm).toBe(51); // hereda de shihuahuaco
    expect(dmcParaEspecie("CAOBA").cm).toBe(75);
  });

  it("el plan puede fijar otro DMC (la ARFFS lo puede aprobar)", () => {
    const r = dmcParaEspecie("Tornillo", { tornillo: 56 });
    expect(r.cm).toBe(56);
    expect(r.fuente).toBe("plan");
  });

  it("descarta overrides inválidos", () => {
    expect(dmcParaEspecie("Tornillo", { tornillo: 0 }).cm).toBe(61);
    expect(dmcParaEspecie("Tornillo", { tornillo: Number.NaN }).cm).toBe(61);
  });
});

describe("clasificación del censo", () => {
  const species: PoaSpecies[] = [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 20, arbolesAutorizados: 4 }];

  it("deja bajo DMC los árboles que no llegan al diámetro", () => {
    const trees = [arbol("T1", "Tornillo", 80), arbol("T2", "Tornillo", 55), arbol("T3", "Tornillo", 61)];
    const r = analizarPoa({ trees, species, areaHa: 10, config: { semillerosPct: 0 } });
    const fila = r.especies[0];
    expect(fila.dmcCm).toBe(61);
    expect(fila.bajoDmc).toBe(1); // el de 55 cm
    expect(fila.sobreDmc).toBe(2); // 80 y 61 (el límite entra: ≥ DMC)
    expect(r.arboles.find((a) => a.treeCode === "T2")?.categoria).toBe("bajo_dmc");
    expect(r.arboles.find((a) => a.treeCode === "T3")?.categoria).toBe("aprovechable");
  });

  it("reserva como semilleros los de MAYOR DAP", () => {
    const trees = [
      arbol("T1", "Tornillo", 70),
      arbol("T2", "Tornillo", 95),
      arbol("T3", "Tornillo", 65),
      arbol("T4", "Tornillo", 80),
    ];
    const r = analizarPoa({ trees, species, areaHa: 10, config: { semillerosPct: 25 } });
    expect(r.totales.semilleros).toBe(1);
    expect(r.arboles.find((a) => a.categoria === "semillero")?.treeCode).toBe("T2"); // el de 95 cm
    expect(r.totales.aprovechables).toBe(3);
  });

  it("garantiza al menos un semillero cuando hay aprovechables, y lo explica", () => {
    const r = analizarPoa({ trees: [arbol("T1", "Tornillo", 80)], species, areaHa: 5, config: { semillerosPct: 10 } });
    expect(r.totales.semilleros).toBe(1);
    expect(r.totales.aprovechables).toBe(0);
    // Sin la explicación, "0 aprovechables" parece un bug del sistema.
    expect(r.alertas.some((a) => a.titulo.includes("sin volumen aprovechable"))).toBe(true);
  });

  it("con 0% de semilleros todos los ≥ DMC son aprovechables", () => {
    const r = analizarPoa({ trees: [arbol("T1", "Tornillo", 80, 7)], species, areaHa: 5, config: { semillerosPct: 0 } });
    expect(r.totales.semilleros).toBe(0);
    expect(r.totales.aprovechables).toBe(1);
    expect(r.totales.volumenAprovechableM3).toBe(7);
  });

  it("es determinístico: dos corridas dan los mismos semilleros", () => {
    const trees = [arbol("A", "Tornillo", 70), arbol("B", "Tornillo", 70), arbol("C", "Tornillo", 90)];
    const a = analizarPoa({ trees, species, areaHa: 1, config: { semillerosPct: 40 } });
    const b = analizarPoa({ trees, species, areaHa: 1, config: { semillerosPct: 40 } });
    const codes = (x: typeof a) => x.arboles.filter((t) => t.categoria === "semillero").map((t) => t.treeCode).sort();
    expect(codes(a)).toEqual(codes(b));
  });

  it("separa talados y descartados del cálculo de aprovechables", () => {
    const trees = [arbol("T1", "Tornillo", 80), arbol("T2", "Tornillo", 80, 5, "talado"), arbol("T3", "Tornillo", 80, 5, "descartado")];
    const r = analizarPoa({ trees, species, areaHa: 10, config: { semillerosPct: 0 } });
    expect(r.especies[0].talados).toBe(1);
    expect(r.especies[0].sobreDmc).toBe(1); // solo el que sigue en pie
    expect(r.arboles.find((a) => a.treeCode === "T3")?.categoria).toBe("descartado");
  });

  it("un árbol sin DAP no suma volumen aprovechable", () => {
    const r = analizarPoa({ trees: [arbol("T1", "Tornillo", null, 9)], species, areaHa: 10 });
    expect(r.especies[0].sinDap).toBe(1);
    expect(r.especies[0].volumenAprovechableM3).toBe(0);
    expect(r.alertas.some((a) => a.titulo.includes("sin DAP"))).toBe(true);
  });
});

describe("cuadro y alertas del POA", () => {
  it("avisa cuando el censo no respalda el volumen autorizado", () => {
    const r = analizarPoa({
      trees: [arbol("T1", "Tornillo", 80, 4)],
      species: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 50, arbolesAutorizados: 10 }],
      areaHa: 10,
      config: { semillerosPct: 0 },
    });
    expect(r.especies[0].autorizadoSinRespaldo).toBe(true);
    expect(r.alertas.some((a) => a.nivel === "warning" && a.titulo.includes("no respalda"))).toBe(true);
  });

  it("marca como ERROR una especie censada fuera del plan", () => {
    const r = analizarPoa({
      trees: [arbol("C1", "Caoba", 90)],
      species: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 10, arbolesAutorizados: 2 }],
      areaHa: 10,
    });
    expect(r.especies.find((e) => e.especie === "Caoba")?.fueraDelPlan).toBe(true);
    expect(ordenarAlertas(r.alertas)[0].nivel).toBe("error");
  });

  it("avisa si el plan autoriza una especie que nadie censó", () => {
    const r = analizarPoa({
      trees: [arbol("T1", "Tornillo", 80)],
      species: [
        { speciesCommon: "Tornillo", volumenAutorizadoM3: 4, arbolesAutorizados: 1 },
        { speciesCommon: "Cedro", volumenAutorizadoM3: 30, arbolesAutorizados: 5 },
      ],
      areaHa: 10,
    });
    expect(r.alertas.some((a) => a.titulo.includes("Cedro") && a.titulo.includes("sin censo"))).toBe(true);
  });

  it("calcula la intensidad sobre el área autorizada", () => {
    const trees = [arbol("T1", "Tornillo", 80, 10), arbol("T2", "Tornillo", 75, 8), arbol("T3", "Tornillo", 70, 6)];
    const r = analizarPoa({
      trees,
      species: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 24, arbolesAutorizados: 3 }],
      areaHa: 12,
      config: { semillerosPct: 0 },
    });
    expect(r.totales.volumenAprovechableM3).toBe(24);
    expect(r.intensidad.m3PorHa).toBe(2);
    expect(r.intensidad.arbolesPorHa).toBe(0.25);
  });

  it("sin área no inventa intensidad", () => {
    const r = analizarPoa({ trees: [arbol("T1", "Tornillo", 80)], species: [], areaHa: null });
    expect(r.intensidad.m3PorHa).toBeNull();
    expect(r.alertas.some((a) => a.titulo === "Sin área declarada")).toBe(true);
  });

  it("censo vacío no rompe nada", () => {
    const r = analizarPoa({ trees: [], species: [], areaHa: 10 });
    expect(r.especies).toHaveLength(0);
    expect(r.totales.censados).toBe(0);
    expect(r.totales.volumenAprovechableM3).toBe(0);
  });

  it("⭐ avisa cuando NO se reserva ningún semillero", () => {
    // Aprovechar el 100% de lo que supera el DMC deja el rodal sin fuente de
    // semilla: el sistema no lo impide, pero no puede callárselo.
    const r = analizarPoa({
      trees: [arbol("T1", "Tornillo", 80), arbol("T2", "Tornillo", 75)],
      species: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 20, arbolesAutorizados: null }],
      areaHa: 10,
      config: { semillerosPct: 0 },
    });
    const a = r.alertas.find((x) => x.titulo === "Sin semilleros reservados");
    expect(a?.nivel).toBe("warning");
    expect(a?.detalle).toContain("2 árboles sobre el DMC");
  });

  it("con semilleros cargados no molesta", () => {
    const r = analizarPoa({
      trees: [arbol("T1", "Tornillo", 80), arbol("T2", "Tornillo", 75)],
      species: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 20, arbolesAutorizados: null }],
      areaHa: 10,
      config: { semillerosPct: 10 },
    });
    expect(r.alertas.some((x) => x.titulo === "Sin semilleros reservados")).toBe(false);
  });

  it("sin nada sobre el DMC, cero semilleros NO es un aviso: es la verdad", () => {
    const r = analizarPoa({
      trees: [arbol("T1", "Tornillo", 40)], // bajo el DMC de Tornillo (61)
      species: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 20, arbolesAutorizados: null }],
      areaHa: 10,
      config: { semillerosPct: 0 },
    });
    expect(r.totales.aprovechables).toBe(0);
    expect(r.alertas.some((x) => x.titulo === "Sin semilleros reservados")).toBe(false);
  });
});
