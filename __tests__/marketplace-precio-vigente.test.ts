import { describe, expect, it } from "vitest";
import { ofertaVigente, precioVigente } from "@/lib/marketplace/precio-vigente";

/**
 * El precio que se muestra y el que se cobra tienen que salir de acá. Los casos
 * de abajo son los desacuerdos REALES que había entre la vidriera y el checkout
 * antes de unificarlos (ver el encabezado de `precio-vigente.ts`).
 */

const AHORA = new Date("2026-08-10T12:00:00Z");
const AYER = new Date("2026-08-09T12:00:00Z");
const MANANA = new Date("2026-08-11T12:00:00Z");

describe("ofertaVigente", () => {
  it("sin discountPrice no hay oferta", () => {
    expect(ofertaVigente({ retailPrice: 10, discountPrice: null }, AHORA)).toBe(false);
  });

  it("una oferta SIN caducidad vale siempre — el schema define null como eterna", () => {
    // El checkout de WhatsApp hacía justo lo contrario: exigía discountUntil
    // no nulo, así que cobraba el precio lleno sobre una oferta permanente.
    expect(ofertaVigente({ retailPrice: 10, discountPrice: 8, discountUntil: null }, AHORA)).toBe(true);
  });

  it("una oferta vencida NO vale, aunque la tarjeta la siguiera mostrando", () => {
    expect(ofertaVigente({ retailPrice: 10, discountPrice: 8, discountUntil: AYER }, AHORA)).toBe(false);
  });

  it("una oferta con fecha futura vale", () => {
    expect(ofertaVigente({ retailPrice: 10, discountPrice: 8, discountUntil: MANANA }, AHORA)).toBe(true);
  });

  it("un 'descuento' MAYOR al precio no es oferta: es un dedazo", () => {
    expect(ofertaVigente({ retailPrice: 10, discountPrice: 12 }, AHORA)).toBe(false);
  });

  it("un descuento IGUAL al precio tampoco (no ahorra nada)", () => {
    expect(ofertaVigente({ retailPrice: 10, discountPrice: 10 }, AHORA)).toBe(false);
  });

  it("un descuento de 0 no es 'gratis': es campo sin llenar", () => {
    expect(ofertaVigente({ retailPrice: 10, discountPrice: 0 }, AHORA)).toBe(false);
  });

  it("acepta Decimal de Prisma y strings sin romperse", () => {
    const dec = (n: number) => ({ toNumber: () => n });
    expect(ofertaVigente({ retailPrice: dec(10), discountPrice: dec(7) }, AHORA)).toBe(true);
    expect(ofertaVigente({ retailPrice: "10", discountPrice: "7" }, AHORA)).toBe(true);
  });

  it("una fecha inválida se trata como vencida, no como eterna", () => {
    expect(ofertaVigente({ retailPrice: 10, discountPrice: 8, discountUntil: "no-es-fecha" }, AHORA)).toBe(false);
  });
});

describe("precioVigente", () => {
  it("sin oferta devuelve el precio de lista y nada que tachar", () => {
    expect(precioVigente({ retailPrice: 10 }, AHORA)).toEqual({
      precio: 10, enOferta: false, antes: null, ahorro: 0, descuentoPct: null,
    });
  });

  it("con oferta devuelve el precio rebajado + qué tachar y cuánto se ahorra", () => {
    expect(precioVigente({ retailPrice: 10, discountPrice: 7.5 }, AHORA)).toEqual({
      precio: 7.5, enOferta: true, antes: 10, ahorro: 2.5, descuentoPct: 25,
    });
  });

  it("la oferta vencida cobra el precio de lista (era el desfase vidriera↔caja)", () => {
    const p = { retailPrice: 10, discountPrice: 8, discountUntil: AYER };
    expect(precioVigente(p, AHORA).precio).toBe(10);
    expect(precioVigente(p, AHORA).enOferta).toBe(false);
  });

  it("redondea a 2 decimales: no se cobran milésimas de sol", () => {
    const r = precioVigente({ retailPrice: 9.999, discountPrice: 7.001 }, AHORA);
    expect(r.precio).toBe(7);
    expect(r.antes).toBe(10);
  });

  it("un producto sin precio no explota: da 0 y sin oferta", () => {
    expect(precioVigente({ retailPrice: null }, AHORA)).toEqual({
      precio: 0, enOferta: false, antes: null, ahorro: 0, descuentoPct: null,
    });
  });
});
