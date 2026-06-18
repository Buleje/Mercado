import { describe, it, expect } from "vitest";
import {
  scoreApplication,
  isValidRuc,
  type ApplicationScoreInput,
} from "@/lib/marketplace/application-score";

function clean(over: Partial<ApplicationScoreInput> = {}): ApplicationScoreInput {
  return {
    ruc: "20123456789",
    contactName: "Juan Pérez",
    contactDni: "12345678",
    contactPhone: "987654321",
    contactEmail: "juan@bodega.pe",
    rucDocumentUrl: "https://files/ruc.pdf",
    storefrontPhotoUrl: "https://files/local.jpg",
    termsAcceptedAt: new Date("2026-06-10"),
    schedule: { lunes: "9-18" },
    deliveryZones: ["callerya"],
    ...over,
  };
}

describe("isValidRuc", () => {
  it("acepta RUC peruano válido (11 dígitos, prefijo correcto)", () => {
    expect(isValidRuc("20123456789")).toBe(true);
    expect(isValidRuc("10123456789")).toBe(true);
  });
  it("rechaza largo o prefijo inválido", () => {
    expect(isValidRuc("12345678901")).toBe(false); // prefijo 12
    expect(isValidRuc("2012345678")).toBe(false); // 10 dígitos
    expect(isValidRuc("abc")).toBe(false);
  });
});

describe("scoreApplication", () => {
  it("solicitud completa y limpia → 100, listo, sin flags", () => {
    const r = scoreApplication(clean());
    expect(r.score).toBe(100);
    expect(r.tier).toBe("listo");
    expect(r.riskFlags).toEqual([]);
  });

  it("sin documento RUC → incompleto + flag, aunque el resto esté", () => {
    const r = scoreApplication(clean({ rucDocumentUrl: null }));
    expect(r.tier).toBe("incompleto");
    expect(r.riskFlags).toContain("Sin documento RUC");
    expect(r.score).toBe(75); // 100 − 25 del doc
  });

  it("sin foto del local → incompleto", () => {
    const r = scoreApplication(clean({ storefrontPhotoUrl: null }));
    expect(r.tier).toBe("incompleto");
    expect(r.riskFlags).toContain("Sin foto del local");
  });

  it("docs OK pero RUC con formato inválido → revisar + flag", () => {
    const r = scoreApplication(clean({ ruc: "99999999999" }));
    expect(r.score).toBe(90); // pierde los 10 de ruc_format
    expect(r.riskFlags).toContain("RUC con formato inválido");
    expect(r.tier).toBe("revisar"); // hay flags → no "listo"
  });

  it("docs OK, válido, pero faltan términos/horario/reparto → revisar", () => {
    const r = scoreApplication(
      clean({ termsAcceptedAt: null, schedule: {}, deliveryZones: [] }),
    );
    expect(r.score).toBe(70); // 25+20+15+10
    expect(r.riskFlags).toEqual([]);
    expect(r.tier).toBe("revisar");
  });

  it("flags de formato de contacto (dni/email/teléfono)", () => {
    const r = scoreApplication(
      clean({ contactDni: "123", contactEmail: "no-arroba", contactPhone: "111" }),
    );
    expect(r.riskFlags).toEqual(
      expect.arrayContaining([
        "DNI con formato inválido",
        "Email inválido",
        "Teléfono inválido",
      ]),
    );
    // contacto inválido → pierde 15 → 85, pero con flags = revisar
    expect(r.tier).toBe("revisar");
  });

  it("checks reflejan cada criterio con sus puntos", () => {
    const r = scoreApplication(clean());
    const total = r.checks.reduce((a, c) => a + c.points, 0);
    expect(total).toBe(100);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });
});
