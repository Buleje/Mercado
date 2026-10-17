import { describe, it, expect } from "vitest";
import { copiarDePlanPrevio, etiquetaPlanPrevio, type PlanPrevio } from "@/lib/forestal/loth-plan-alta";

/**
 * Copiar del plan anterior lo que se repite (ADR-425 · ronda 2).
 *
 * La regla que no se rompe: lo que identifica AL DOCUMENTO —número,
 * resolución, parcela, vigencia— no se copia nunca. Copiarlo sería declarar un
 * papel que no es el que se está cargando.
 */

const vacio = {
  planType: "PO" as const,
  titularName: "",
  representanteLegal: "",
  tituloHabilitante: "",
  resolucionNumber: "",
  resolucionDate: "",
  arffs: "",
  region: "Ucayali",
  areaHa: "",
  vigenciaDesde: "",
  vigenciaHasta: "",
  regenteName: "",
  regenteRegistro: "",
  regenteEspecialidad: "maderable",
  uitRef: "5350",
  costoExtraccionM3: "",
  costoTransformacionM3: "",
  costoFleteM3: "",
};

const anterior: PlanPrevio = {
  id: "p1",
  planNumber: "PO 12",
  planType: "PO",
  titularName: "Maderera El Aguajal SAC",
  representanteLegal: "Juan Pérez",
  arffs: "GERFOR Ucayali",
  region: "Ucayali",
  regenteName: "Ing. Rosa Ríos",
  regenteRegistro: "RNR-0421",
  regenteEspecialidad: "maderable",
  uitRef: "5350",
  costoExtraccionM3: "120",
  costoTransformacionM3: "80",
  costoFleteM3: "60",
};

const opts = { regionPorDefecto: "Ucayali" };

describe("copiarDePlanPrevio", () => {
  it("trae lo que se repite entre un documento y el siguiente", () => {
    const { campos, completados } = copiarDePlanPrevio(vacio, anterior, opts);
    expect(campos.arffs).toBe("GERFOR Ucayali");
    expect(campos.regenteName).toBe("Ing. Rosa Ríos");
    expect(campos.regenteRegistro).toBe("RNR-0421");
    expect(campos.costoExtraccionM3).toBe("120");
    expect(completados).toContain("ARFFS");
    expect(completados).toContain("regente");
  });

  it("NO copia lo que identifica al documento", () => {
    const { campos } = copiarDePlanPrevio(vacio, anterior, opts);
    expect(campos.tituloHabilitante).toBe("");
    expect(campos.resolucionNumber).toBe("");
    expect(campos.vigenciaDesde).toBe("");
    expect(campos.vigenciaHasta).toBe("");
    expect(campos.areaHa).toBe("");
  });

  it("no pisa lo que ya se escribió, y no lo anuncia", () => {
    const previo = { ...vacio, arffs: "ATFFS Selva Central", regenteName: "Otro regente" };
    const { campos, completados } = copiarDePlanPrevio(previo, anterior, opts);
    expect(campos.arffs).toBe("ATFFS Selva Central");
    expect(campos.regenteName).toBe("Otro regente");
    expect(completados).not.toContain("ARFFS");
    expect(completados).not.toContain("regente");
  });

  it("cuenta lo copiado una sola vez aunque se la llame dos veces", () => {
    const a = copiarDePlanPrevio(vacio, anterior, opts);
    const b = copiarDePlanPrevio(vacio, anterior, opts);
    expect(b.completados).toEqual(a.completados);
    expect(new Set(a.completados).size).toBe(a.completados.length);
  });

  it("los números del plan guardado llegan como texto al formulario", () => {
    const conNumeros = { ...anterior, uitRef: 5350, costoFleteM3: 60.5 };
    const { campos } = copiarDePlanPrevio({ ...vacio, uitRef: "" }, conNumeros, opts);
    expect(campos.uitRef).toBe("5350");
    expect(campos.costoFleteM3).toBe("60.5");
  });

  it("un plan sin esos datos no ensucia el formulario ni anuncia nada", () => {
    const pelado: PlanPrevio = { id: "p2", planNumber: null, planType: "DEMA", titularName: "CCNN X", arffs: null, region: null };
    const { campos, completados } = copiarDePlanPrevio(vacio, pelado, opts);
    expect(campos.arffs).toBe("");
    expect(campos.region).toBe("Ucayali");
    expect(completados).toEqual(["titular"]);
  });
});

describe("etiquetaPlanPrevio", () => {
  it("usa el tipo y el número cuando los hay", () => {
    expect(etiquetaPlanPrevio(anterior)).toBe("PO PO 12");
  });

  it("sin número, se reconoce por el titular — nunca un «—» que no se puede elegir", () => {
    expect(etiquetaPlanPrevio({ id: "x", planNumber: null, planType: "DEMA", titularName: "CCNN Santa Rosa", arffs: null, region: null })).toBe(
      "DEMA de CCNN Santa Rosa",
    );
  });
});
