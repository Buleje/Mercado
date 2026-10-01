/**
 * __tests__/rrhh-ganado-neto.test.ts
 *
 * ADR-417 — «Queda por pagar» = lo ganado del período − los adelantos abiertos.
 * Lo que más importa acá: sin cuenta de Adelantos vinculada la cuenta NO se
 * hace (es `null`, no un cero que se lee como «no debe nada»), y un adelanto
 * mayor que lo ganado deja DEUDA, nunca un pago negativo.
 */
import { describe, expect, it } from "vitest";
import {
  calcularQuedaPorPagar,
  explicarQuedaPorPagar,
  totalQuedaPorPagar,
  type PersonaParaNeto,
} from "@/lib/rrhh/ganado";

const persona = (total: number, abiertosPen: number | null): PersonaParaNeto => ({
  total,
  adelantos: abiertosPen == null ? null : { abiertosPen },
});

describe("calcularQuedaPorPagar — una persona", () => {
  it("sin cuenta de Adelantos vinculada: null, no cero", () => {
    expect(calcularQuedaPorPagar(persona(1320, null))).toBeNull();
  });

  it("el adelanto es MENOR que lo ganado: queda por pagar la diferencia", () => {
    const q = calcularQuedaPorPagar(persona(1320, 200));
    expect(q).toEqual({ ganado: 1320, adelantos: 200, neto: 1120, aPagar: 1120, deuda: 0 });
  });

  it("el adelanto es MAYOR que lo ganado: no hay pago negativo, queda deuda", () => {
    const q = calcularQuedaPorPagar(persona(480, 600));
    expect(q).not.toBeNull();
    expect(q!.neto).toBe(-120);
    expect(q!.aPagar).toBe(0); // nunca negativo: no se le cobra al trabajador en esta columna
    expect(q!.deuda).toBe(120);
  });

  it("adelanto en cero (cuenta vinculada, nada abierto): queda por pagar todo lo ganado", () => {
    const q = calcularQuedaPorPagar(persona(1320, 0));
    expect(q).toEqual({ ganado: 1320, adelantos: 0, neto: 1320, aPagar: 1320, deuda: 0 });
  });

  it("el adelanto es EXACTAMENTE lo ganado: no queda nada por pagar y tampoco deuda", () => {
    const q = calcularQuedaPorPagar(persona(900, 900));
    expect(q).toMatchObject({ neto: 0, aPagar: 0, deuda: 0 });
  });

  it("lo ganado en cero con adelanto abierto: la deuda entera sigue", () => {
    const q = calcularQuedaPorPagar(persona(0, 250));
    expect(q).toMatchObject({ aPagar: 0, deuda: 250 });
  });

  it("céntimos: la resta se redondea a 2 decimales, sin colas de punto flotante", () => {
    const q = calcularQuedaPorPagar(persona(1320.3, 0.1));
    expect(q!.neto).toBe(1320.2); // 1320.3 - 0.1 = 1320.1999999999998 en float
    expect(q!.aPagar).toBe(1320.2);
  });
});

describe("totalQuedaPorPagar — el total de la columna", () => {
  it("suma sólo a los vinculados y cuenta aparte a los que no tienen cuenta", () => {
    const total = totalQuedaPorPagar([persona(1320, 200), persona(900, 0), persona(500, null)]);
    expect(total).toEqual({ aPagar: 2020, deuda: 0, personas: 2, sinCuenta: 1, conDeuda: 0 });
  });

  it("lo que uno gana NO tapa lo que otro debe: aPagar y deuda se suman por separado", () => {
    const total = totalQuedaPorPagar([persona(1000, 100), persona(300, 500)]);
    // El neto con signo daría 900 + (−200) = 700 y el negocio sacaría 200 de menos
    // de la caja: a la primera persona hay que pagarle 900 igual.
    expect(total.aPagar).toBe(900);
    expect(total.deuda).toBe(200);
    expect(total.conDeuda).toBe(1);
  });

  it("nadie con cuenta vinculada: el total es 0 pero `personas` es 0 — la pantalla muestra «—», no S/ 0.00", () => {
    const total = totalQuedaPorPagar([persona(1320, null), persona(900, null)]);
    expect(total).toEqual({ aPagar: 0, deuda: 0, personas: 0, sinCuenta: 2, conDeuda: 0 });
  });

  it("sin personas: todo en cero, sin romper", () => {
    expect(totalQuedaPorPagar([])).toEqual({ aPagar: 0, deuda: 0, personas: 0, sinCuenta: 0, conDeuda: 0 });
  });

  it("céntimos: el total se redondea en cada paso, no acumula cola", () => {
    const total = totalQuedaPorPagar([persona(0.1, 0), persona(0.2, 0)]);
    expect(total.aPagar).toBe(0.3); // 0.1 + 0.2 = 0.30000000000000004 en float
  });
});

describe("explicarQuedaPorPagar — la línea de «Cómo sale»", () => {
  it("escribe la resta cuando queda plata por pagar", () => {
    const q = calcularQuedaPorPagar(persona(1320, 200))!;
    expect(explicarQuedaPorPagar(q)).toBe(
      "S/ 1,320.00 ganado − S/ 200.00 de adelantos abiertos = S/ 1,120.00 por pagar.",
    );
  });

  it("dice que sigue debiendo cuando el adelanto fue mayor — nunca «= S/ -120.00»", () => {
    const q = calcularQuedaPorPagar(persona(480, 600))!;
    const linea = explicarQuedaPorPagar(q);
    expect(linea).toContain("sigue debiendo S/ 120.00");
    expect(linea).not.toContain("-");
  });
});
