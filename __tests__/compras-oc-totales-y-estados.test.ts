import { describe, it, expect } from "vitest";
import { totalesOC, costoUnitarioReal, totalDeOrden } from "@/lib/compras/totales-oc";
import {
  opcionesDeEstado,
  transicionValida,
  generaCuentaPorPagar,
  TRANSICIONES_OC,
} from "@/lib/compras/estados-oc";
import { saldoPendiente, estaCompleta } from "@/lib/compras/recibido-acumulado";

/**
 * Blinda los defectos medidos el 2026-08-11 sobre el tenant `main`. Los tres
 * pasaban `tsc`, `eslint` y la suite en verde: eran errores de semántica de
 * datos, invisibles para el tipo.
 */

/**
 * El checkbox «los costos que cargué ya incluyen IGV» se guardaba y no lo leía
 * ningún cálculo (auditoría 2026-08-12): desmarcarlo no agregaba el 18% por
 * ningún lado, así que con un proveedor que cotiza neto la deuda quedaba 18%
 * corta y el PDF le mostraba un IGV que ese total nunca tuvo.
 */
describe("totalDeOrden — el IGV entra una sola vez, al guardar", () => {
  it("con costos que YA incluyen IGV, el total es el subtotal (menos descuento)", () => {
    expect(totalDeOrden({ subtotal: 100, igvIncluded: true })).toBe(100);
    expect(totalDeOrden({ subtotal: 100, discountPct: 10, igvIncluded: true })).toBe(90);
  });

  it("con costos NETOS, agrega el 18% — es lo que el proveedor va a facturar", () => {
    expect(totalDeOrden({ subtotal: 100, igvIncluded: false })).toBe(118);
    // El descuento se pacta sobre la mercadería; el IGV se calcula después.
    expect(totalDeOrden({ subtotal: 100, discountPct: 10, igvIncluded: false })).toBe(106.2);
  });

  it("sin decir nada asume que ya está incluido (el default del formulario)", () => {
    expect(totalDeOrden({ subtotal: 250 })).toBe(250);
  });

  it("redondea a dos decimales: es plata, no un float suelto", () => {
    expect(totalDeOrden({ subtotal: 33.33, igvIncluded: false })).toBe(39.33);
  });

  it("un descuento fuera de rango no da un total negativo ni infla el precio", () => {
    expect(totalDeOrden({ subtotal: 100, discountPct: 150, igvIncluded: true })).toBe(0);
    expect(totalDeOrden({ subtotal: 100, discountPct: -20, igvIncluded: true })).toBe(100);
  });

  /** El invariante del módulo: lo guardado siempre contiene el IGV. */
  it("lo que guarda totalDeOrden lo lee totalesOC como IGV contenido", () => {
    const total = totalDeOrden({ subtotal: 100, igvIncluded: false });
    const t = totalesOC({ items: [{ quantity: 1, unitCost: 100 }], total });
    expect(t.total).toBe(118);
    expect(t.baseImponible).toBeCloseTo(100, 2);
    expect(t.igvContenido).toBeCloseTo(18, 2);
  });
});

describe("totales de la orden — el papel dice lo que dice la orden", () => {
  it("no le suma IGV encima al total (bug: S/160.80 se imprimía S/189.74)", () => {
    const t = totalesOC({
      items: [{ quantity: 8, unitCost: 20.1 }],
      total: 160.8,
    });
    expect(t.total).toBeCloseTo(160.8, 2);
    expect(t.baseImponible + t.igvContenido).toBeCloseTo(t.total, 2);
  });

  it("respeta el descuento pactado (bug: 5% ignorado, S/370.50 se imprimía S/460.20)", () => {
    const t = totalesOC({
      items: [{ quantity: 20, unitCost: 19.5 }],
      total: 370.5,
      discount: 5,
    });
    expect(t.subtotalBruto).toBeCloseTo(390, 2);
    expect(t.total).toBeCloseTo(370.5, 2);
    expect(t.descuentoMonto).toBeCloseTo(19.5, 2);
  });

  it("el total manda sobre lo que el cliente recalcule", () => {
    // Si el backend guardó otro total (redondeo, ajuste manual), gana el suyo.
    const t = totalesOC({ items: [{ quantity: 1, unitCost: 100 }], total: 95 });
    expect(t.total).toBe(95);
  });

  it("deriva el total cuando la orden todavía se está armando en pantalla", () => {
    const t = totalesOC({ items: [{ quantity: 2, unitCost: 50 }], total: null, discount: 10 });
    expect(t.total).toBeCloseTo(90, 2);
  });

  it("nunca devuelve NaN aunque los costos vengan sucios", () => {
    const t = totalesOC({
      items: [{ quantity: 3, unitCost: "no-es-un-numero" }],
      total: undefined,
    });
    expect(Object.values(t).every((v) => Number.isFinite(v))).toBe(true);
  });

  it("un total negativo se piso en 0, no se imprime en rojo al proveedor", () => {
    const t = totalesOC({ items: [{ quantity: 1, unitCost: 10 }], total: -5 });
    expect(t.total).toBe(0);
  });
});

describe("el flete entra al costo — ADR-377", () => {
  it("reparte el flete y el costo deja de mentir (19.50 + 40/20 = 21.50)", () => {
    const item = { quantity: 20, unitCost: 19.5 };
    expect(costoUnitarioReal(item, 390, 40)).toBeCloseTo(21.5, 2);
  });

  it("sin flete el costo no se toca", () => {
    expect(costoUnitarioReal({ quantity: 20, unitCost: 19.5 }, 390, 0)).toBeCloseTo(19.5, 2);
  });

  it("reparte por valor, no por cantidad: el caro carga más flete que el barato", () => {
    // 10 whiskies de S/100 (S/1000) + 10 fideos de S/2 (S/20) = S/1020, flete S/102.
    const whisky = costoUnitarioReal({ quantity: 10, unitCost: 100 }, 1020, 102);
    const fideo = costoUnitarioReal({ quantity: 10, unitCost: 2 }, 1020, 102);
    expect(whisky - 100).toBeCloseTo(10, 2); // 10% de su valor
    expect(fideo - 2).toBeCloseTo(0.2, 2); //  10% del suyo
    // Por cantidad, cada uno cargaría S/5.10: el fideo se encarecería 3.5 veces.
    expect(fideo).toBeLessThan(5);
  });

  it("todo el flete se reparte, no se pierde ni se inventa plata", () => {
    const items = [
      { quantity: 20, unitCost: 19.5 },
      { quantity: 5, unitCost: 40 },
    ];
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const flete = 75;
    const repartido = items.reduce(
      (s, i) => s + (costoUnitarioReal(i, subtotal, flete) - i.unitCost) * i.quantity,
      0,
    );
    expect(repartido).toBeCloseTo(flete, 2);
  });

  it("una linea sin cantidad no divide por cero", () => {
    expect(costoUnitarioReal({ quantity: 0, unitCost: 19.5 }, 390, 40)).toBe(19.5);
  });
});

describe("estados de la orden — el select ofrece sólo lo que el servidor acepta", () => {
  it("desde pendiente se puede recibir (bug: devolvía 422 por la ruta a 'emitida')", () => {
    expect(transicionValida("pendiente", "recibido")).toBe(true);
    expect(transicionValida("pendiente", "parcial")).toBe(true);
    expect(transicionValida("pendiente", "cancelado")).toBe(true);
  });

  it("no existen destinos fuera del enum de la base", () => {
    const validos = new Set(["pendiente", "parcial", "recibido", "cancelado", "auto_generated"]);
    for (const destinos of Object.values(TRANSICIONES_OC)) {
      for (const d of destinos) expect(validos.has(d)).toBe(true);
    }
  });

  it("una orden recibida ya no se reabre por el desplegable", () => {
    expect(opcionesDeEstado("recibido")).toEqual(["recibido"]);
    expect(transicionValida("recibido", "pendiente")).toBe(false);
  });

  it("el select nunca ofrece un estado que el servidor rechazaría", () => {
    for (const actual of ["pendiente", "parcial", "recibido", "cancelado", "auto_generated"]) {
      for (const ofrecido of opcionesDeEstado(actual)) {
        expect(transicionValida(actual, ofrecido)).toBe(true);
      }
    }
  });

  it("sólo el crédito abre una cuenta por pagar", () => {
    expect(generaCuentaPorPagar("contado")).toBe(false);
    expect(generaCuentaPorPagar("transferencia")).toBe(false);
    expect(generaCuentaPorPagar("credito_30")).toBe(true);
  });
});

describe("recepción acumulada — no se cuenta dos veces la misma mercadería", () => {
  it("el saldo descuenta lo ya recibido (bug: OC de 10 con 4 recibidos daba stock 14)", () => {
    expect(saldoPendiente(10, 4)).toBe(6);
  });

  it("recibir de más no resta stock", () => {
    expect(saldoPendiente(10, 12)).toBe(0);
  });

  it("dos tandas que suman lo pedido cierran la orden (bug: quedaba parcial para siempre)", () => {
    const items = [{ productId: 1, quantity: 10 }];
    expect(estaCompleta(items, new Map([[1, 4]]))).toBe(false);
    expect(estaCompleta(items, new Map([[1, 10]]))).toBe(true);
  });

  it("un producto sin recibir deja la orden abierta aunque los otros estén completos", () => {
    const items = [
      { productId: 1, quantity: 10 },
      { productId: 2, quantity: 5 },
    ];
    expect(estaCompleta(items, new Map([[1, 10]]))).toBe(false);
    expect(estaCompleta(items, new Map([[1, 10], [2, 5]]))).toBe(true);
  });
});
