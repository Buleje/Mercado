import { describe, it, expect } from "vitest";
import { corridaDeServicio, corridaMixta, decidirCogs, type OrigenParaCogs } from "@/lib/forestal/ctp-cogs";

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

describe("decidirCogs — madera de servicio (ADR-437 §1): no lleva costo y NO es faltante", () => {
  it("un despacho de madera ajena da motivo «madera_de_servicio», no «falta_costo»", () => {
    // Blas 26-09: las corridas de WASACO no tienen costo (la madera no se compró).
    const r = decidirCogs({
      declarado: 10,
      moneda: "PEN",
      origenes: [origen({ quantity: 10, costoUnitario: null, maderaDeServicio: true })],
    });
    expect(r.cogs).toBeNull(); // nunca 0: un 0 fingiría margen 100 %
    expect(r.motivo).toBe("madera_de_servicio");
    expect(r.detalle[0].maderaDeServicio).toBe(true);
  });

  it("una corrida COMPRADA sin factura sigue siendo faltante aunque el despacho mezcle servicio", () => {
    const r = decidirCogs({
      declarado: 20,
      moneda: "PEN",
      origenes: [
        origen({ quantity: 10, costoUnitario: null, maderaDeServicio: true }),
        origen({ lineNo: 2, quantity: 10, costoUnitario: null }),
      ],
    });
    expect(r.motivo).toBe("falta_costo");
  });

  it("comprada con costo + servicio = MIXTO: la parte propia se costea, pero el despacho queda incompleto", () => {
    // Revisión 26-09: salía «servicio» y la venta (S/ 9 000 en la repro) se
    // caía del P&L sin contarse como incompleta ni avisar.
    const r = decidirCogs({
      declarado: 20,
      moneda: "PEN",
      origenes: [
        origen({ quantity: 10, costoUnitario: 5 }),
        origen({ lineNo: 2, quantity: 10, costoUnitario: null, maderaDeServicio: true }),
      ],
    });
    expect(r.cogs).toBeNull(); // el costo parcial solo inflaría el margen
    expect(r.motivo).toBe("mixto_servicio");
    expect(r.cogsPropio).toBe(50); // lo que sí se sabe, dicho aparte
    expect(r.detalle[0].costo).toBe(50);
    expect(r.detalle[1].maderaDeServicio).toBe(true);
  });

  it("una corrida que mezcla madera propia y ajena (corrida mixta) también hace mixto el despacho", () => {
    const r = decidirCogs({
      declarado: 10,
      moneda: "PEN",
      origenes: [origen({ quantity: 10, costoUnitario: null, mezclaServicio: true })],
    });
    expect(r.motivo).toBe("mixto_servicio"); // no «falta_costo»: no hay factura que esperar
    expect(r.cogs).toBeNull();
    expect(r.cogsPropio).toBeNull(); // la corrida mixta no se separa por dueño
    expect(r.detalle[0].mezclaServicio).toBe(true);
  });

  it("todo de servicio (sin nada propio) sigue siendo «madera_de_servicio», no mixto", () => {
    const r = decidirCogs({
      declarado: 20,
      moneda: "PEN",
      origenes: [
        origen({ quantity: 10, costoUnitario: null, maderaDeServicio: true }),
        origen({ lineNo: 2, quantity: 10, costoUnitario: null, maderaDeServicio: true }),
      ],
    });
    expect(r.motivo).toBe("madera_de_servicio");
    expect(r.cogsPropio).toBeNull();
  });

  it("la moneda de una corrida de servicio no cuenta como «monedas mezcladas»", () => {
    const r = decidirCogs({
      declarado: 20,
      moneda: "PEN",
      origenes: [
        origen({ quantity: 10, costoUnitario: 5 }),
        origen({ lineNo: 2, quantity: 10, costoUnitario: null, moneda: "USD", maderaDeServicio: true }),
      ],
    });
    expect(r.motivo).toBe("mixto_servicio");
  });

  it("el volumen sin corrida sigue siendo un hueco aunque lo atribuido sea de servicio", () => {
    const r = decidirCogs({
      declarado: 20,
      moneda: "PEN",
      origenes: [origen({ quantity: 15, costoUnitario: null, maderaDeServicio: true })],
    });
    expect(r.motivo).toBe("sin_atribucion");
    expect(r.sinAtribuir).toBe(5);
  });

  it("sin la marca, el comportamiento de antes no cambia", () => {
    const r = decidirCogs({ declarado: 10, moneda: "PEN", origenes: [origen({ quantity: 10, costoUnitario: null })] });
    expect(r.motivo).toBe("falta_costo");
    expect(r.detalle[0].maderaDeServicio).toBe(false);
  });
});

describe("corridaDeServicio — de dónde sale la marca", () => {
  it("consumió una guía de servicio (costoDeLinea → madera_de_servicio)", () => {
    expect(corridaDeServicio({ motivo: "madera_de_servicio", costoUnitario: null, duenoMadera: null })).toBe(true);
  });

  it("corrida «de tercero» sin consumos (las de WASACO en Blas)", () => {
    expect(corridaDeServicio({ motivo: "sin_consumos", costoUnitario: null, duenoMadera: "tercero" })).toBe(true);
  });

  it("de tercero pero CON costo conocido: la marca no esconde un número que existe", () => {
    expect(corridaDeServicio({ motivo: "ok", costoUnitario: 12.5, duenoMadera: "tercero" })).toBe(false);
  });

  it("de tercero pero con una factura faltante: NO es servicio (esa factura sí se espera)", () => {
    // Revisión 26-09: bastaba «tercero + sin costo» y un falta_factura quedaba escondido.
    expect(corridaDeServicio({ motivo: "falta_factura", costoUnitario: null, duenoMadera: "tercero" })).toBe(false);
    expect(corridaDeServicio({ motivo: "monedas_mezcladas", costoUnitario: null, duenoMadera: "tercero" })).toBe(false);
  });

  it("una corrida mixta no es de servicio: es mixta", () => {
    const c = { motivo: "mixto_servicio", costoUnitario: null, duenoMadera: "tercero" };
    expect(corridaDeServicio(c)).toBe(false);
    expect(corridaMixta(c)).toBe(true);
    expect(corridaMixta({ motivo: "madera_de_servicio", costoUnitario: null })).toBe(false);
  });

  it("corrida propia o sin declarar, sin factura: NO es servicio (sigue siendo faltante)", () => {
    expect(corridaDeServicio({ motivo: "falta_factura", costoUnitario: null, duenoMadera: "propia" })).toBe(false);
    expect(corridaDeServicio({ motivo: "sin_consumos", costoUnitario: null, duenoMadera: null })).toBe(false);
  });
});
