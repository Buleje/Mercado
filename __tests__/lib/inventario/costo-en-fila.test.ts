import { describe, it, expect } from "vitest";
import { leerCostoEnCentimos, centimosDelCosto, textoDeCentimos } from "@/lib/inventario/costo-en-fila";

const ok = (texto: string) => {
  const r = leerCostoEnCentimos(texto);
  if (!r.ok) throw new Error(`esperaba ok para «${texto}», dio: ${r.error}`);
  return r.centimos;
};
const error = (texto: string) => {
  const r = leerCostoEnCentimos(texto);
  if (r.ok) throw new Error(`esperaba error para «${texto}», dio ${r.centimos}`);
  return r.error;
};

describe("leerCostoEnCentimos", () => {
  it("vacío = sin costo (null), nunca 0", () => {
    expect(ok("")).toBeNull();
    expect(ok("   ")).toBeNull();
    expect(ok("S/ ")).toBeNull();
  });

  it("lee el costo en céntimos exactos, sin error de float", () => {
    expect(ok("2.80")).toBe(280);
    expect(ok("2.8")).toBe(280);
    expect(ok("0.29")).toBe(29); // 0.29 * 100 = 28.999… con float
    expect(ok("1.15")).toBe(115);
    expect(ok("12")).toBe(1200);
    expect(ok(".5")).toBe(50);
    expect(ok("3.")).toBe(300);
  });

  it("acepta el símbolo, la coma decimal y la coma de miles", () => {
    expect(ok("S/ 2.80")).toBe(280);
    expect(ok("s/.2.80")).toBe(280);
    expect(ok("2,80")).toBe(280);
    expect(ok("2,5")).toBe(250);
    expect(ok("1,250.50")).toBe(125050);
  });

  it("rechaza negativo, 0, letras y más de 2 decimales", () => {
    expect(error("-2")).toMatch(/negativo/);
    expect(error("0")).toMatch(/vacío/);
    expect(error("0.00")).toMatch(/vacío/);
    expect(error("abc")).toMatch(/2\.80/);
    expect(error("2.805")).toMatch(/2 decimales/);
    expect(error("1,2,3")).toMatch(/2\.80/);
    // Coma + 3 cifras sin punto: ¿miles o decimal? Leerlo como miles guardaba
    // 1000 veces el costo («0,500» → S/ 500.00) sin aviso.
    expect(error("1,250")).toMatch(/2805 o 2\.80/);
    expect(leerCostoEnCentimos("0,500").ok).toBe(false);
    expect(leerCostoEnCentimos("0,050").ok).toBe(false);
    expect(leerCostoEnCentimos("2,805").ok).toBe(false);
    expect(leerCostoEnCentimos("1,250,000").ok).toBe(false);
    expect(error(".")).toMatch(/2\.80/);
    expect(error("2e3")).toMatch(/2\.80/);
  });

  it("rechaza un costo absurdo", () => {
    expect(error("1000000.01")).toMatch(/grande/);
    expect(ok("1000000")).toBe(100_000_000);
  });
});

describe("centimosDelCosto / textoDeCentimos", () => {
  it("lo guardado sin costo o en 0 cuenta como sin costo", () => {
    expect(centimosDelCosto(null)).toBeNull();
    expect(centimosDelCosto(undefined)).toBeNull();
    expect(centimosDelCosto(0)).toBeNull();
    expect(centimosDelCosto("0.00")).toBeNull();
  });

  it("Decimal como texto o número → céntimos redondeados", () => {
    expect(centimosDelCosto("2.80")).toBe(280);
    expect(centimosDelCosto(0.29)).toBe(29);
  });

  it("céntimos → texto de la casilla", () => {
    expect(textoDeCentimos(null)).toBe("");
    expect(textoDeCentimos(280)).toBe("2.80");
    expect(textoDeCentimos(5)).toBe("0.05");
    expect(textoDeCentimos(125050)).toBe("1250.50");
  });
});
