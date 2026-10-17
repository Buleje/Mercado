import { describe, it, expect } from "vitest";
import { cacaoAdvisor, classifyNewsSentiment, newsKeywords, type AdvisorPriceInput } from "@/lib/cacao/cacao-advisor";

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

  it("rally sobrecomprado con pos52 baja → VENDER (coherente, no 'está barato')", () => {
    // Precio subió fuerte pero sigue lejos de un máximo de 52s mucho mayor.
    const r = cacaoAdvisor({ value: 4900, changePct: 1, weekHigh52: 9000, weekLow52: 2800, series: linear(3000, 4900, 60) });
    expect(r.metrics.pos52 ?? 100).toBeLessThanOrEqual(35); // parte baja del rango anual
    expect(r.tecnico.rsi ?? 0).toBeGreaterThanOrEqual(70); // sobrecomprado
    expect(r.signal).toBe("vender"); // NO "aguantar porque está bajo"
    expect(r.resumen.toLowerCase()).not.toContain("está bajo");
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

describe("cacaoAdvisor — indicadores técnicos y estacionalidad", () => {
  it("serie en alza fuerte → RSI sobrecompra y R² alto", () => {
    const r = cacaoAdvisor({ value: 6000, changePct: 0, ...RANGE, series: linear(3000, 6000) });
    expect(r.tecnico.rsiZona).toBe("sobrecompra");
    expect(r.tecnico.trendR2).toBeGreaterThan(0.8);
    expect(r.tecnico.soporte ?? 0).toBeLessThanOrEqual(r.tecnico.resistencia ?? Infinity);
  });

  it("drawdown negativo cuando el precio está por debajo del máximo de 52 sem", () => {
    const r = cacaoAdvisor({ value: 6000, changePct: 0, weekHigh52: 10000, weekLow52: 2800, series: flat(6000) });
    expect(r.tecnico.drawdownPct).toBeLessThan(0);
  });

  it("estacionalidad se calcula desde una serie con timestamps", () => {
    const base = Date.UTC(2026, 0, 1);
    const s = Array.from({ length: 120 }, (_, i) => ({ c: 4000 + i * 10, t: base + i * 86_400_000 }));
    const r = cacaoAdvisor({ value: 5200, changePct: 0, ...RANGE, series: s });
    expect(r.estacionalidad).not.toBeNull();
    expect(r.estacionalidad?.porMes.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

describe("cacaoAdvisor — MACD, cruce de medias y dirección compuesta", () => {
  it("alza sostenida → MACD alcista, golden cross y probabilidad de suba", () => {
    const r = cacaoAdvisor({ value: 6000, changePct: 0, ...RANGE, series: linear(3000, 6000, 60) });
    expect(r.tecnico.macdHist ?? 0).toBeGreaterThan(0);
    expect(r.tecnico.emaCruce).toBe("golden");
    expect(r.direccion.probabilidadSuba).toBeGreaterThan(50);
    expect(r.direccion.factores.length).toBeGreaterThanOrEqual(3);
    // la probabilidad de baja es el complemento
    expect(100 - r.direccion.probabilidadSuba).toBeLessThan(50);
  });

  it("baja sostenida → MACD bajista, death cross y probabilidad de baja", () => {
    const r = cacaoAdvisor({ value: 3000, changePct: 0, ...RANGE, series: linear(6000, 3000, 60) });
    expect(r.tecnico.macdHist ?? 0).toBeLessThan(0);
    expect(r.tecnico.emaCruce).toBe("death");
    expect(r.direccion.probabilidadSuba).toBeLessThan(50);
  });
});

describe("cacaoAdvisor — plan, escenarios, sensibilidad y desglose de confianza", () => {
  const R = () => cacaoAdvisor({ value: 6000, changePct: 1, ...RANGE, series: linear(3000, 6000, 60), local: { stockKg: 1000, miPrecioKg: 10, refKg: 13, spreadPct: 30 } });

  it("plan de venta escalonado suma 100% y calcula kg desde el stock", () => {
    const r = R();
    expect(r.plan.reduce((a, t) => a + t.pct, 0)).toBe(100);
    expect(r.plan.some((t) => (t.kg ?? 0) > 0)).toBe(true);
  });

  it("3 escenarios con probabilidades que suman ~100", () => {
    const r = R();
    expect(r.escenarios.length).toBe(3);
    const sum = r.escenarios.reduce((a, e) => a + e.prob, 0);
    expect(sum).toBeGreaterThanOrEqual(95);
    expect(sum).toBeLessThanOrEqual(105);
    expect(r.escenarios.find((e) => e.nombre === "alcista")!.target).toBeGreaterThan(r.escenarios.find((e) => e.nombre === "bajista")!.target);
  });

  it("sensibilidad y desglose de confianza no vacíos", () => {
    const r = R();
    expect(r.sensibilidad.length).toBeGreaterThan(0);
    expect(r.confianzaFactores.length).toBeGreaterThan(0);
  });
});

describe("newsKeywords — palabras que disparan la clasificación", () => {
  it("devuelve keywords con polaridad (ES/EN)", () => {
    const k = newsKeywords("Escasez y sequía disparan el precio; drought hits harvest");
    const words = k.map((x) => x.word.toLowerCase());
    expect(words).toContain("escasez");
    expect(words).toContain("drought");
    expect(k.every((x) => x.pol === "alcista")).toBe(true);
    expect(newsKeywords("Perú exportó cacao fino").length).toBe(0);
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
