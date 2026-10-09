/**
 * Trueque del POS (lib/pos/trueque.ts): lo recibido es un DESCUENTO de la venta
 * y el resto se cobra con un medio real. Antes, con diferencia la ruta respondía
 * 400 siempre y sin diferencia la caja esperaba efectivo que nunca entró.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  armarCobroTrueque,
  calcularTrueque,
  frenaPorRol,
  notaTrueque,
  rolDescuentaSinTope,
} from "@/lib/pos/trueque";
import {
  excedeTopeCajero,
  topeDescuentoCajero,
  topeDescuentoCajeroCentimos,
  TOPE_DESCUENTO_CAJERO_PCT,
} from "@/lib/pos/descuento-cajero";

describe("calcularTrueque", () => {
  it("con diferencia: descuenta lo recibido y cobra el resto", () => {
    const c = calcularTrueque(25, 10);
    expect(c.descuento).toBe(10);
    expect(c.aCobrar).toBe(15);
    expect(c.sobra).toBe(0);
  });

  it("lo recibido vale más que la venta: descuenta el total, cobra 0 y no devuelve el exceso", () => {
    const c = calcularTrueque(12.5, 20);
    expect(c.descuento).toBe(12.5);
    expect(c.aCobrar).toBe(0);
    expect(c.sobra).toBe(7.5);
  });

  it("redondea al céntimo (sin 0,30000000000000004)", () => {
    const c = calcularTrueque(0.3, 0.1);
    expect(c.aCobrar).toBe(0.2);
  });

  it("valores vacíos, negativos o NaN cuentan como 0", () => {
    expect(calcularTrueque(10, Number.NaN).descuento).toBe(0);
    expect(calcularTrueque(10, -5).aCobrar).toBe(10);
    expect(calcularTrueque(-3, 5).descuento).toBe(0);
  });

  it("tope de cajero = 15 % hacia abajo al céntimo, en céntimos enteros", () => {
    expect(calcularTrueque(33.33, 5).topeCajero).toBe(4.99);
    // 9 × 0,15 = 1,3499… con decimales: antes S/ 1,35 salía 403 en la ruta.
    expect(calcularTrueque(9, 1.35).topeCajero).toBe(1.35);
    expect(calcularTrueque(9, 1.35).pasaTopeCajero).toBe(false);
    expect(calcularTrueque(9, 1.36).pasaTopeCajero).toBe(true);
    expect(calcularTrueque(33.33, 5).pasaTopeCajero).toBe(true);
    expect(calcularTrueque(20, 3).pasaTopeCajero).toBe(false);
    expect(calcularTrueque(25, 3.75).pasaTopeCajero).toBe(false);
    expect(calcularTrueque(25, 3.76).pasaTopeCajero).toBe(true);
  });
});

describe("rol", () => {
  it("admin y dueño descuentan sin tope; cajero, encargado y rol vacío no", () => {
    expect(rolDescuentaSinTope("admin")).toBe(true);
    expect(rolDescuentaSinTope("owner")).toBe(true);
    expect(rolDescuentaSinTope("cajero")).toBe(false);
    expect(rolDescuentaSinTope("manager")).toBe(false);
    expect(rolDescuentaSinTope(null)).toBe(false);
  });

  it("frena al cajero que pasa el 15 %; rol aún cargando no frena (decide la ruta)", () => {
    const c = calcularTrueque(25, 10);
    expect(frenaPorRol(c, "cajero")).toBe(true);
    expect(frenaPorRol(c, "admin")).toBe(false);
    expect(frenaPorRol(c, null)).toBe(false);
    expect(frenaPorRol(calcularTrueque(25, 3), "cajero")).toBe(false);
  });
});

describe("armarCobroTrueque", () => {
  it("con diferencia: una línea con el medio elegido por lo que falta", () => {
    const cobro = armarCobroTrueque(calcularTrueque(25, 10), "yape", "  3 kg   de plátano ");
    expect(cobro.pago).toEqual({ method: "yape", amount: 15 });
    expect(cobro.descuento).toBe(10);
    expect(cobro.trueque).toEqual({ recibido: "3 kg de plátano", valor: 10 });
    expect(cobro.nota).toBe("Trueque: 3 kg de plátano (S/ 10.00)");
  });

  it("sin diferencia: efectivo por S/ 0 (la caja no espera plata que no entró)", () => {
    const cobro = armarCobroTrueque(calcularTrueque(12.5, 20), "plin", "2 gallinas");
    expect(cobro.pago).toEqual({ method: "efectivo", amount: 0 });
    expect(cobro.descuento).toBe(12.5);
    expect(cobro.nota).toBe("Trueque: 2 gallinas (S/ 20.00)");
  });

  it("el pagado + el descuento cierran el total que valida la ruta (amountPaid + 0,01 ≥ total − descuento)", () => {
    for (const [total, valor] of [
      [24.9, 7.3],
      [0.3, 0.1],
      [99.99, 33.33],
      [10, 10],
    ]) {
      const c = calcularTrueque(total, valor);
      const cobro = armarCobroTrueque(c, "efectivo", "x");
      expect(cobro.pago.amount + 0.01).toBeGreaterThanOrEqual(total - cobro.descuento);
    }
  });
});

describe("notaTrueque", () => {
  it("recorta a 200 caracteres y formatea el valor con 2 decimales", () => {
    expect(notaTrueque("yuca", 4)).toBe("Trueque: yuca (S/ 4.00)");
    expect(notaTrueque("a".repeat(300), 1).length).toBe("Trueque:  (S/ 1.00)".length + 200);
  });
});

describe("guardián: el espejo coincide con POST /api/sales", () => {
  const ruta = readFileSync(join(process.cwd(), "app/api/sales/route.ts"), "utf8");

  it("la ruta usa la MISMA función del tope (céntimos), no un 0.15 con decimales", () => {
    expect(TOPE_DESCUENTO_CAJERO_PCT).toBe(15);
    expect(ruta).toMatch(/from "@\/lib\/pos\/descuento-cajero"/);
    expect(ruta).toMatch(/!isPrivilegedRole && excedeTopeCajero\(requestedDiscount, total\)/);
    expect(ruta).not.toMatch(/total \* 0\.15/);
  });

  it("los roles sin tope de la ruta son admin y owner", () => {
    expect(ruta).toMatch(/isPrivilegedRole = auth\.role === "admin" \|\| auth\.role === "owner"/);
  });

  it("la ruta acepta el trueque y deja la nota fuera del desglose MIXTO", () => {
    expect(ruta).toMatch(/trueque: z\.object\(/);
    expect(ruta).toMatch(/payment\.toUpperCase\(\) !== "MIXTO"/);
  });
});

describe("tope de cajero en céntimos (lib/pos/descuento-cajero.ts)", () => {
  it("de S/ 0,01 a S/ 1 000,00: el tope es ⌊15 % en céntimos⌋, se acepta y un céntimo más no", () => {
    const desfases: number[] = [];
    for (let c = 1; c <= 100_000; c++) {
      const total = c / 100;
      const tope = topeDescuentoCajero(total);
      const esperado = Math.floor((c * 15) / 100);
      if (
        topeDescuentoCajeroCentimos(total) !== esperado
        || excedeTopeCajero(tope, total)
        || !excedeTopeCajero(tope + 0.01, total)
        || calcularTrueque(total, tope).pasaTopeCajero
      ) {
        desfases.push(total);
      }
    }
    expect(desfases).toEqual([]);
  });

  it("valores vacíos o negativos no descuentan nada", () => {
    expect(topeDescuentoCajero(Number.NaN)).toBe(0);
    expect(excedeTopeCajero(0, 0)).toBe(false);
    expect(excedeTopeCajero(0.01, -5)).toBe(true);
  });
});
