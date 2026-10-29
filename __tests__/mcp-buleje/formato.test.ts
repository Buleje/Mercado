// @ts-nocheck — importa .mjs del MCP
import { describe, it, expect } from "vitest";
import { soles, madera, numero, recortar } from "../../tools/mcp-buleje/src/formato.mjs";

describe("formato", () => {
  it("soles con punto de miles y coma decimal", () => {
    expect(soles(1234.5)).toBe("S/ 1.234,50");
    expect(soles(0)).toBe("S/ 0,00");
    expect(soles(1234567.891)).toBe("S/ 1.234.567,89");
    expect(soles(-50)).toBe("-S/ 50,00");
    expect(soles(null as any)).toBe("—");
  });
  it("madera: PT primero, después m³ y piezas", () => {
    expect(madera({ m3: 3.21, pt: 1360.5, piezas: 45 })).toBe("1.360,50 PT · 3,210 m³ · 45 piezas");
    expect(madera({ pt: 10, piezas: 1 })).toBe("10,00 PT · 1 pieza");
    expect(madera({})).toBe("—");
  });
  it("numero y recortar", () => {
    expect(numero(1000, 0)).toBe("1.000");
    const r = recortar(Array.from({ length: 70 }, (_, i) => i), 50);
    expect(r).toMatchObject({ truncado: true, total: 70 });
    expect(r.filas).toHaveLength(50);
    expect(recortar([1, 2]).truncado).toBe(false);
  });
});
