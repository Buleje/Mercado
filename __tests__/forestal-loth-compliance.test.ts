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
