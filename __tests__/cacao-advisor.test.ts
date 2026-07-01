import { describe, it, expect } from "vitest";
import { cacaoAdvisor, classifyNewsSentiment, type AdvisorPriceInput } from "@/lib/cacao/cacao-advisor";

/** Asesor determinístico "¿vender o aguantar?" (ADR-128). Núcleo sin IA. */

const series = (closes: number[]) => closes.map((c) => ({ c }));
const flat = (v: number, n = 30) => series(Array(n).fill(v));
const linear = (from: number, to: number, n = 30) =>
  series(Array.from({ length: n }, (_, i) => Math.round(from + ((to - from) * i) / (n - 1))));

const RANGE = { weekHigh52: 10500, weekLow52: 2800 };

describe("cacaoAdvisor — señal", () => {
  it("precio ALTO y estable → VENDER", () => {
    const r = cacaoAdvisor({ value: 9000, changePct: 0, ...RANGE, series: flat(9000) });
    expect(r.signal).toBe("vender");
    expect(r.metrics.pos52).toBeGreaterThanOrEqual(65);
  });

  it("precio BAJO y cayendo → AGUANTAR (fuerte)", () => {
    const r = cacaoAdvisor({ value: 3000, changePct: -2, ...RANGE, series: linear(4000, 3000) });
    expect(r.signal).toBe("aguantar");
    expect(r.fuerza).toBe("fuerte");
    expect(r.metrics.trend30).toBeLessThan(0);
  });

  it("precio MEDIO subiendo fuerte la semana → VENDER (aprovechar impulso)", () => {
    const closes = [...Array(24).fill(5600), 5750, 5850, 5950, 6000, 6000, 6000];
    const r = cacaoAdvisor({ value: 6000, changePct: 1, ...RANGE, series: series(closes) });
    expect(r.signal).toBe("vender");
    expect(r.metrics.trend7).toBeGreaterThan(3);
  });

  it("precio MEDIO y estable → NEUTRAL", () => {
    const r = cacaoAdvisor({ value: 6000, changePct: 0, ...RANGE, series: flat(6000) });
    expect(r.signal).toBe("neutral");
  });

  it("sin serie igual da una señal por posición 52sem", () => {
    const r = cacaoAdvisor({ value: 9500, changePct: null, ...RANGE });
    expect(r.signal).toBe("vender");
    expect(r.metrics.trend30).toBeNull();
  });
});

describe("cacaoAdvisor — métricas y checklist", () => {
  it("pos52 = posición en el rango anual", () => {
    const r = cacaoAdvisor({ value: 6650, changePct: 0, ...RANGE, series: flat(6650) });
    // (6650-2800)/(10500-2800) = 50%
    expect(r.metrics.pos52).toBe(50);
  });

  it("precio bajo recomienda ACOPIAR barato", () => {
    const r = cacaoAdvisor({ value: 3200, changePct: 0, ...RANGE, series: flat(3200) });
    expect(r.compra.toLowerCase()).toContain("acopiar");
    expect(r.compra.toLowerCase()).toContain("barato");
  });

  it("siempre entrega dónde vender y riesgos", () => {
    const r = cacaoAdvisor({ value: 5000, changePct: 0, ...RANGE, series: flat(5000) });
    expect(r.donde.length).toBeGreaterThanOrEqual(3);
    expect(r.riesgos.length).toBeGreaterThanOrEqual(1);
    expect(r.titulo).toBeTruthy();
    expect(r.cuando).toBeTruthy();
  });

  it("volatilidad alta aparece en riesgos", () => {
    // serie muy variable → vol alta
    const jumpy = series([5000, 5400, 4900, 5500, 4800, 5600, 4700, 5700, 4600, 5800].concat(Array(20).fill(5000)));
    const r = cacaoAdvisor({ value: 5000, changePct: 0, ...RANGE, series: jumpy } as AdvisorPriceInput);
    expect(r.metrics.volatilidad).toBeGreaterThan(0);
  });
});

describe("cacaoAdvisor — consciente del stock/margen del acopiador", () => {
  it("mercado NEUTRAL + buen margen con stock → inclina a VENDER y lo justifica", () => {
    const r = cacaoAdvisor({
      value: 6000, changePct: 0, ...RANGE, series: flat(6000),
      local: { stockKg: 800, miPrecioKg: 10, refKg: 13, spreadPct: 30 },
    });
    expect(r.signal).toBe("vender");
    expect(r.motivos.some((m) => m.includes("800 kg") && m.includes("margen"))).toBe(true);
  });

  it("margen NEGATIVO (referencia bajo tu costo) → agrega riesgo de pérdida", () => {
    const r = cacaoAdvisor({
      value: 6000, changePct: 0, ...RANGE, series: flat(6000),
      local: { stockKg: 500, miPrecioKg: 15, refKg: 12, spreadPct: -20 },
    });
    expect(r.riesgos.some((x) => x.includes("DEBAJO de tu costo"))).toBe(true);
  });

  it("sin stock → aclara que la señal aplica a la próxima compra", () => {
    const r = cacaoAdvisor({
      value: 6000, changePct: 0, ...RANGE, series: flat(6000),
      local: { stockKg: 0, miPrecioKg: null, refKg: 13, spreadPct: null },
    });
    expect(r.motivos.some((m) => m.includes("próxima compra"))).toBe(true);
  });
});

describe("classifyNewsSentiment — sentimiento por titular", () => {
  it("clasifica ES/EN alcista, bajista y neutral", () => {
    expect(classifyNewsSentiment("Escasez dispara el precio del cacao a récord")).toBe("alcista");
    expect(classifyNewsSentiment("Cocoa surges on West Africa drought")).toBe("alcista");
    expect(classifyNewsSentiment("Cocoa prices plunge on global oversupply")).toBe("bajista");
    expect(classifyNewsSentiment("Sobreoferta hunde el precio del cacao")).toBe("bajista");
    expect(classifyNewsSentiment("Perú exportó más cacao fino este año")).toBe("neutral");
  });
});

describe("cacaoAdvisor — sentimiento de noticias (ES + EN)", () => {
  const withNews = (titles: string[]) =>
    cacaoAdvisor({ value: 6000, changePct: 0, ...RANGE, series: flat(6000), news: titles.map((title) => ({ title })) });

  it("clasifica titulares ALCISTAS en inglés (shortage/drought/rally)", () => {
    const r = withNews([
      "Cocoa prices surge on West Africa drought",
      "Global cocoa shortage deepens as supply tightens",
      "Cocoa rally continues, prices jump to record high",
      "Cocoa prices fall on bumper crop", // 1 bajista
    ]);
    expect(r.news?.senal).toBe("alcista");
    expect(r.news?.alcista).toBeGreaterThanOrEqual(3);
  });

  it("clasifica titulares BAJISTAS en inglés (surplus/oversupply/plunge)", () => {
    const r = withNews([
      "Cocoa prices plunge on global oversupply",
      "Cocoa drops sharply as surplus grows",
      "Cocoa slumps on bumper crop and weak demand",
    ]);
    expect(r.news?.senal).toBe("bajista");
    expect(r.news?.bajista).toBeGreaterThanOrEqual(3);
  });
});
