import { describe, it, expect } from "vitest";
import { makeJuntaCode } from "@/lib/junta/code";

describe("makeJuntaCode", () => {
  it("genera código con prefijo BARRIO- y 4 chars del alfabeto seguro", () => {
    const c = makeJuntaCode(() => 0.5);
    expect(c).toMatch(/^BARRIO-[A-Z0-9]{4}$/);
  });

  it("es determinista dado el rng (para tests)", () => {
    expect(makeJuntaCode(() => 0)).toBe(makeJuntaCode(() => 0));
  });

  it("varía con el rng", () => {
    expect(makeJuntaCode(() => 0)).not.toBe(makeJuntaCode(() => 0.999));
  });

  it("nunca usa caracteres ambiguos (O/0/I/1/L)", () => {
    for (let i = 0; i < 30; i++) {
      const r = i / 30;
      const suffix = makeJuntaCode(() => r).replace("BARRIO-", "");
      expect(suffix).not.toMatch(/[O0I1L]/);
    }
  });
});
