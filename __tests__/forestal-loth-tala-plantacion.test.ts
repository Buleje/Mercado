import { describe, expect, it } from "vitest";
import {
  abreviaturaEspecie,
  codigoPropuesto,
  especieDelRegistro,
  especiesDelRegistro,
  numeroDeCodigo,
  saldoConEstaTala,
  type FilaBalanceRegistro,
} from "@/lib/forestal/loth-tala-plantacion";

/** El balance de un plan de plantación como lo devuelve `GET /plan?balance=`. */
const fila = (species: string, autorizado: number, talado = 0, extra: Partial<FilaBalanceRegistro> = {}): FilaBalanceRegistro => ({
  species,
  cites: false,
  autorizado,
  talado,
  trozado: 0,
  movilizado: 0,
  consumido: 0,
  ...extra,
});

describe("abreviaturaEspecie", () => {
  it("toma las tres primeras letras del nombre común, sin tildes", () => {
    expect(abreviaturaEspecie("Bolaina")).toBe("BOL");
    expect(abreviaturaEspecie("Azúcar huayo")).toBe("AZU");
    expect(abreviaturaEspecie("Tornillo (Cedrelinga catenaeformis)")).toBe("TOR");
  });

  it("sin nombre no inventa letras", () => {
    expect(abreviaturaEspecie("")).toBe("");
    expect(abreviaturaEspecie(null)).toBe("");
  });
});

describe("numeroDeCodigo", () => {
  it("lee el número del código, esté adelante o atrás", () => {
    expect(numeroDeCodigo("001-BOL")).toBe(1);
    expect(numeroDeCodigo("BOL-12")).toBe(12);
    expect(numeroDeCodigo("LUP")).toBeNull();
  });
});

describe("codigoPropuesto", () => {
  it("el primero del plan es 001 con la abreviatura de la especie", () => {
    expect(codigoPropuesto("Bolaina", [])).toBe("001-BOL");
  });

  it("sigue el correlativo del PLAN, no de la especie", () => {
    expect(codigoPropuesto("Capirona", ["001-BOL", "002-BOL"])).toBe("003-CAP");
  });

  it("no repite un código ya talado en otro plan del negocio (T3 mira el negocio entero)", () => {
    expect(codigoPropuesto("Bolaina", [], ["001-BOL", "002-BOL", "001-CAP"])).toBe("003-BOL");
  });

  it("compara sin mayúsculas: «001-bol» ocupa «001-BOL»", () => {
    expect(codigoPropuesto("Bolaina", [], ["001-bol"])).toBe("002-BOL");
  });
});

describe("especiesDelRegistro", () => {
  it("en pie = registrado − talado, y cruza el científico por clave", () => {
    const [bol] = especiesDelRegistro(
      [fila("Bolaina", 120.5, 2.25)],
      [{ speciesCommon: "bolaina", speciesScientific: "Guazuma crinita", anioInstalacion: 2019, superficieHa: "3.5" }],
    );
    expect(bol).toMatchObject({
      especie: "Bolaina",
      cientifico: "Guazuma crinita",
      registradoM3: 120.5,
      taladoM3: 2.25,
      enPieM3: 118.25,
      anioInstalacion: 2019,
      superficieHa: 3.5,
    });
  });

  it("ordena por nombre y deja fuera las filas sin especie", () => {
    const r = especiesDelRegistro([fila("Capirona", 80), fila("  ", 5), fila("Bolaina", 120.5)]);
    expect(r.map((e) => e.especie)).toEqual(["Bolaina", "Capirona"]);
  });

  it("una especie que ya se taló de más queda en pie negativa (no se recorta a 0)", () => {
    const [e] = especiesDelRegistro([fila("Bolaina", 10, 12)]);
    expect(e.enPieM3).toBe(-2);
  });

  it("busca la especie elegida por clave («Tornillo» = «Tornillo (Cedrelinga …)»)", () => {
    const r = especiesDelRegistro([fila("Tornillo (Cedrelinga catenaeformis)", 80)]);
    expect(especieDelRegistro(r, "tornillo")?.registradoM3).toBe(80);
    expect(especieDelRegistro(r, "Capirona")).toBeNull();
  });
});

describe("saldoConEstaTala", () => {
  const [bol] = especiesDelRegistro([fila("Bolaina", 120.5, 2.25)]);

  it("registrado − talado − esta tala = queda", () => {
    expect(saldoConEstaTala(bol, 3.1)).toEqual({
      especie: "Bolaina",
      registradoM3: 120.5,
      taladoM3: 2.25,
      estaTalaM3: 3.1,
      quedaM3: 115.15,
      excesoM3: 0,
    });
  });

  it("sin volumen medido, esta tala no resta", () => {
    expect(saldoConEstaTala(bol, null).quedaM3).toBe(118.25);
    expect(saldoConEstaTala(bol, 0).estaTalaM3).toBeNull();
  });

  it("pasarse se avisa con lo que excede", () => {
    const s = saldoConEstaTala(bol, 120);
    expect(s.quedaM3).toBe(-1.75);
    expect(s.excesoM3).toBe(1.75);
  });

  it("la tolerancia es la de la cinta (10 litros), no la del float", () => {
    expect(saldoConEstaTala(bol, 118.255).excesoM3).toBe(0);
    expect(saldoConEstaTala(bol, 118.27).excesoM3).toBe(0.02);
  });
});
