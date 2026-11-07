import { describe, it, expect } from "vitest";
import {
  decideAutoApprove,
  getAutoApproveConfig,
  type AutoApproveConfig,
  type AutoApproveInput,
} from "@/lib/payments/yape-auto-approve";

const NOW = new Date("2026-06-17T12:00:00Z").getTime();

const onConfig: AutoApproveConfig = {
  enabled: true,
  maxDeltaPct: 0,
  maxAgeHours: 24,
  requireHighConfidence: true,
};

function input(over: Partial<AutoApproveInput> = {}): AutoApproveInput {
  return {
    expectedAmount: 50,
    detectedAmount: 50,
    yapeOpCode: "12345678",
    yapeDate: new Date(NOW - 2 * 3_600_000), // hace 2h
    confidence: "high",
    now: NOW,
    ...over,
  };
}

describe("getAutoApproveConfig", () => {
  it("apagado y estricto por default (sin env)", () => {
    const c = getAutoApproveConfig({});
    expect(c.enabled).toBe(false);
    expect(c.maxDeltaPct).toBe(0);
    expect(c.maxAgeHours).toBe(24);
    expect(c.requireHighConfidence).toBe(true);
  });

  it("lee la política del entorno", () => {
    const c = getAutoApproveConfig({
      YAPE_AUTO_APPROVE: "1",
      YAPE_AUTO_APPROVE_MAX_DELTA_PCT: "0.01",
      YAPE_AUTO_APPROVE_MAX_AGE_HOURS: "48",
      YAPE_AUTO_APPROVE_ALLOW_MEDIUM: "1",
    });
    expect(c).toEqual({ enabled: true, maxDeltaPct: 0.01, maxAgeHours: 48, requireHighConfidence: false });
  });

  it("valores inválidos caen al default", () => {
    const c = getAutoApproveConfig({ YAPE_AUTO_APPROVE_MAX_DELTA_PCT: "abc", YAPE_AUTO_APPROVE_MAX_AGE_HOURS: "-5" });
    expect(c.maxDeltaPct).toBe(0);
    expect(c.maxAgeHours).toBe(24);
  });
});

describe("decideAutoApprove", () => {
  it("aprueba el caso limpio (match exacto, high, reciente)", () => {
    const d = decideAutoApprove(input(), onConfig);
    expect(d.autoApprove).toBe(true);
  });

  it("NUNCA aprueba si está deshabilitado", () => {
    const d = decideAutoApprove(input(), { ...onConfig, enabled: false });
    expect(d.autoApprove).toBe(false);
    expect(d.reason).toMatch(/deshabilitada/);
  });

  it("rechaza sin monto detectado", () => {
    expect(decideAutoApprove(input({ detectedAmount: null }), onConfig).autoApprove).toBe(false);
  });

  it("rechaza sin código de operación", () => {
    expect(decideAutoApprove(input({ yapeOpCode: null }), onConfig).autoApprove).toBe(false);
  });

  it("rechaza confianza media cuando se exige high", () => {
    expect(decideAutoApprove(input({ confidence: "medium" }), onConfig).autoApprove).toBe(false);
  });

  it("acepta confianza media si la política lo permite", () => {
    const d = decideAutoApprove(input({ confidence: "medium" }), { ...onConfig, requireHighConfidence: false });
    expect(d.autoApprove).toBe(true);
  });

  it("rechaza delta de monto por encima del umbral", () => {
    // 50 esperado vs 52 detectado = 4% > 0 (match exacto)
    expect(decideAutoApprove(input({ detectedAmount: 52 }), onConfig).autoApprove).toBe(false);
  });

  it("acepta delta dentro del umbral configurado", () => {
    // 4% con umbral 5%
    const d = decideAutoApprove(input({ detectedAmount: 52 }), { ...onConfig, maxDeltaPct: 0.05 });
    expect(d.autoApprove).toBe(true);
  });

  it("rechaza comprobante viejo (fuera de la ventana)", () => {
    const old = new Date(NOW - 48 * 3_600_000);
    expect(decideAutoApprove(input({ yapeDate: old }), onConfig).autoApprove).toBe(false);
  });

  it("rechaza fecha en el futuro", () => {
    const future = new Date(NOW + 5 * 3_600_000);
    expect(decideAutoApprove(input({ yapeDate: future }), onConfig).autoApprove).toBe(false);
  });

  it("rechaza sin fecha cuando hay chequeo de antigüedad", () => {
    expect(decideAutoApprove(input({ yapeDate: null }), onConfig).autoApprove).toBe(false);
  });

  it("ignora la antigüedad cuando maxAgeHours = 0", () => {
    const old = new Date(NOW - 999 * 3_600_000);
    const d = decideAutoApprove(input({ yapeDate: old }), { ...onConfig, maxAgeHours: 0 });
    expect(d.autoApprove).toBe(true);
  });
});
