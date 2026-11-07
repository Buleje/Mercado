import { describe, expect, it } from "vitest";
import {
  acumular,
  agruparMovimiento,
  diasDeMateriaPrima,
  avanzarCubo,
  construirEje,
  etiquetaDeCubo,
  inicioDeCubo,
  pasoParaBarras,
  pasoParaSpan,
  variacionPct,
  MAX_PUNTOS,
} from "@/lib/forestal/movimiento-libro";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("el eje del tiempo", () => {
  it("elige la granularidad por el largo del período", () => {
    expect(pasoParaSpan(1)).toBe("dia");
    expect(pasoParaSpan(120)).toBe("dia");
    expect(pasoParaSpan(121)).toBe("semana");
    expect(pasoParaSpan(730)).toBe("semana");
    expect(pasoParaSpan(731)).toBe("mes");
  });

  it("las BARRAS cortan antes que la línea: 67 barras diarias son ilegibles", () => {
    // El trimestre real de Brandon (junio–agosto) daba 67 barras apretadas.
    expect(pasoParaSpan(67)).toBe("dia");
    expect(pasoParaBarras(67)).toBe("semana");
    expect(pasoParaBarras(45)).toBe("dia");
    expect(pasoParaBarras(400)).toBe("semana");
    expect(pasoParaBarras(401)).toBe("mes");
  });

  it("la semana arranca LUNES, no domingo", () => {
    // 2026-08-06 es jueves.
    expect(inicioDeCubo(d("2026-08-06"), "semana").toISOString().slice(0, 10)).toBe("2026-08-03");
    // Un lunes se queda donde está.
    expect(inicioDeCubo(d("2026-08-03"), "semana").toISOString().slice(0, 10)).toBe("2026-08-03");
    // Un domingo pertenece a la semana que EMPEZÓ el lunes anterior.
    expect(inicioDeCubo(d("2026-08-09"), "semana").toISOString().slice(0, 10)).toBe("2026-08-03");
  });

  it("el mes cae al día 1 y el día se queda quieto", () => {
    expect(inicioDeCubo(d("2026-08-27"), "mes").toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(inicioDeCubo(d("2026-08-27"), "dia").toISOString().slice(0, 10)).toBe("2026-08-27");
  });

  it("avanzar respeta el paso", () => {
    expect(avanzarCubo(d("2026-08-03"), "semana").toISOString().slice(0, 10)).toBe("2026-08-10");
    expect(avanzarCubo(d("2026-01-31"), "dia").toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(avanzarCubo(d("2026-12-01"), "mes").toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("el eje incluye los extremos y no se saltea cubos vacíos", () => {
    expect(construirEje(d("2026-08-03"), d("2026-08-06"), "dia")).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
    ]);
  });

  it("un rango absurdo se corta en el tope, no cuelga la pantalla", () => {
    expect(construirEje(d("1900-01-01"), d("2100-01-01"), "dia")).toHaveLength(MAX_PUNTOS);
  });
});

describe("agruparMovimiento", () => {
  const base = {
    ingresos: [
      { fecha: d("2026-08-03"), volumenM3: 10, especie: "Mashonaste" },
      { fecha: d("2026-08-05"), volumenM3: 4, especie: "Copaiba" },
    ],
    corridas: [{ fecha: d("2026-08-05"), consumidoM3: 8, producido: 4, especie: "Mashonaste" }],
    despachos: [{ fecha: d("2026-08-06"), cantidad: 3 }],
    desde: d("2026-08-03"),
    hasta: d("2026-08-06"),
  };

  it("reparte cada movimiento en su cubo", () => {
    const r = agruparMovimiento(base);
    expect(r.paso).toBe("dia");
    expect(r.puntos.map((p) => p.ingresoM3)).toEqual([10, 0, 4, 0]);
    expect(r.puntos.map((p) => p.consumoM3)).toEqual([0, 0, 8, 0]);
    expect(r.puntos.map((p) => p.despachado)).toEqual([0, 0, 0, 3]);
  });

  it("un día sin movimiento se dibuja en CERO, no se saltea", () => {
    // «No entró madera» y «no hay datos» son cosas distintas.
    const r = agruparMovimiento(base);
    expect(r.puntos).toHaveLength(4);
    expect(r.puntos[1]).toMatchObject({ fecha: "2026-08-04", ingresoM3: 0, consumoM3: 0 });
  });

  it("el rendimiento se pondera por el consumo, no es promedio de corridas", () => {
    const r = agruparMovimiento({
      ...base,
      corridas: [
        // 90% sobre 1 m³ y 40% sobre 9 m³: el promedio simple daría 65%.
        { fecha: d("2026-08-05"), consumidoM3: 1, producido: 0.9 },
        { fecha: d("2026-08-05"), consumidoM3: 9, producido: 3.6 },
      ],
    });
    expect(r.puntos[2].rendimiento).toBe(45);
    expect(r.totales.rendimiento).toBe(45);
  });

  it("una corrida abierta (consumió y no declaró) NO baja el rendimiento del cubo", () => {
    const r = agruparMovimiento({
      ...base,
      corridas: [
        { fecha: d("2026-08-05"), consumidoM3: 10, producido: 5 },
        { fecha: d("2026-08-05"), consumidoM3: 10, producido: 0 },
      ],
    });
    // El rendimiento del cubo mira sólo lo declarado: 50%.
    expect(r.puntos[2].rendimiento).toBe(50);
    // …pero el consumo del cubo sí cuenta los 20 m³ que entraron a la sierra.
    expect(r.puntos[2].consumoM3).toBe(20);
  });

  /**
   * Medido en el tenant de pruebas: el tablero mostraba **146 % de rendimiento**
   * porque dividía pies tablares producidos por metros cúbicos consumidos. Un
   * aserradero no saca más madera de la que mete.
   */
  it("una corrida que declara en OTRA unidad no entra al rendimiento", () => {
    const r = agruparMovimiento({
      ...base,
      corridas: [
        { fecha: d("2026-08-05"), consumidoM3: 10, producido: 5, unidad: "m3" },
        { fecha: d("2026-08-05"), consumidoM3: 2, producido: 900, unidad: "pt" },
      ],
    });
    expect(r.totales.rendimiento).toBe(50);
    expect(r.totales.corridasOtraUnidad).toBe(1);
    // Su producción y su consumo SÍ cuentan: lo que no se puede es dividirlos.
    expect(r.totales.producido).toBe(905);
    expect(r.totales.consumoM3).toBe(12);
  });

  it("sin unidad declarada se asume m³ — es el default del libro", () => {
    const r = agruparMovimiento({
      ...base,
      corridas: [{ fecha: d("2026-08-05"), consumidoM3: 10, producido: 4 }],
    });
    expect(r.totales.rendimiento).toBe(40);
    expect(r.totales.corridasOtraUnidad).toBe(0);
  });

  it("si NINGUNA corrida está en m³, el rendimiento es 0 y no un número inventado", () => {
    const r = agruparMovimiento({
      ...base,
      corridas: [{ fecha: d("2026-08-05"), consumidoM3: 10, producido: 4000, unidad: "pt" }],
    });
    expect(r.totales.rendimiento).toBe(0);
    expect(r.totales.corridasOtraUnidad).toBe(1);
  });

  it("los totales cierran y la variación del patio es ingreso − consumo", () => {
    const r = agruparMovimiento(base);
    expect(r.totales).toMatchObject({
      ingresoM3: 14, consumoM3: 8, producido: 4, despachado: 3, variacionPatioM3: 6,
    });
  });

  /**
   * El stock NO es la variación. Proyectar «días de materia prima» sobre la
   * variación daba 408 días en un patio que sólo acumuló 57 m³ ese trimestre.
   */
  it("el saldo del patio suma la apertura; la variación no", () => {
    const sin = agruparMovimiento(base).totales;
    expect(sin.variacionPatioM3).toBe(6);
    expect(sin.saldoPatioM3).toBe(6);

    const con = agruparMovimiento({ ...base, aperturaM3: 100 }).totales;
    expect(con.variacionPatioM3).toBe(6);
    expect(con.saldoPatioM3).toBe(106);
  });

  it("agrupa por especie y ordena por lo que más se movió", () => {
    const r = agruparMovimiento(base);
    expect(r.porEspecie).toEqual([
      { especie: "Mashonaste", ingresoM3: 10, consumoM3: 8 },
      { especie: "Copaiba", ingresoM3: 4, consumoM3: 0 },
    ]);
  });

  it("una especie vacía se nombra, no se pierde", () => {
    const r = agruparMovimiento({
      ...base,
      ingresos: [{ fecha: d("2026-08-03"), volumenM3: 2, especie: "  " }],
    });
    expect(r.porEspecie.find((e) => e.especie === "Sin especie")).toEqual({
      especie: "Sin especie", ingresoM3: 2, consumoM3: 0,
    });
  });

  it("un movimiento fuera del período no rompe ni se cuela en un cubo ajeno", () => {
    const r = agruparMovimiento({
      ...base,
      ingresos: [...base.ingresos, { fecha: d("2025-01-01"), volumenM3: 999 }],
    });
    expect(r.totales.ingresoM3).toBe(14);
  });

  it("un período largo se agrupa por semana sin que nadie lo pida", () => {
    const r = agruparMovimiento({
      ingresos: [], corridas: [], despachos: [],
      desde: d("2026-01-01"), hasta: d("2026-08-06"),
    });
    expect(r.paso).toBe("semana");
    expect(r.puntos[0].fecha).toBe("2025-12-29"); // el lunes de esa semana
  });
});

describe("variacionPct", () => {
  it("compara contra el período anterior", () => {
    expect(variacionPct(120, 100)).toBe(20);
    expect(variacionPct(80, 100)).toBe(-20);
  });

  it("contra cero devuelve null: «+∞ %» no es una lectura", () => {
    expect(variacionPct(50, 0)).toBeNull();
    expect(variacionPct(0, 0)).toBeNull();
  });
});

describe("etiquetaDeCubo", () => {
  it("día y semana van dd/mm; el mes va en letras", () => {
    expect(etiquetaDeCubo("2026-08-03", "dia")).toBe("03/08");
    expect(etiquetaDeCubo("2026-08-03", "semana")).toBe("03/08");
    expect(etiquetaDeCubo("2026-08-01", "mes")).toBe("ago 26");
  });
});

describe("acumular", () => {
  const puntos = [
    { fecha: "2026-08-03", ingresoM3: 10, consumoM3: 0, producido: 0, despachado: 0, rendimiento: 0 },
    { fecha: "2026-08-04", ingresoM3: 0, consumoM3: 4, producido: 2, despachado: 0, rendimiento: 50 },
    { fecha: "2026-08-05", ingresoM3: 5, consumoM3: 6, producido: 3, despachado: 0, rendimiento: 50 },
  ];

  it("suma las dos series y el patio es apertura + entrada − sierra", () => {
    expect(acumular(puntos)).toEqual([
      { fecha: "2026-08-03", ingresoAcum: 10, consumoAcum: 0, patio: 10 },
      { fecha: "2026-08-04", ingresoAcum: 10, consumoAcum: 4, patio: 6 },
      { fecha: "2026-08-05", ingresoAcum: 15, consumoAcum: 10, patio: 5 },
    ]);
  });

  it("la apertura corre la curva del patio, no las acumuladas", () => {
    const r = acumular(puntos, 100);
    expect(r[0]).toMatchObject({ ingresoAcum: 10, patio: 110 });
    expect(r.at(-1)!.patio).toBe(105);
  });

  it("sin puntos no inventa una curva", () => {
    expect(acumular([])).toEqual([]);
  });
});

describe("diasDeMateriaPrima", () => {
  it("proyecta con el consumo promedio del período", () => {
    // 30 m³ en 30 días = 1 m³/día; con 45 m³ en patio quedan 45 días.
    expect(diasDeMateriaPrima(45, 30, 30)).toBe(45);
  });

  it("sin consumo devuelve null: «infinitos días de madera» no es una lectura", () => {
    expect(diasDeMateriaPrima(45, 0, 30)).toBeNull();
  });

  it("sin saldo tampoco proyecta", () => {
    expect(diasDeMateriaPrima(0, 30, 30)).toBeNull();
    expect(diasDeMateriaPrima(-5, 30, 30)).toBeNull();
  });
});
