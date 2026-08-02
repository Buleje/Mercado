import { describe, expect, it } from "vitest";
import { avanceDeLote, enPieTablar, metaDeLote, paginar, resumenLotes } from "@/lib/forestal/lote-metricas";
import type { MetaEspecie } from "@/lib/forestal/ctp-cadena-lote";

const especie = (over: Partial<MetaEspecie> = {}): MetaEspecie => ({
  especie: "Tornillo",
  trozasM3: 40,
  metaM3: 22.4,
  metaPt: 9492.5,
  producidoM3: 18,
  producidoPt: 7628,
  saldoM3: 4.4,
  saldoPt: 1864.6,
  rendimientoPct: 45,
  unidadesMezcladas: false,
  ...over,
});

const lote = (over: Partial<Parameters<typeof avanceDeLote>[0]> = {}) => ({
  unit: "m3",
  totalCantidad: 10,
  despachado: 0,
  disponible: 10,
  status: "abierto",
  ...over,
});

describe("enPieTablar", () => {
  it("usa la constante del cubicador, no un 424 redondeado", () => {
    // 1 m³ = 423.78 pt. Con 424 daría 424.0 y el PDF del cubicador diría otra cosa.
    expect(enPieTablar(1)).toBe(423.8); // r1 sobre 423.78
    expect(enPieTablar(10)).toBe(4237.8);
  });

  it("un valor no finito da 0, no NaN en pantalla", () => {
    expect(enPieTablar(Number.NaN)).toBe(0);
    expect(enPieTablar(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("resumenLotes", () => {
  it("suma armado, despachado y disponible de los lotes en m³", () => {
    const r = resumenLotes([
      lote({ totalCantidad: 10, despachado: 4, disponible: 6 }),
      lote({ totalCantidad: 5, despachado: 5, disponible: 0 }),
    ]);
    expect(r.armadoM3).toBe(15);
    expect(r.despachadoM3).toBe(9);
    expect(r.disponibleM3).toBe(6);
    expect(r.lotesEnM3).toBe(2);
  });

  it("NO suma lotes de otra unidad: un total sin unidad parece exacto y no lo es", () => {
    const r = resumenLotes([
      lote({ totalCantidad: 10, despachado: 0, disponible: 10 }),
      lote({ unit: "kg", totalCantidad: 800, despachado: 0, disponible: 800 }),
    ]);
    expect(r.armadoM3).toBe(10);
    expect(r.lotesEnM3).toBe(1);
    expect(r.lotesOtraUnidad).toBe(1);
  });

  it("el lote anulado no cuenta: dejó de existir como acuerdo", () => {
    const r = resumenLotes([
      lote({ totalCantidad: 10, despachado: 0, disponible: 10 }),
      lote({ totalCantidad: 99, despachado: 0, disponible: 99, status: "anulado" }),
    ]);
    expect(r.armadoM3).toBe(10);
    expect(r.lotesEnM3).toBe(1);
  });

  it("el avance es null sin nada armado, no 0% (que afirmaría que no salió nada)", () => {
    expect(resumenLotes([]).avancePct).toBeNull();
    expect(resumenLotes([lote({ totalCantidad: 0, disponible: 0 })]).avancePct).toBeNull();
  });

  it("convierte el total a pie tablar una sola vez, sobre el m³ ya sumado", () => {
    const r = resumenLotes([
      lote({ totalCantidad: 1, despachado: 0, disponible: 1 }),
      lote({ totalCantidad: 1, despachado: 0, disponible: 1 }),
    ]);
    // Sumar y convertir, no convertir y sumar: 2 × 423.78 = 847.56 → 847.6
    expect(r.armadoPt).toBe(847.6);
  });
});

describe("avanceDeLote", () => {
  it("distingue 'sin armar' de 'nada despachado'", () => {
    expect(avanceDeLote(lote({ totalCantidad: 0, disponible: 0 })).sinArmar).toBe(true);
    expect(avanceDeLote(lote({ totalCantidad: 10, despachado: 0 })).sinArmar).toBe(false);
  });

  it("marca completo recién al salir todo", () => {
    expect(avanceDeLote(lote({ totalCantidad: 10, despachado: 9.9 })).completo).toBe(false);
    expect(avanceDeLote(lote({ totalCantidad: 10, despachado: 10 })).completo).toBe(true);
  });

  it("un despacho mayor que lo armado no pinta una barra rota", () => {
    const a = avanceDeLote(lote({ totalCantidad: 10, despachado: 14 }));
    expect(a.pct).toBe(100);
  });
});

describe("metaDeLote", () => {
  it("hace la cuenta del jefe de planta: 40 m³ al 56% son 22.4, llevo 18, faltan 4.4", () => {
    const m = metaDeLote([especie()]);
    expect(m?.trozasM3).toBe(40);
    expect(m?.metaM3).toBe(22.4);
    expect(m?.producidoM3).toBe(18);
    expect(m?.saldoM3).toBe(4.4);
    expect(m?.rendimientoPct).toBe(45); // 18/40
  });

  it("suma varias especies y las cuenta", () => {
    const m = metaDeLote([
      especie({ trozasM3: 40, metaM3: 22.4, producidoM3: 18 }),
      especie({ especie: "Capirona", trozasM3: 10, metaM3: 5.6, producidoM3: 6 }),
    ]);
    expect(m?.trozasM3).toBe(50);
    expect(m?.metaM3).toBe(28);
    expect(m?.producidoM3).toBe(24);
    expect(m?.especies).toBe(2);
    // Una especie sobre la meta compensa a la otra: el saldo es del LOTE.
    expect(m?.saldoM3).toBe(4);
  });

  it("sin consumo atribuido devuelve null, no un 0% que afirma que no rindió", () => {
    expect(metaDeLote([])).toBeNull();
    expect(metaDeLote([especie({ trozasM3: 0, metaM3: 0, producidoM3: 0 })])).toBeNull();
  });

  it("arrastra la marca de unidades mezcladas: el saldo es parcial", () => {
    const m = metaDeLote([especie(), especie({ especie: "Capirona", unidadesMezcladas: true })]);
    expect(m?.unidadesMezcladas).toBe(true);
  });

  it("el saldo negativo se conserva: superar la meta es información, no un error", () => {
    const m = metaDeLote([especie({ metaM3: 22.4, producidoM3: 25 })]);
    expect(m?.saldoM3).toBeLessThan(0);
  });

  it("convierte a pie tablar con la constante del cubicador", () => {
    const m = metaDeLote([especie({ trozasM3: 10, metaM3: 1, producidoM3: 1 })]);
    expect(m?.metaPt).toBe(423.8);
  });
});

describe("paginar", () => {
  const items = Array.from({ length: 47 }, (_, i) => i + 1);

  it("recorta la página pedida y reporta el rango humano", () => {
    const r = paginar(items, 2, 10);
    expect(r.visibles).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(r.desde).toBe(11);
    expect(r.hasta).toBe(20);
    expect(r.paginas).toBe(5);
  });

  it("la última página trae el resto, no un bloque completo", () => {
    const r = paginar(items, 5, 10);
    expect(r.visibles).toHaveLength(7);
    expect(r.hasta).toBe(47);
  });

  it("clampea la página fuera de rango en vez de mostrar vacío", () => {
    // Si el filtro achica la lista mientras estás en la página 4, una tabla
    // vacía se lee como "no hay resultados" cuando sí los hay, más arriba.
    const r = paginar(items.slice(0, 12), 9, 10);
    expect(r.pagina).toBe(2);
    expect(r.visibles).toHaveLength(2);
  });

  it("con la lista vacía no inventa un rango", () => {
    const r = paginar([], 1, 10);
    expect(r.visibles).toEqual([]);
    expect(r.desde).toBe(0);
    expect(r.hasta).toBe(0);
    expect(r.paginas).toBe(1);
  });

  it("aguanta entradas basura sin dividir por cero", () => {
    expect(paginar(items, 0, 0).pagina).toBe(1);
    expect(paginar(items, -3, 10).pagina).toBe(1);
    expect(paginar(items, 1.7, 10.4).visibles).toHaveLength(10);
  });
});

describe("metaDeLote · el 56% es un TECHO de SERFOR, no una meta", () => {
  // RDE D000259-2024: el coeficiente referencial es la señal de blanqueo cuando
  // se lo supera —se declara más madera de la que la troza puede dar—, no un
  // objetivo a alcanzar. Este bloque existe porque la primera versión pintaba
  // "superó la meta" en VERDE, felicitando justo lo que hay que revisar.
  const conRinde = (trozasM3: number, producidoM3: number) =>
    metaDeLote([especie({ trozasM3, producidoM3, metaM3: trozasM3 * 0.56 })]);

  it("quedarse corto NO se marca: es productividad, no una infracción", () => {
    const m = conRinde(100, 45); // 45 %
    expect(m?.rendimientoPct).toBe(45);
    expect(m?.sobreReferencial).toBe(false);
  });

  it("rendir justo el referencial tampoco se marca", () => {
    expect(conRinde(100, 56)?.sobreReferencial).toBe(false);
  });

  it("dentro de la tolerancia de 3 pp todavía no se marca", () => {
    // El ruido normal de un aserrío no puede disparar una alerta de blanqueo.
    expect(conRinde(100, 59)?.sobreReferencial).toBe(false);
  });

  it("pasada la tolerancia SÍ se marca: es la señal de blanqueo", () => {
    const m = conRinde(100, 62);
    expect(m?.rendimientoPct).toBe(62);
    expect(m?.sobreReferencial).toBe(true);
  });
});
