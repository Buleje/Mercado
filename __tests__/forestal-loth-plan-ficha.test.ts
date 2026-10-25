/**
 * Ficha del plan al X % (`loth-plan-ficha`). Fixtures con la forma de los
 * planes de Blas (24-10-2026): el PO1 con resolución «ERERER» y sin especies,
 * la plantación 096 con el regente «-».
 */
import { describe, expect, it } from "vitest";
import { fichaDelPlan, textoFicha, type DatosFicha } from "@/lib/forestal/loth-plan-ficha";

const COMPLETO: DatosFicha = {
  planType: "PO",
  tituloHabilitante: "17-UCA/C-MAD-A-001-02",
  resolucionNumber: "RDF N° 105-2026",
  resolucionDate: "2026-01-14",
  vigenciaHasta: "2027-01-14",
  titularName: "Comunidad Nativa San Luis de Chinchihuani",
  titularDoc: "20601234567",
  areaHa: "820.5",
  region: "Ucayali",
  provincia: "Coronel Portillo",
  distrito: "Callería",
  regenteName: "Ing. Rosa Pérez",
  regenteRegistro: "RNR 0123",
  especiesConVolumen: 4,
};

describe("fichaDelPlan", () => {
  it("un PO completo: 8 de 8, 100 %", () => {
    const f = fichaDelPlan(COMPLETO);
    expect(f.total).toBe(8);
    expect(f.pct).toBe(100);
    expect(textoFicha(f)).toBe("Ficha completa");
  });

  it("el PO1 de Blas: relleno cuenta como faltante y cada falta lleva a su paso", () => {
    const f = fichaDelPlan({
      ...COMPLETO,
      resolucionNumber: "ERERER",
      areaHa: null,
      especiesConVolumen: 0,
      titularDoc: null,
    });
    const ids = f.faltan.map((i) => i.id);
    expect(ids).toEqual(["resolucion", "titular", "area", "especies"]);
    expect(f.pct).toBe(50);
    expect(textoFicha(f)).toBe("Ficha al 50 %");
    expect(f.faltan.find((i) => i.id === "titular")?.falta).toBe("Falta su RUC o DNI");
    expect(f.faltan.find((i) => i.id === "resolucion")?.paso).toBe("documento");
    // En un plan de bosque las especies salen del censo: no hay paso del alta.
    expect(f.faltan.find((i) => i.id === "especies")?.paso).toBeNull();
  });

  it("plantación: sin título ni vigencia ni regente; especies en su paso", () => {
    const f = fichaDelPlan({
      planType: "PLANTACION",
      resolucionNumber: "19-SEC/REG-PLT-2025-096",
      resolucionDate: "2025-06-01",
      titularName: "Inversiones Agroforestales Blas",
      titularDoc: null,
      areaHa: "0.76",
      region: "Ucayali",
      provincia: null,
      distrito: null,
      regenteName: "-",
      especiesConVolumen: 2,
    });
    expect(f.items.map((i) => i.id)).toEqual(["resolucion", "titular", "area", "ubicacion", "especies"]);
    expect(f.items.find((i) => i.id === "resolucion")?.rotulo).toBe("N° de constancia y fecha de inscripción");
    expect(f.faltan.find((i) => i.id === "ubicacion")?.falta).toBe("Falta la provincia y el distrito");
    expect(f.items.find((i) => i.id === "especies")?.paso).toBe("especies");
    expect(f.pct).toBe(60);
  });

  it("alta de bosque: sin especies que contar (null) no se exigen", () => {
    const f = fichaDelPlan({ ...COMPLETO, especiesConVolumen: null });
    expect(f.items.some((i) => i.id === "especies")).toBe(false);
    expect(f.pct).toBe(100);
  });

  it("DEMA: el regente es según el caso y no se cuenta", () => {
    const f = fichaDelPlan({ ...COMPLETO, planType: "DEMA", regenteName: null, regenteRegistro: null });
    expect(f.items.some((i) => i.id === "regente")).toBe(false);
    expect(f.pct).toBe(100);
  });

  it("regente «-» no cuenta y el registro pide cifras", () => {
    const f = fichaDelPlan({ ...COMPLETO, regenteName: "-", regenteRegistro: "PO-2026-001" });
    expect(f.faltan.find((i) => i.id === "regente")?.falta).toBe("Falta el regente");
    const sinCifra = fichaDelPlan({ ...COMPLETO, regenteRegistro: "pendiente" });
    expect(sinCifra.faltan.find((i) => i.id === "regente")?.falta).toBe("Falta su N° de registro");
  });

  it("toda fila dice de dónde sale", () => {
    for (const tipo of ["PGMF", "PO", "PMFI", "DEMA", "PLANTACION"]) {
      for (const i of fichaDelPlan({ ...COMPLETO, planType: tipo }).items) {
        expect(i.fuente.length).toBeGreaterThan(20);
      }
    }
  });

  it("nunca dice 100 % si falta algo", () => {
    const f = fichaDelPlan({ ...COMPLETO, distrito: "" });
    expect(f.pct).toBeLessThan(100);
    expect(textoFicha(f)).toBe("Ficha al 88 %");
  });
});
