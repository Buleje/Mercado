import { describe, expect, it } from "vitest";
import { evaluarColor, armarIndicadores, rangoDePeriodo, textoRegla, type CifrasSemaforo } from "@/lib/semaforo/evaluar";
import { normalizarConfig, configDeFlags, mezclarConfig } from "@/lib/semaforo/config";

const BASE: CifrasSemaforo = {
  pedidos: 6,
  ventas: 600,
  costo: 330,
  costoEstimado: 0,
  gastos: 60,
  anuncios: 60,
  clientesNuevos: 3,
  recompra: { clientes: 10, volvieron: 2, desde: "2026-07-23" },
  productosA: { conStock: 10, agotados: 1, nombres: ["Shampoo"] },
  vencidosDanados: 0,
  stock: { valorCosto: 2700, productosConStock: 20 },
  sinRotar: { n: 0, nombres: [] },
  acumulado: null,
};
const P = { desde: "2026-10-14", hasta: "2026-10-20", hoy: "2026-10-20" };

/** Umbrales del manual de Musa (§21 y §7). */
const MUSA = normalizarConfig({
  lanzamiento: "2026-11-09",
  decision: { fecha: "2027-01-10", verde: 1700, amarillo: 800, rojoSiRecompraMenorA: 10 },
  indicadores: {
    pedidos_semana: { verde: 8, amarillo: 5 },
    ticket_promedio: { verde: 100, amarillo: 80 },
    ganancia_neta: { verde: 38, amarillo: 30 },
    costo_cliente_nuevo: { verde: 15, amarillo: 30 },
    caja: { verde: 400, amarillo: 400, acciones: { rojo: "Parar gastos no urgentes; solo recomprar productos A" } },
  },
});

const de = (id: string, ind = armarIndicadores(BASE, MUSA, P)) => ind.find((i) => i.id === id);

describe("evaluarColor", () => {
  it("mayor: 8/5 → verde, amarillo, rojo en los bordes", () => {
    const u = { verde: 8, amarillo: 5 };
    expect(evaluarColor(8, u, "mayor").color).toBe("verde");
    expect(evaluarColor(5, u, "mayor").color).toBe("amarillo");
    expect(evaluarColor(4.99, u, "mayor").color).toBe("rojo");
  });
  it("menor: agotados 0/1 → 0 verde, 1 amarillo, 2 rojo", () => {
    const u = { verde: 0, amarillo: 1 };
    expect(evaluarColor(0, u, "menor").color).toBe("verde");
    expect(evaluarColor(1, u, "menor").color).toBe("amarillo");
    expect(evaluarColor(2, u, "menor").color).toBe("rojo");
  });
  it("rango: días de stock 30-45 verde, 60 amarillo, 61 rojo, 20 amarillo «bajo»", () => {
    const u = { verde: 30, verdeHasta: 45, amarillo: 60 };
    expect(evaluarColor(45, u, "rango")).toEqual({ color: "verde", tramo: "verde" });
    expect(evaluarColor(60, u, "rango")).toEqual({ color: "amarillo", tramo: "amarillo" });
    expect(evaluarColor(61, u, "rango")).toEqual({ color: "rojo", tramo: "rojo" });
    expect(evaluarColor(20, u, "rango")).toEqual({ color: "amarillo", tramo: "bajo" });
  });
  it("sin umbral → sin_meta; sin valor → sin_dato", () => {
    expect(evaluarColor(10, { verde: null, amarillo: 5 }, "mayor").color).toBe("sin_meta");
    expect(evaluarColor(null, { verde: 8, amarillo: 5 }, "mayor").color).toBe("sin_dato");
  });
});

describe("armarIndicadores con los umbrales del manual", () => {
  it("6 pedidos en 7 días = amarillo; ticket S/ 100 = verde; ganancia 35 % = amarillo", () => {
    expect(de("pedidos_semana")).toMatchObject({ valor: 6, color: "amarillo" });
    expect(de("ticket_promedio")).toMatchObject({ valor: 100, color: "verde" });
    expect(de("ganancia_neta")).toMatchObject({ valor: 35, color: "amarillo" });
  });
  it("el rojo trae la frase del manual cargada; recompra 20 % amarilla", () => {
    expect(de("recompra")).toMatchObject({ valor: 20, color: "amarillo" });
    const cfg = normalizarConfig({
      cajaAnotada: { monto: 350, fecha: "2026-10-19" },
      indicadores: { caja: { verde: 400, amarillo: 400, acciones: { rojo: "Parar gastos no urgentes" } } },
    });
    expect(de("caja", armarIndicadores(BASE, cfg, P))).toMatchObject({ valor: 350, color: "rojo", queHacer: "Parar gastos no urgentes" });
  });
  it("días de stock = 2.700 ÷ (330 ÷ 7) ≈ 57 → amarillo", () => {
    expect(de("dias_stock")).toMatchObject({ valor: 57, color: "amarillo" });
  });
  it("costo por cliente nuevo 60 ÷ 3 = 20 → amarillo; sin anuncios = sin dato con el porqué", () => {
    expect(de("costo_cliente_nuevo")).toMatchObject({ valor: 20, color: "amarillo" });
    const sin = armarIndicadores({ ...BASE, anuncios: 0 }, MUSA, P);
    expect(de("costo_cliente_nuevo", sin)?.color).toBe("sin_dato");
    expect(de("costo_cliente_nuevo", sin)?.queHacer).toMatch(/Marketing/);
  });
  it("un negocio sin config: pedidos y ticket en gris «sin meta», agotados con color", () => {
    const ind = armarIndicadores(BASE, normalizarConfig(undefined), P);
    expect(de("pedidos_semana", ind)?.color).toBe("sin_meta");
    expect(de("productos_a_agotados", ind)?.color).toBe("amarillo");
    expect(ind.some((i) => i.id === "ganancia_acumulada")).toBe(false);
  });
  it("ganancia acumulada: a mitad de camino compara con el ritmo; rojo sólo con recompra < 10 %", () => {
    const cifras = { ...BASE, acumulado: { ventas: 1000, costo: 600, gastos: 100 } };
    const p = { desde: "2026-12-04", hasta: "2026-12-10", hoy: "2026-12-10" };
    const ac = de("ganancia_acumulada", armarIndicadores(cifras, MUSA, p));
    // 32 de 63 días → verde desde ≈ 863, amarillo desde ≈ 406; 300 < 406 pero recompra 20 % → amarillo.
    expect(ac?.valor).toBe(300);
    expect(ac?.color).toBe("amarillo");
    const sinVuelta = { ...cifras, recompra: { clientes: 20, volvieron: 1, desde: "2026-11-09" } };
    expect(de("ganancia_acumulada", armarIndicadores(sinVuelta, MUSA, p))?.color).toBe("rojo");
  });
  it("apagar un indicador lo saca de la lista", () => {
    const cfg = normalizarConfig({ indicadores: { sin_rotar: { apagado: true } } });
    expect(armarIndicadores(BASE, cfg, P).some((i) => i.id === "sin_rotar")).toBe(false);
  });
});

describe("config", () => {
  it("un JSON roto vuelve a los defectos y se marca inválido", () => {
    const cfg = configDeFlags({ semaforo: { lanzamiento: "9 de noviembre" } });
    expect(cfg.invalida).toBe(true);
    expect(cfg.lanzamiento).toBeNull();
    expect(cfg.indicadores.recompra.verde).toBe(25);
  });
  it("null borra la meta a propósito; undefined deja el defecto", () => {
    const cfg = normalizarConfig({ indicadores: { recompra: { verde: null } } });
    expect(cfg.indicadores.recompra.verde).toBeNull();
    expect(cfg.indicadores.recompra.amarillo).toBe(15);
  });
  it("mezclar cambia un indicador sin borrar los otros", () => {
    const m = mezclarConfig({ indicadores: { caja: { verde: 400, amarillo: 400 } } }, { indicadores: { ticket_promedio: { verde: 90 } } });
    expect(m.indicadores?.caja?.verde).toBe(400);
    expect(m.indicadores?.ticket_promedio?.verde).toBe(90);
  });
  it("categorías de anuncios en minúscula, con defecto", () => {
    expect(normalizarConfig({}).categoriasAnuncios).toContain("marketing");
    expect(normalizarConfig({ categoriasAnuncios: ["Publicidad"] }).categoriasAnuncios).toEqual(["publicidad"]);
  });
});

describe("períodos y texto", () => {
  it("semana = 7 días; desde el lanzamiento futuro cae a 90 días", () => {
    expect(rangoDePeriodo("semana", "2026-10-20", null)).toEqual({ desde: "2026-10-14", hasta: "2026-10-20" });
    expect(rangoDePeriodo("lanzamiento", "2026-10-20", "2026-11-09").desde).toBe("2026-07-23");
    expect(rangoDePeriodo("lanzamiento", "2026-12-01", "2026-11-09").desde).toBe("2026-11-09");
  });
  it("texto de la regla en soles y en rango", () => {
    expect(textoRegla({ verde: 100, amarillo: 80 }, "mayor", "soles")).toBe("Verde S/ 100 o más · Amarillo desde S/ 80 · Rojo menos de S/ 80");
    expect(textoRegla({ verde: 30, verdeHasta: 45, amarillo: 60 }, "rango", "dias")).toMatch(/^Verde 30 a 45 días · Amarillo hasta 60 días/);
  });
});
