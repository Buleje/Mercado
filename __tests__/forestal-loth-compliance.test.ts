/**
 * loth-compliance — score + readiness del Libro TH (ADR-305). Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import { computeLothCompliance, type LothAnomaly } from "@/lib/forestal/loth-compliance";

const CARATULA_OK = { titularName: "Maderera Blas SAC", tituloHabilitante: "CONC-25-001" };

describe("computeLothCompliance", () => {
  it("libro limpio + carátula completa → 100, ready, sin problemas", () => {
    const r = computeLothCompliance({ anomalias: [], caratula: CARATULA_OK, totalLineas: 10 });
    expect(r.score).toBe(100);
    expect(r.readiness).toBe("ready");
    expect(r.tone).toBe("success");
    expect(r.problemas).toHaveLength(0);
    expect(r.enOrden.length).toBeGreaterThan(0);
    expect(r.bloqueos).toBe(0);
  });

  it("carátula incompleta → bloqueo, −15, readiness error", () => {
    const r = computeLothCompliance({ anomalias: [], caratula: null, totalLineas: 0 });
    expect(r.score).toBe(85);
    expect(r.bloqueos).toBe(1);
    expect(r.readiness).toBe("error");
    expect(r.problemas[0].key).toBe("caratula");
  });

  it("exceso de lo autorizado → bloqueo grave (−40)", () => {
    const anomalias: LothAnomaly[] = [
      { level: "error", code: "exceso_autorizado", message: "x", species: "Caoba" },
    ];
    const r = computeLothCompliance({ anomalias, caratula: CARATULA_OK, totalLineas: 5 });
    expect(r.score).toBe(60);
    expect(r.bloqueos).toBe(1);
    expect(r.problemas[0].key).toBe("exceso");
    expect(r.problemas[0].description).toContain("Caoba");
  });

  it("especie fuera del plan autorizado → bloqueo que resta 40 (infracción OSINFOR)", () => {
    const r = computeLothCompliance({
      anomalias: [],
      caratula: CARATULA_OK,
      totalLineas: 5,
      especiesNoAutorizadas: ["Misa"],
    });
    expect(r.score).toBe(60); // 100 − 40
    expect(r.bloqueos).toBe(1);
    expect(r.readiness).toBe("error");
    expect(r.problemas[0].key).toBe("especieNoAutorizada");
    expect(r.problemas[0].description).toContain("Misa");
    expect(r.breakdown.some((b) => b.key === "especieNoAutorizada" && b.puntos === 40)).toBe(true);
  });

  it("solo advertencias (fuera de plazo + saldo bajo) → warning, no bloquea", () => {
    const anomalias: LothAnomaly[] = [
      { level: "warn", code: "fuera_de_plazo", message: "2 línea(s) fuera del plazo de 15 días." },
      { level: "warn", code: "saldo_bajo", message: "y", species: "Tornillo" },
    ];
    const r = computeLothCompliance({ anomalias, caratula: CARATULA_OK, totalLineas: 8 });
    expect(r.score).toBe(85); // 100 − 10 − 5
    expect(r.bloqueos).toBe(0);
    expect(r.advertencias).toBe(2);
    expect(r.readiness).toBe("warning");
    expect(r.tone).toBe("warning");
  });

  it("los bloqueos flotan antes que las advertencias", () => {
    const anomalias: LothAnomaly[] = [
      { level: "warn", code: "saldo_bajo", message: "y", species: "Tornillo" },
      { level: "error", code: "trozado_gt_talado", message: "z", species: "Cedro" },
    ];
    const r = computeLothCompliance({ anomalias, caratula: CARATULA_OK, totalLineas: 8 });
    expect(r.problemas[0].severity).toBe("error");
    expect(r.problemas[r.problemas.length - 1].severity).toBe("warning");
  });

  it("CITES sin permiso → advertencia informativa que NO resta score", () => {
    const r = computeLothCompliance({
      anomalias: [],
      caratula: CARATULA_OK,
      totalLineas: 5,
      citesSinPermiso: ["Caoba", "Cedro"],
    });
    expect(r.score).toBe(100); // CITES no penaliza (regla del CTP)
    expect(r.bloqueos).toBe(0);
    expect(r.advertencias).toBe(1); // aparece como recordatorio
    expect(r.readiness).toBe("warning");
    const cites = r.problemas.find((c) => c.key === "cites");
    expect(cites?.description).toContain("Caoba");
    // No aparece en el desglose del score (penalty 0)
    expect(r.breakdown.some((b) => b.key === "cites")).toBe(false);
  });

  it("el score nunca baja de 0 aunque se acumulen penalidades", () => {
    // 40+20+20+15 (bloqueos) + 10+10+5 (advertencias) = 120 → clamp a 0
    const anomalias: LothAnomaly[] = [
      { level: "error", code: "exceso_autorizado", message: "a", species: "A" },
      { level: "error", code: "rend_aserrio_imposible", message: "b" },
      { level: "error", code: "trozado_gt_talado", message: "c", species: "C" },
      { level: "warn", code: "fuera_de_plazo", message: "d" },
      { level: "warn", code: "troza_fantasma", message: "e" },
      { level: "warn", code: "saldo_bajo", message: "f", species: "F" },
    ];
    const r = computeLothCompliance({ anomalias, caratula: null, totalLineas: 3 });
    expect(r.score).toBe(0);
    expect(r.readiness).toBe("error");
  });
});

describe("guías declaradas que no existen", () => {
  it("sin guías fantasma el chequeo pasa y no resta", () => {
    const r = computeLothCompliance({ anomalias: [], caratula: CARATULA_OK, totalLineas: 10, gtfsFantasma: [] });
    expect(r.score).toBe(100);
    expect(r.enOrden.some((c) => c.key === "gtf_fantasma")).toBe(true);
  });

  it("una guía declarada y no emitida es bloqueo y resta 25", () => {
    const r = computeLothCompliance({
      anomalias: [],
      caratula: CARATULA_OK,
      totalLineas: 10,
      gtfsFantasma: ["001-0045678"],
    });
    expect(r.score).toBe(75);
    expect(r.readiness).toBe("error");
    const check = r.problemas.find((c) => c.key === "gtf_fantasma");
    expect(check?.severity).toBe("error");
    expect(check?.navTarget).toBe("gtf");
    expect(check?.description).toContain("001-0045678");
  });

  it("el input ausente se comporta como «no hay» y no inventa una infracción", () => {
    // Si el cruce no se pudo hacer (fetch caído), el libro no puede quedar
    // acusado de mover madera sin guía.
    const r = computeLothCompliance({ anomalias: [], caratula: CARATULA_OK, totalLineas: 10 });
    expect(r.problemas.some((c) => c.key === "gtf_fantasma")).toBe(false);
  });
});

describe("desglose «cómo se compone»", () => {
  it("la línea con casos activos usa el título del problema, no el del alta", () => {
    // Antes decía «Todas las guías declaradas están emitidas · −25 pts (2 casos)»:
    // el texto afirmaba justo lo contrario de lo que la penalización descontaba.
    const r = computeLothCompliance({
      anomalias: [],
      caratula: CARATULA_OK,
      totalLineas: 10,
      gtfsFantasma: ["A-1", "A-2"],
    });
    const linea = r.breakdown.find((b) => b.key === "gtf_fantasma")!;
    expect(linea.puntos).toBe(25);
    expect(linea.casos).toBe(2);
    expect(linea.label).toBe("2 guías declaradas no existen");
  });

  it("sin casos, la línea mantiene el texto en positivo y no resta", () => {
    const r = computeLothCompliance({ anomalias: [], caratula: CARATULA_OK, totalLineas: 10, gtfsFantasma: [] });
    const linea = r.breakdown.find((b) => b.key === "gtf_fantasma")!;
    expect(linea.puntos).toBe(0);
    expect(linea.label).toBe("Todas las guías declaradas están emitidas");
  });
});
