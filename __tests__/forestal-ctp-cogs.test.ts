import { describe, it, expect } from "vitest";
import { decidirCogs, type OrigenParaCogs } from "@/lib/forestal/ctp-cogs";

const origen = (o: Partial<OrigenParaCogs> = {}): OrigenParaCogs => ({
  lineNo: 1,
  quantity: 10,
  costoUnitario: 5,
  moneda: "PEN",
  congelado: false,
  ...o,
});

describe("decidirCogs — la regla de oro: falta un costo ⇒ null, NUNCA 0", () => {
  it("sin orígenes atribuidos no se puede costear", () => {
    const r = decidirCogs({ declarado: 10, moneda: "PEN", origenes: [] });
    expect(r.cogs).toBeNull();
    expect(r.motivo).toBe("sin_atribucion");
    expect(r.sinAtribuir).toBe(10);
  });

  it("una sola corrida sin costo envenena el total (no suma las demás)", () => {
    const r = decidirCogs({
      declarado: 20,
      moneda: "PEN",
      origenes: [origen({ quantity: 10 }), origen({ lineNo: 2, quantity: 10, costoUnitario: null })],
    });
    expect(r.cogs).toBeNull();
    expect(r.motivo).toBe("falta_costo");
    // El detalle sí muestra lo que se sabe de cada parte.
    expect(r.detalle[0].costo).toBe(50);
    expect(r.detalle[1].costo).toBeNull();
  });

  it("monedas mezcladas no se suman", () => {
    const r = decidirCogs({
      declarado: 20,
      moneda: "PEN",
      origenes: [origen({ quantity: 10 }), origen({ lineNo: 2, quantity: 10, moneda: "USD" })],
    });
    expect(r.cogs).toBeNull();
    expect(r.motivo).toBe("monedas_mezcladas");
  });

  it("volumen sin atribuir deja el costo del despacho en desconocido", () => {
    const r = decidirCogs({ declarado: 20, moneda: "PEN", origenes: [origen({ quantity: 15 })] });
    expect(r.cogs).toBeNull();
    expect(r.motivo).toBe("sin_atribucion");
    expect(r.sinAtribuir).toBe(5);
  });

  it("todo atribuido y con costo: cogs y costo unitario", () => {
    const r = decidirCogs({
      declarado: 20,
      moneda: "PEN",
      origenes: [origen({ quantity: 10, costoUnitario: 5 }), origen({ lineNo: 2, quantity: 10, costoUnitario: 7 })],
    });
    expect(r.cogs).toBe(120); // 10×5 + 10×7
    expect(r.costoUnitario).toBe(6); // 120 / 20
    expect(r.motivo).toBe("ok");
    expect(r.sinAtribuir).toBe(0);
  });

  it("sin cantidad declarada no hay costo unitario", () => {
    const r = decidirCogs({ declarado: 0, moneda: "PEN", origenes: [origen({ quantity: 0, costoUnitario: 5 })] });
    expect(r.motivo).toBe("sin_cantidad");
    expect(r.costoUnitario).toBeNull();
  });
});

describe("decidirCogs — orden de los cortes (cambiarlo cambia lo que ve el usuario)", () => {
  it("monedas mezcladas gana sobre falta de costo", () => {
    const r = decidirCogs({
      declarado: 20,
      moneda: "PEN",
      origenes: [origen({ quantity: 10, moneda: "USD" }), origen({ lineNo: 2, quantity: 10, costoUnitario: null })],
    });
    expect(r.motivo).toBe("monedas_mezcladas");
  });

  it("falta de costo gana sobre volumen sin atribuir", () => {
    const r = decidirCogs({
      declarado: 30,
      moneda: "PEN",
      origenes: [origen({ quantity: 10, costoUnitario: null })],
    });
    expect(r.motivo).toBe("falta_costo");
  });
});

describe("decidirCogs — redondeos", () => {
  it("el costo de cada parte se redondea a 2 decimales", () => {
    const r = decidirCogs({ declarado: 4, moneda: "PEN", origenes: [origen({ quantity: 4, costoUnitario: 1.256 })] });
    expect(r.detalle[0].costo).toBe(5.02); // 5.024 → 5.02
  });

  it("redondea con el flotante de JS, no con decimal exacto (queda documentado)", () => {
    // 3 × 1.005 = 3.0149999999999997 en binario, así que cae a 3.01 y no a 3.02.
    // No es un bug a "arreglar": el importe se calcula igual en todo el módulo y
    // cambiarlo acá haría que el panel y el Excel dejen de coincidir.
    const r = decidirCogs({ declarado: 3, moneda: "PEN", origenes: [origen({ quantity: 3, costoUnitario: 1.005 })] });
    expect(r.detalle[0].costo).toBe(3.01);
  });

  it("lo sin atribuir se redondea a 4 decimales (no arrastra flotantes)", () => {
    const r = decidirCogs({ declarado: 0.3, moneda: "PEN", origenes: [origen({ quantity: 0.1, costoUnitario: 1 })] });
    expect(r.sinAtribuir).toBe(0.2);
  });

  it("nunca devuelve sinAtribuir negativo si se atribuyó de más", () => {
    const r = decidirCogs({ declarado: 5, moneda: "PEN", origenes: [origen({ quantity: 10, costoUnitario: 1 })] });
    expect(r.sinAtribuir).toBe(0);
  });

  it("la moneda del despacho se conserva cuando no se puede costear", () => {
    const r = decidirCogs({ declarado: 10, moneda: "USD", origenes: [] });
    expect(r.moneda).toBe("USD");
  });
});
