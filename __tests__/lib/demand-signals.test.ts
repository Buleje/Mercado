import { describe, it, expect } from "vitest";
import {
  buildDemandReport,
  type DemandInput,
  type DemandReport,
} from "@/lib/intelligence/demand-signals";

// "Ahora" fijo para determinismo: 17 jun 2026, 12:00 UTC.
const NOW = new Date("2026-06-17T12:00:00Z").getTime();
const PERIOD_DAYS = 30;
const PERIOD_LABEL = "Últimos 30 días";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkInput(partial: Partial<DemandInput> = {}): DemandInput {
  return {
    categories: partial.categories ?? [],
    zones: partial.zones ?? [],
    stockouts: partial.stockouts ?? [],
  };
}

function run(partial: Partial<DemandInput> = {}): DemandReport {
  return buildDemandReport(mkInput(partial), NOW, PERIOD_DAYS, PERIOD_LABEL);
}

// ─── generatedAt / period ─────────────────────────────────────────────────────

describe("generatedAt y period", () => {
  it("generatedAt coincide con el timestamp NOW en ISO", () => {
    const report = run();
    expect(report.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it("period refleja el label y los días pasados", () => {
    const report = run();
    expect(report.period).toEqual({ label: PERIOD_LABEL, days: PERIOD_DAYS });
  });
});

// ─── totalUnits ────────────────────────────────────────────────────────────────

describe("totalUnits", () => {
  it("suma las units de TODAS las categorías (rising + falling)", () => {
    const report = run({
      categories: [
        { category: "Bebidas", units: 150, prevUnits: 100 }, // rising
        { category: "Snacks", units: 80, prevUnits: 90 }, // falling
        { category: "Lácteos", units: 0, prevUnits: 50 }, // cae a cero
      ],
    });
    expect(report.totalUnits).toBe(230);
  });

  it("totalUnits es 0 cuando no hay categorías", () => {
    expect(run().totalUnits).toBe(0);
  });
});

// ─── risingCategories ─────────────────────────────────────────────────────────

describe("risingCategories", () => {
  it("categoría que sube aparece en rising con trendPct correcto (+50%)", () => {
    const report = run({
      categories: [{ category: "Bebidas", units: 150, prevUnits: 100 }],
    });
    expect(report.risingCategories).toHaveLength(1);
    const c = report.risingCategories[0];
    expect(c.category).toBe("Bebidas");
    expect(c.trendPct).toBe(50);
    expect(c.rising).toBe(true);
  });

  it("risingCategories se ordenan por trendPct desc", () => {
    const report = run({
      categories: [
        { category: "Bebidas", units: 150, prevUnits: 100 }, // +50%
        { category: "Pan", units: 200, prevUnits: 100 }, // +100%
        { category: "Arroz", units: 110, prevUnits: 100 }, // +10%
      ],
    });
    const pcts = report.risingCategories.map((c) => c.trendPct);
    expect(pcts).toEqual([100, 50, 10]);
  });

  it("categoría con trendPct = 0 (units === prevUnits) NO está en rising", () => {
    const report = run({
      categories: [{ category: "Sal", units: 100, prevUnits: 100 }],
    });
    expect(report.risingCategories).toHaveLength(0);
    // cae en fallingCategories (RISING_THRESHOLD = 0, rising = pct > 0)
    expect(report.fallingCategories).toHaveLength(1);
  });

  it("categoría con units = 0 y prevUnits = 0 → trendPct=0, NO en rising", () => {
    const report = run({
      categories: [{ category: "Vacío", units: 0, prevUnits: 0 }],
    });
    expect(report.risingCategories).toHaveLength(0);
  });
});

// ─── fallingCategories ────────────────────────────────────────────────────────

describe("fallingCategories", () => {
  it("categoría que baja aparece en falling con trendPct negativo (-20%)", () => {
    const report = run({
      categories: [{ category: "Snacks", units: 80, prevUnits: 100 }],
    });
    expect(report.fallingCategories).toHaveLength(1);
    const c = report.fallingCategories[0];
    expect(c.category).toBe("Snacks");
    expect(c.trendPct).toBe(-20);
    expect(c.rising).toBe(false);
  });

  it("fallingCategories se ordenan por trendPct asc (peor caída primero)", () => {
    const report = run({
      categories: [
        { category: "Snacks", units: 80, prevUnits: 100 }, // -20%
        { category: "Dulces", units: 10, prevUnits: 100 }, // -90%
        { category: "Refrescos", units: 70, prevUnits: 100 }, // -30%
      ],
    });
    const pcts = report.fallingCategories.map((c) => c.trendPct);
    expect(pcts).toEqual([-90, -30, -20]);
  });
});

// ─── trendPct con prevUnits = 0 ───────────────────────────────────────────────

describe("trendPct con prevUnits = 0", () => {
  it("units > 0 y prevUnits = 0 → trendPct = 100 (sin división por cero)", () => {
    const report = run({
      categories: [{ category: "Nueva", units: 50, prevUnits: 0 }],
    });
    const c = report.risingCategories[0];
    expect(c.trendPct).toBe(100);
    expect(c.rising).toBe(true);
  });

  it("units = 0 y prevUnits = 0 → trendPct = 0, no en rising", () => {
    const report = run({
      categories: [{ category: "Muerta", units: 0, prevUnits: 0 }],
    });
    expect(report.risingCategories).toHaveLength(0);
    expect(report.fallingCategories[0].trendPct).toBe(0);
  });
});

// ─── unmetDemand ──────────────────────────────────────────────────────────────

describe("unmetDemand", () => {
  it("categoría que SUBE y tiene stockout aparece en unmetDemand con stockoutCount = suma tenantCount", () => {
    const report = run({
      categories: [{ category: "Bebidas", units: 150, prevUnits: 100 }],
      stockouts: [
        { name: "Inca Kola 1.5L", category: "Bebidas", tenantCount: 3 },
        { name: "Sprite 1L", category: "Bebidas", tenantCount: 2 },
      ],
    });
    expect(report.unmetDemand).toHaveLength(1);
    const u = report.unmetDemand[0];
    expect(u.category).toBe("Bebidas");
    expect(u.trendPct).toBe(50);
    expect(u.stockoutCount).toBe(5); // 3 + 2
  });

  it("categoría que SUBE sin stockout NO aparece en unmetDemand", () => {
    const report = run({
      categories: [{ category: "Pan", units: 200, prevUnits: 100 }],
      stockouts: [{ name: "Coca-Cola 3L", category: "Bebidas", tenantCount: 4 }],
    });
    expect(report.unmetDemand).toHaveLength(0);
  });

  it("categoría que BAJA aunque tenga stockout NO aparece en unmetDemand", () => {
    const report = run({
      categories: [{ category: "Snacks", units: 80, prevUnits: 100 }],
      stockouts: [{ name: "Papas fritas", category: "Snacks", tenantCount: 5 }],
    });
    expect(report.unmetDemand).toHaveLength(0);
  });

  it("stockout con category null se ignora para el cálculo de unmetDemand", () => {
    const report = run({
      categories: [{ category: "Bebidas", units: 150, prevUnits: 100 }],
      stockouts: [
        { name: "Producto sin cat", category: null, tenantCount: 10 },
      ],
    });
    expect(report.unmetDemand).toHaveLength(0);
  });

  it("unmetDemand ordenado por trendPct desc cuando hay múltiples categorías", () => {
    const report = run({
      categories: [
        { category: "Bebidas", units: 150, prevUnits: 100 }, // +50%
        { category: "Pan", units: 200, prevUnits: 100 }, // +100%
      ],
      stockouts: [
        { name: "Inca Kola", category: "Bebidas", tenantCount: 3 },
        { name: "Bimbo", category: "Pan", tenantCount: 1 },
      ],
    });
    expect(report.unmetDemand[0].category).toBe("Pan"); // +100% primero
    expect(report.unmetDemand[1].category).toBe("Bebidas"); // +50% segundo
  });
});

// ─── stockoutHotspots ─────────────────────────────────────────────────────────

describe("stockoutHotspots", () => {
  it("se ordenan por tenantCount desc", () => {
    const report = run({
      stockouts: [
        { name: "Producto A", category: "X", tenantCount: 2 },
        { name: "Producto B", category: "Y", tenantCount: 8 },
        { name: "Producto C", category: "Z", tenantCount: 5 },
      ],
    });
    const counts = report.stockoutHotspots.map((s) => s.tenantCount);
    expect(counts).toEqual([8, 5, 2]);
  });

  it("stockoutHotspots vacío cuando no hay stockouts", () => {
    expect(run().stockoutHotspots).toHaveLength(0);
  });

  it("stockout con category null se incluye en hotspots", () => {
    const report = run({
      stockouts: [{ name: "Sin categoría", category: null, tenantCount: 7 }],
    });
    expect(report.stockoutHotspots).toHaveLength(1);
    expect(report.stockoutHotspots[0].category).toBeNull();
  });
});

// ─── byZone ───────────────────────────────────────────────────────────────────

describe("byZone", () => {
  it("se ordenan por units desc", () => {
    const report = run({
      zones: [
        { zone: "Sur", units: 300, categoryUnits: [], stockouts: 0 },
        { zone: "Norte", units: 500, categoryUnits: [], stockouts: 1 },
        { zone: "Centro", units: 200, categoryUnits: [], stockouts: 0 },
      ],
    });
    const order = report.byZone.map((z) => z.zone);
    expect(order).toEqual(["Norte", "Sur", "Centro"]);
  });

  it("topCategory = categoría con más units de la zona", () => {
    const report = run({
      zones: [
        {
          zone: "Norte",
          units: 500,
          categoryUnits: [
            { category: "Bebidas", units: 200 },
            { category: "Pan", units: 250 },
            { category: "Snacks", units: 50 },
          ],
          stockouts: 0,
        },
      ],
    });
    expect(report.byZone[0].topCategory).toBe("Pan");
  });

  it("zona sin categorías → topCategory = null", () => {
    const report = run({
      zones: [{ zone: "Este", units: 100, categoryUnits: [], stockouts: 0 }],
    });
    expect(report.byZone[0].topCategory).toBeNull();
  });

  it("byZone hereda el conteo de stockouts de la zona", () => {
    const report = run({
      zones: [{ zone: "Oeste", units: 50, categoryUnits: [], stockouts: 7 }],
    });
    expect(report.byZone[0].stockouts).toBe(7);
  });

  it("byZone vacío cuando no hay zonas", () => {
    expect(run().byZone).toHaveLength(0);
  });
});

// ─── Integración (múltiples secciones juntas) ─────────────────────────────────

describe("integración — reporte completo", () => {
  it("separa correctamente rising, falling e unmet en un input mixto", () => {
    const report = run({
      categories: [
        { category: "Bebidas", units: 150, prevUnits: 100 }, // +50% → rising
        { category: "Pan", units: 200, prevUnits: 100 }, // +100% → rising
        { category: "Snacks", units: 40, prevUnits: 100 }, // -60% → falling
        { category: "Lácteos", units: 100, prevUnits: 100 }, // 0% → falling (threshold)
      ],
      stockouts: [
        { name: "Inca Kola", category: "Bebidas", tenantCount: 3 },
        { name: "Bimbo", category: "Pan", tenantCount: 1 },
      ],
      zones: [
        {
          zone: "Centro",
          units: 400,
          categoryUnits: [
            { category: "Bebidas", units: 200 },
            { category: "Pan", units: 150 },
          ],
          stockouts: 2,
        },
      ],
    });

    // totalUnits = 150 + 200 + 40 + 100
    expect(report.totalUnits).toBe(490);

    // rising: Pan (+100%) primero, luego Bebidas (+50%)
    expect(report.risingCategories.map((c) => c.category)).toEqual(["Pan", "Bebidas"]);

    // falling: Snacks (-60%) antes que Lácteos (0%)
    expect(report.fallingCategories.map((c) => c.category)).toEqual(["Snacks", "Lácteos"]);

    // unmet: ambas rising tienen stockout; Pan primero (+100%)
    expect(report.unmetDemand).toHaveLength(2);
    expect(report.unmetDemand[0].category).toBe("Pan");
    expect(report.unmetDemand[1].category).toBe("Bebidas");

    // byZone: única zona con topCategory = Bebidas (200 > 150)
    expect(report.byZone[0].zone).toBe("Centro");
    expect(report.byZone[0].topCategory).toBe("Bebidas");
  });
});
